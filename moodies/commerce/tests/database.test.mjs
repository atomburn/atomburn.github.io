import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const config=JSON.parse(process.env.MOODIES_TEST_DB);
const db=new pg.Client(config);await db.connect();
await db.query("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;");
await db.query(await readFile('supabase/migrations/202610050001_moodies_commerce.sql','utf8'));
const testMigration=await readFile('supabase/migrations/202610050002_moodies_test_schema.sql','utf8');
assert.ok(testMigration.endsWith((await readFile('supabase/migrations/202610050001_moodies_commerce.sql','utf8')).replaceAll('public.','moodies_test.')));
await db.query(testMigration);
const product='10000000-0000-4000-8000-000000000010',variant='10000000-0000-4000-8000-000000000020';
let serial=100;
async function reset(stock=10,policy='deny'){
 await db.query('truncate moodies_stripe_events,moodies_order_items,moodies_orders,moodies_checkout_attempts,moodies_product_variants,moodies_products restart identity cascade');
 await db.query("insert into moodies_products(id,slug,name,stripe_product_id) values($1,'rainbow-pack','Rainbow Pack','prod_rainbow')",[product]);
 await db.query("insert into moodies_product_variants(id,product_id,sku,name,stripe_price_id,inventory_quantity,inventory_policy) values($1,$2,'MOODIES-RAINBOW-PACK','Hot + Cool','price_rainbow',$3,$4)",[variant,product,stock,policy]);
}
async function attempt(quantity=2){
 const id=`10000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
 const snapshot={product_id:product,variant_id:variant,sku:'MOODIES-RAINBOW-PACK',product_name:'Rainbow Pack',variant_name:'Hot + Cool',quantity,unit_amount:1598,stripe_price_id:'price_rainbow'};
 await db.query('insert into moodies_checkout_attempts(id,cart_hash,public_token_hash,items,stripe_params) values($1,$2,$3,$4,$5)',[id,'a'.repeat(64),String(serial).padStart(64,'0'),JSON.stringify([snapshot]),'{}']);
 const order={attempt_id:id,stripe_checkout_session_id:`cs_test_${serial}`,stripe_payment_intent_id:`pi_${serial}`,stripe_customer_id:'cus_test',customer_email:'test@example.invalid',customer_name:'Test Buyer',shipping_address:{line1:'Test'},subtotal:1598*quantity,shipping_amount:500,tax_amount:100,discount_amount:200,total:1598*quantity+400,currency:'usd',payment_status:'paid'};
 return {order,items:[{...snapshot,subtotal_amount:1598*quantity,total_amount:1598*quantity-100}]};
}
async function apply(data,event='evt_'+(++serial),connection=db){return connection.query('select moodies_apply_checkout_event($1,$2,$3,$4)',[event,'checkout.session.completed',JSON.stringify(data.order),JSON.stringify(data.items)]);}
async function stock(){return (await db.query('select inventory_quantity from moodies_product_variants')).rows[0].inventory_quantity;}
async function refund(event,pi,amount){return db.query('select moodies_apply_refund($1,$2,$3)',[event,pi,amount]);}
async function parallel(data,events){return Promise.all(events.map(async event=>{const c=new pg.Client(config);await c.connect();try{return await apply(data,event,c);}finally{await c.end();}}));}

test('one paid order captures correct item snapshot, totals, inventory',async()=>{
 await reset();const data=await attempt();await apply(data);assert.equal(await stock(),8);
 const order=(await db.query('select * from moodies_orders')).rows[0];assert.equal(order.payment_status,'paid');assert.equal(order.fulfillment_status,'unfulfilled');assert.equal(Number(order.total),data.order.total);
 const item=(await db.query('select * from moodies_order_items')).rows[0];assert.equal(item.quantity,2);assert.equal(item.sku,'MOODIES-RAINBOW-PACK');assert.equal(Number(item.unit_amount),1598);
});
test('20 concurrent duplicate event deliveries create one order and decrement once',async()=>{
 await reset();const data=await attempt();await parallel(data,Array(20).fill('evt_duplicate'));
 assert.equal(await stock(),8);assert.equal((await db.query('select count(*) from moodies_orders')).rows[0].count,'1');assert.equal((await db.query('select count(*) from moodies_stripe_events')).rows[0].count,'1');
});
test('different concurrent events for one session also decrement once',async()=>{
 await reset();const data=await attempt();await parallel(data,Array.from({length:20},(_,i)=>`evt_different_${i}`));assert.equal(await stock(),8);assert.equal((await db.query('select count(*) from moodies_order_items')).rows[0].count,'1');
});
test('unpaid, failed and expired checkouts never decrement stock or become paid',async()=>{
 await reset();for(const state of ['pending','failed','cancelled']){const data=await attempt();data.order.payment_status=state;await apply(data);}assert.equal(await stock(),10);assert.equal((await db.query("select count(*) from moodies_orders where payment_status='paid'")).rows[0].count,'0');
});
test('pending async order becomes paid once; late failure cannot regress it',async()=>{
 await reset();const data=await attempt();data.order.payment_status='pending';await apply(data);data.order.payment_status='paid';await apply(data);data.order.payment_status='failed';await apply(data);assert.equal(await stock(),8);assert.equal((await db.query('select payment_status from moodies_orders')).rows[0].payment_status,'paid');
});
test('database exception rolls back event receipt and order; same event can retry',async()=>{
 await reset();const data=await attempt();const original=data.items[0].quantity;data.items[0].quantity=3;await assert.rejects(apply(data,'evt_retry'));assert.equal((await db.query('select count(*) from moodies_stripe_events')).rows[0].count,'0');assert.equal((await db.query('select count(*) from moodies_orders')).rows[0].count,'0');data.items[0].quantity=original;await apply(data,'evt_retry');assert.equal(await stock(),8);
});
test('two paid sessions can exhaust stock; shortage is saved on hold without negative inventory',async()=>{
 await reset(3);const first=await attempt(),second=await attempt();await Promise.all([apply(first),apply(second)]);assert.equal(await stock(),0);const orders=(await db.query("select fulfillment_status,inventory_shortfalls from moodies_orders where fulfillment_status='on_hold'")).rows;assert.equal(orders.length,1);assert.equal(orders[0].inventory_shortfalls[0].missing,1);
});
test('unlimited inventory remains unchanged on payment',async()=>{await reset(0,'unlimited');await apply(await attempt());assert.equal(await stock(),0);});
test('refunds are monotonic, idempotent, do not restock, and block unshipped orders',async()=>{
 await reset();const data=await attempt();await apply(data);await refund('evt_r1',data.order.stripe_payment_intent_id,100);await refund('evt_r1',data.order.stripe_payment_intent_id,100);await refund('evt_r2',data.order.stripe_payment_intent_id,50);assert.equal((await db.query('select refunded_amount from moodies_orders')).rows[0].refunded_amount,'100');await refund('evt_r3',data.order.stripe_payment_intent_id,data.order.total);const order=(await db.query('select * from moodies_orders')).rows[0];assert.equal(order.payment_status,'refunded');assert.equal(order.fulfillment_status,'on_hold');assert.equal(await stock(),8);
 await assert.rejects(db.query('select moodies_mark_shipped($1,$2,$3)',[order.order_number,'TEST','https://example.invalid/tracking']));
});
test('refund before paid event fails for retry and preserves event receipt availability',async()=>{
 await reset();const data=await attempt();await assert.rejects(refund('evt_early_refund',data.order.stripe_payment_intent_id,100));assert.equal((await db.query('select count(*) from moodies_stripe_events')).rows[0].count,'0');await apply(data);await refund('evt_early_refund',data.order.stripe_payment_intent_id,100);
});
test('fulfillment writes tracking once and duplicate mark shipped is safe',async()=>{
 await reset();await apply(await attempt());const order=(await db.query('select order_number from moodies_orders')).rows[0];for(let i=0;i<2;i++)await db.query('select moodies_mark_shipped($1,$2,$3)',[order.order_number,'TEST','https://example.invalid/tracking']);assert.equal((await db.query('select fulfillment_status from moodies_orders')).rows[0].fulfillment_status,'shipped');
 await assert.rejects(db.query('select moodies_mark_shipped($1,$2,$3)',[order.order_number,'OTHER','https://example.invalid/other']));
});
test('anonymous and customer roles cannot read PII/catalog tables or call privileged RPCs',async()=>{
 for(const role of ['anon','authenticated']){await db.query(`set role ${role}`);try{await assert.rejects(db.query('select * from moodies_orders'));await assert.rejects(db.query('select * from moodies_checkout_attempts'));await assert.rejects(db.query("select moodies_apply_refund('evt_attack','pi_fake',1)"));}finally{await db.query('reset role');}}
 const tables=(await db.query("select relname,relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relname in ('moodies_products','moodies_product_variants','moodies_orders','moodies_order_items','moodies_stripe_events','moodies_checkout_attempts')")).rows;assert.equal(tables.length,6);assert.ok(tables.every(t=>t.relrowsecurity));
});
test('test-mode payment touches only its own schema, with no anonymous access',async()=>{
 await reset();const data=await attempt();
 await db.query('insert into moodies_test.moodies_products select * from public.moodies_products');
 await db.query('insert into moodies_test.moodies_product_variants select * from public.moodies_product_variants');
 await db.query('insert into moodies_test.moodies_checkout_attempts select * from public.moodies_checkout_attempts');
 await db.query('select moodies_test.moodies_apply_checkout_event($1,$2,$3,$4)',['evt_test_schema','checkout.session.completed',JSON.stringify(data.order),JSON.stringify(data.items)]);
 assert.equal(await stock(),10);assert.equal((await db.query('select count(*) from public.moodies_orders')).rows[0].count,'0');
 assert.equal((await db.query('select inventory_quantity from moodies_test.moodies_product_variants')).rows[0].inventory_quantity,8);
 assert.equal((await db.query('select count(*) from moodies_test.moodies_orders')).rows[0].count,'1');
 await db.query('set role anon');try{await assert.rejects(db.query('select * from moodies_test.moodies_orders'));await assert.rejects(db.query("select moodies_test.moodies_apply_refund('evt_attack','pi_fake',1)"));}finally{await db.query('reset role');}
});
test.after(async()=>{await db.end();});
