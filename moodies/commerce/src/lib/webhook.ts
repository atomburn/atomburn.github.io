import 'server-only';
import type Stripe from 'stripe';
import type { CommerceDatabase } from './clients';
import type { Attempt } from './types';
import type { Config } from './config';
const sessionEvents = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired']);
const idOf = (v: string | { id: string } | null) => typeof v === 'string' ? v : v?.id ?? null;
export function paymentState(session: Stripe.Checkout.Session, eventType: string) {
  if (session.status === 'complete' && (session.payment_status === 'paid' || (session.payment_status === 'no_payment_required' && session.amount_total === 0))) return 'paid';
  if (session.status === 'expired') return 'cancelled';
  if (eventType === 'checkout.session.async_payment_failed') return 'failed';
  return 'pending';
}
export function normalizeOrder(session: Stripe.Checkout.Session, lines: Stripe.LineItem[], attempt: Attempt, eventType: string) {
  if (session.metadata?.commerce !== 'moodies' || session.metadata.checkout_attempt_id !== attempt.id ||
      session.client_reference_id !== attempt.id || session.mode !== 'payment') throw new Error('Checkout metadata mismatch');
  if (lines.length !== attempt.items.length) throw new Error('Unexpected Checkout line items');
  const seen = new Set<string>();
  const items = lines.map(line => {
    const snapshot = attempt.items.find(i => i.stripe_price_id === line.price?.id);
    if (!snapshot || seen.has(snapshot.variant_id) || line.quantity !== snapshot.quantity || line.price?.unit_amount !== snapshot.unit_amount ||
        line.amount_subtotal !== snapshot.unit_amount * snapshot.quantity || line.currency !== session.currency) throw new Error('Checkout snapshot mismatch');
    seen.add(snapshot.variant_id);
    return { ...snapshot, subtotal_amount: line.amount_subtotal, total_amount: line.amount_total };
  });
  const amounts = [session.amount_subtotal,session.amount_total,session.total_details?.amount_shipping,session.total_details?.amount_tax,session.total_details?.amount_discount];
  if (amounts.some(v => v == null || !Number.isSafeInteger(v) || v < 0) ||
      items.reduce((sum, i) => sum + i.subtotal_amount, 0) !== session.amount_subtotal) throw new Error('Checkout totals missing or inconsistent');
  const shipping = session.collected_information?.shipping_details;
  if (paymentState(session,eventType) === 'paid' && (!shipping?.address || !session.customer_details?.email)) throw new Error('Paid physical order lacks delivery details');
  return { order: {
    attempt_id: attempt.id, stripe_checkout_session_id: session.id, stripe_payment_intent_id: idOf(session.payment_intent),
    stripe_customer_id: idOf(session.customer), customer_email: session.customer_details?.email ?? null,
    customer_name: shipping?.name ?? session.customer_details?.name ?? null, shipping_address: shipping?.address ?? null,
    subtotal: session.amount_subtotal, total: session.amount_total, shipping_amount: session.total_details!.amount_shipping,
    tax_amount: session.total_details!.amount_tax, discount_amount: session.total_details!.amount_discount,
    currency: session.currency, payment_status: paymentState(session,eventType),
  }, items };
}
export async function processEvent(event: Stripe.Event, db: CommerceDatabase, stripe: Stripe, config: Config): Promise<void> {
  if (event.livemode !== config.COMMERCE_LIVE_MODE) throw new Error('Webhook mode mismatch');
  if (!sessionEvents.has(event.type) && event.type !== 'charge.refunded') return;
  const processed = await db.from('moodies_stripe_events').select('stripe_event_id').eq('stripe_event_id',event.id).maybeSingle();
  if (processed.error) throw processed.error;
  if (processed.data) return;
  if (event.type === 'charge.refunded') {
    const charge = await stripe.charges.retrieve((event.data.object as Stripe.Charge).id);
    const paymentIntentId = idOf(charge.payment_intent);
    if (!paymentIntentId) return;
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.metadata.commerce !== 'moodies') return;
    if (charge.livemode !== config.COMMERCE_LIVE_MODE || intent.livemode !== config.COMMERCE_LIVE_MODE) throw new Error('Refund mode mismatch');
    const result = await db.rpc('moodies_apply_refund',{ p_event_id:event.id,p_payment_intent_id:paymentIntentId,p_refunded_amount:charge.amount_refunded });
    if (result.error) throw result.error;
    return;
  }
  const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
  if (session.metadata?.commerce !== 'moodies') return;
  if (session.livemode !== config.COMMERCE_LIVE_MODE || session.currency !== config.COMMERCE_CURRENCY) throw new Error('Session mode/currency mismatch');
  const found = await db.from('moodies_checkout_attempts').select('*').eq('id',session.metadata.checkout_attempt_id).single();
  if (found.error) throw found.error;
  const lines: Stripe.LineItem[] = [];
  for await (const line of stripe.checkout.sessions.listLineItems(session.id,{ limit:100 })) lines.push(line);
  const { order, items } = normalizeOrder(session,lines,found.data as Attempt,event.type);
  if (event.type === 'checkout.session.async_payment_succeeded' && order.payment_status !== 'paid') throw new Error('Payment confirmation is not available yet');
  const result = await db.rpc('moodies_apply_checkout_event',{ p_event_id:event.id,p_event_type:event.type,p_order:order,p_items:items });
  if (result.error) throw result.error;
}
