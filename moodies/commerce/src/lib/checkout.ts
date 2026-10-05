import 'server-only';
import type Stripe from 'stripe';
import type { CommerceDatabase } from './clients';
import type { Config } from './config';
import { CommerceError, type CartItem } from './input';
import { hash, orderToken } from './tokens';
import type { Attempt, ItemSnapshot, Variant } from './types';

export function validatePrice(price: Stripe.Price, variant: Variant, config: Config): number {
  const product = typeof price.product === 'string' ? null : price.product;
  if (!price.active || price.type !== 'one_time' || price.billing_scheme !== 'per_unit' || price.unit_amount === null ||
      price.currency !== config.COMMERCE_CURRENCY || price.livemode !== config.COMMERCE_LIVE_MODE || !product || product.deleted ||
      !product.active || product.id !== variant.products.stripe_product_id) throw new CommerceError(409, 'This product is unavailable.');
  if (!Number.isSafeInteger(price.unit_amount) || price.unit_amount < 0) throw new CommerceError(409, 'Unsupported product price.');
  return price.unit_amount;
}
export function chooseShipping(subtotal: number, config: Config): string {
  return config.FREE_SHIPPING_THRESHOLD_MINOR !== undefined && subtotal >= config.FREE_SHIPPING_THRESHOLD_MINOR
    ? config.STRIPE_FREE_SHIPPING_RATE_ID! : config.STRIPE_FLAT_SHIPPING_RATE_ID!;
}
export async function createCheckout(items: CartItem[], key: string, db: CommerceDatabase, stripe: Stripe, config: Config): Promise<{ url: string }> {
  const cartHash = hash(JSON.stringify(items));
  const token = orderToken(key, config.ORDER_TOKEN_SECRET);
  const found = await db.from('moodies_checkout_attempts').select('*').eq('id', key).maybeSingle();
  if (found.error) throw found.error;
  let attempt = found.data as Attempt | null;
  if (!attempt) {
    const catalog = await db.from('moodies_product_variants').select('*,products:moodies_products!inner(name,active,stripe_product_id)').in('sku', items.map(i => i.sku));
    if (catalog.error) throw catalog.error;
    const variants = catalog.data as unknown as Variant[];
    const snapshots: ItemSnapshot[] = [];
    for (const item of items) {
      const variant = variants.find(v => v.sku === item.sku);
      if (!variant || !variant.active || !variant.products.active) throw new CommerceError(409, 'This product is unavailable.');
      if (variant.inventory_policy === 'deny' && variant.inventory_quantity < item.quantity) throw new CommerceError(409, 'Requested quantity is unavailable.');
      const price = await stripe.prices.retrieve(variant.stripe_price_id, { expand: ['product'] });
      const unitAmount = validatePrice(price, variant, config);
      snapshots.push({ product_id: variant.product_id, variant_id: variant.id, sku: variant.sku, product_name: variant.products.name,
        variant_name: variant.name, quantity: item.quantity, stripe_price_id: variant.stripe_price_id, unit_amount: unitAmount });
    }
    const subtotal = snapshots.reduce((sum, i) => sum + i.unit_amount * i.quantity, 0);
    if (!Number.isSafeInteger(subtotal)) throw new CommerceError(409, 'Unsupported cart total.');
    const shippingId = chooseShipping(subtotal, config);
    const rate = await stripe.shippingRates.retrieve(shippingId);
    if (!rate.active || rate.livemode !== config.COMMERCE_LIVE_MODE || rate.type !== 'fixed_amount' ||
        rate.fixed_amount?.currency !== config.COMMERCE_CURRENCY ||
        (shippingId === config.STRIPE_FREE_SHIPPING_RATE_ID && rate.fixed_amount.amount !== 0)) throw new Error('Invalid Stripe Shipping Rate');
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', ui_mode: 'hosted_page', adaptive_pricing: { enabled: false },
      line_items: snapshots.map(i => ({ price: i.stripe_price_id, quantity: i.quantity })),
      allow_promotion_codes: config.STRIPE_ALLOW_PROMOTION_CODES, automatic_tax: { enabled: config.STRIPE_AUTOMATIC_TAX },
      billing_address_collection: 'auto', customer_creation: 'always',
      shipping_address_collection: { allowed_countries: config.SHIPPING_ALLOWED_COUNTRIES as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
      shipping_options: [{ shipping_rate: shippingId }],
      success_url: `${config.ORDER_BASE_URL}/order/${token}`, cancel_url: config.STOREFRONT_URL,
      metadata: { commerce: 'moodies', checkout_attempt_id: key }, client_reference_id: key,
      payment_intent_data: { metadata: { commerce: 'moodies', checkout_attempt_id: key } },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    const inserted = await db.from('moodies_checkout_attempts').insert({ id: key, cart_hash: cartHash, public_token_hash: hash(token), items: snapshots, stripe_params: params }).select('*').single();
    if (inserted.error?.code === '23505') {
      const winner = await db.from('moodies_checkout_attempts').select('*').eq('id', key).single();
      if (winner.error) throw winner.error;
      attempt = winner.data as Attempt;
    } else if (inserted.error) throw inserted.error;
    else attempt = inserted.data as Attempt;
  }
  if (attempt.cart_hash !== cartHash || attempt.public_token_hash !== hash(token)) throw new CommerceError(409, 'Use a new checkout key for a changed cart.');
  // Never retry an uncertain create after Stripe could have discarded its idempotency key.
  if (Date.now() - Date.parse(attempt.created_at) > 30 * 60 * 1000 && !attempt.stripe_checkout_session_id) throw new CommerceError(409, 'Checkout expired. Start a new checkout.');
  const session = attempt.stripe_checkout_session_id
    ? await stripe.checkout.sessions.retrieve(attempt.stripe_checkout_session_id)
    : await stripe.checkout.sessions.create(attempt.stripe_params, { idempotencyKey: `moodies-checkout:${key}` });
  if (session.status !== 'open' || !session.url) throw new CommerceError(409, 'Checkout is complete or expired. Start a new checkout.');
  const saved = await db.from('moodies_checkout_attempts').update({ stripe_checkout_session_id: session.id }).eq('id', key);
  if (saved.error) throw saved.error;
  return { url: session.url };
}
