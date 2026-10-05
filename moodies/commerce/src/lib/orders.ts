import 'server-only';
import type { CommerceDatabase } from './clients';
import { hash } from './tokens';
import { CommerceError, validToken } from './input';
export async function getPublicOrder(token: string, db: CommerceDatabase) {
  if (!validToken(token)) throw new CommerceError(404,'Order not found.');
  const attempt = await db.from('moodies_checkout_attempts').select('id').eq('public_token_hash',hash(token)).maybeSingle();
  if (attempt.error) throw attempt.error;
  if (!attempt.data) throw new CommerceError(404,'Order not found.');
  const result = await db.from('moodies_orders').select('order_number,customer_name,shipping_address,subtotal,shipping_amount,tax_amount,discount_amount,total,currency,payment_status,fulfillment_status,order_status,tracking_number,tracking_url,refunded_amount,created_at,items:moodies_order_items(sku,product_name,variant_name,quantity,unit_amount,subtotal_amount,total_amount)').eq('checkout_attempt_id',attempt.data.id).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
