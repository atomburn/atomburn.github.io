import { loadEnvConfig } from '@next/env';
import { getClients } from '../src/lib/clients';
import { listReadyOrders,markShipped } from '../src/lib/fulfillment';
async function main() {
  loadEnvConfig(process.cwd());
  const {db}=getClients();
  const [command,...args]=process.argv.slice(2);
  if(command==='orders') {
    const result=await db.from('moodies_orders').select('order_number,created_at,customer_email,total,currency,payment_status,fulfillment_status,tracking_number').order('created_at',{ascending:false}).limit(100);
    if(result.error) throw result.error; console.table(result.data);
  } else if(command==='detail') {
    if(!/^\d+$/.test(args[0]??'')) throw new Error('Supply an order number.');
    const result=await db.from('moodies_orders').select('*,items:moodies_order_items(*)').eq('order_number',args[0]).single();
    if(result.error) throw result.error; console.log(JSON.stringify(result.data,null,2));
  } else if(command==='ready') console.log(JSON.stringify(await listReadyOrders(db),null,2));
  else if(command==='inventory') {
    const result=await db.from('moodies_product_variants').select('sku,name,active,inventory_quantity,inventory_policy');
    if(result.error) throw result.error; console.table(result.data);
  } else if(command==='stock') {
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(args[0]??'') || !/^\d+$/.test(args[1]??'') || Number(args[1])>2147483647) throw new Error('Supply SKU and verified stock count.');
    const result=await db.from('moodies_product_variants').update({inventory_quantity:Number(args[1])}).eq('sku',args[0]).select('sku,inventory_quantity').single();
    if(result.error) throw result.error;console.table([result.data]);
  } else if(command==='active') {
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(args[0]??'') || !['true','false'].includes(args[1])) throw new Error('Supply SKU and true/false.');
    const result=await db.from('moodies_product_variants').update({active:args[1]==='true'}).eq('sku',args[0]).select('sku,active').single();
    if(result.error) throw result.error;console.table([result.data]);
  } else if(command==='ship') {
    await markShipped(db,{orderNumber:Number(args[0]),trackingNumber:args[1],trackingUrl:args[2]}); console.log('Shipment recorded.');
  } else throw new Error('Usage: npm run ops -- orders|detail NUMBER|ready|inventory|stock SKU COUNT|active SKU true/false|ship NUMBER TRACKING HTTPS_URL');
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Commerce operation failed.");
  process.exitCode = 1;
});
