import 'server-only';
import type { CommerceDatabase } from './clients';
import { z } from 'zod';
export async function listReadyOrders(db:CommerceDatabase) {
  const result = await db.from('moodies_orders').select('*,items:moodies_order_items(*)').eq('payment_status','paid').eq('fulfillment_status','unfulfilled').order('created_at').limit(100);
  if (result.error) throw result.error; return result.data;
}
const shipment = z.strictObject({orderNumber:z.number().int().positive().safe(),trackingNumber:z.string().trim().min(1).max(120),trackingUrl:z.url().refine(v=>v.startsWith('https://')),provider:z.string().min(1).max(80).default('manual'),shipmentId:z.string().max(200).optional()});
// Shippo integration can call this only after label purchase; never buy labels on webhook delivery.
export async function markShipped(db:CommerceDatabase,input:z.input<typeof shipment>) {
  const v=shipment.parse(input);
  const result=await db.rpc('moodies_mark_shipped',{p_order_number:v.orderNumber,p_tracking_number:v.trackingNumber,p_tracking_url:v.trackingUrl,p_provider:v.provider,p_shipment_id:v.shipmentId??null});
  if(result.error) throw result.error;
}
