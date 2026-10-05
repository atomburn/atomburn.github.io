import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { parseCart,parseRequestKey,validToken } from '../src/lib/input';
import { orderToken,hash } from '../src/lib/tokens';
import { getConfig } from '../src/lib/config';
import { getClients } from '../src/lib/clients';
import { validatePrice,chooseShipping } from '../src/lib/checkout';
import { normalizeOrder,paymentState } from '../src/lib/webhook';
import { POST as checkout } from '../src/app/api/checkout/route';
import { POST as webhook } from '../src/app/api/stripe/webhook/route';
import type { Attempt,Variant } from '../src/lib/types';
Object.assign(process.env,{
  STRIPE_SECRET_KEY:'sk_test_local_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture',SUPABASE_URL:'http://localhost:54321',SUPABASE_SERVICE_ROLE_KEY:'local-fixture',
  ORDER_TOKEN_SECRET:'local-test-secret-32-characters-minimum',COMMERCE_LIVE_MODE:'false',COMMERCE_CURRENCY:'usd',STOREFRONT_URL:'http://localhost:3000',ORDER_BASE_URL:'http://localhost:3000',
  CHECKOUT_ALLOWED_ORIGINS:'http://localhost:3000',STRIPE_FLAT_SHIPPING_RATE_ID:'shr_flat',STRIPE_FREE_SHIPPING_RATE_ID:'shr_free',FREE_SHIPPING_THRESHOLD_MINOR:'5000',STRIPE_AUTOMATIC_TAX:'false',STRIPE_ALLOW_PROMOTION_CODES:'true',
});
const config=getConfig();
const key='10000000-0000-4000-8000-000000000001';
const variant:Variant={id:key,product_id:key,sku:'MOODIES-RAINBOW-PACK',name:'Hot + Cool six-pack',stripe_price_id:'price_rainbow',active:true,inventory_quantity:10,inventory_policy:'deny',products:{name:'Rainbow Pack',active:true,stripe_product_id:'prod_rainbow'}};
const price={id:'price_rainbow',active:true,type:'one_time',billing_scheme:'per_unit',unit_amount:1598,currency:'usd',livemode:false,product:{id:'prod_rainbow',active:true}} as Stripe.Price;
const snapshot={variant_id:key,product_id:key,sku:variant.sku,product_name:'Rainbow Pack',variant_name:variant.name,quantity:2,stripe_price_id:price.id,unit_amount:1598};
const attempt={id:key,items:[snapshot]} as Attempt;
const session={id:'cs_test_local',mode:'payment',status:'complete',payment_status:'paid',client_reference_id:key,metadata:{commerce:'moodies',checkout_attempt_id:key},amount_subtotal:3196,amount_total:3650,currency:'usd',total_details:{amount_shipping:500,amount_tax:154,amount_discount:200},payment_intent:'pi_test',customer:'cus_test',customer_details:{email:'test@example.invalid',name:'Test Buyer'},collected_information:{shipping_details:{name:'Test Buyer',address:{line1:'123 Test St',city:'Test City',postal_code:'90210',state:'CA',country:'US'}}}} as unknown as Stripe.Checkout.Session;
const lines=[{id:'li_test',price,quantity:2,currency:'usd',amount_subtotal:3196,amount_total:3150}] as Stripe.LineItem[];

test('cart accepts identifiers and quantities; rejects price injection, duplicates, invalid quantities',()=>{
 assert.deepEqual(parseCart({items:[{sku:variant.sku,quantity:2}]}),[{sku:variant.sku,quantity:2}]);
 for(const payload of [{items:[{sku:variant.sku,quantity:2,price:1}]},{items:[{sku:variant.sku,quantity:1}],price:1},{items:[{sku:variant.sku,quantity:1},{sku:variant.sku,quantity:1}]},...[-1,0,1.5,21,'2'].map(quantity=>({items:[{sku:variant.sku,quantity}]}))]) assert.throws(()=>parseCart(payload));
 assert.equal(parseRequestKey(key),key);assert.throws(()=>parseRequestKey('x'));
});
test('Stripe trusted price must be active, fixed, one-time, correct product, currency and mode',()=>{
 assert.equal(validatePrice(price,variant,config),1598);
 for(const patch of [{active:false},{type:'recurring'},{billing_scheme:'tiered'},{unit_amount:null},{currency:'eur'},{livemode:true},{product:{id:'prod_other',active:true}},{product:{id:'prod_rainbow',active:false}}]) assert.throws(()=>validatePrice({...price,...patch} as Stripe.Price,variant,config));
 assert.equal(chooseShipping(4999,config),'shr_flat');assert.equal(chooseShipping(5000,config),'shr_free');
});
test('zero threshold gives every order free shipping without requiring a paid rate',()=>{
 const saved={STRIPE_FLAT_SHIPPING_RATE_ID:process.env.STRIPE_FLAT_SHIPPING_RATE_ID!,FREE_SHIPPING_THRESHOLD_MINOR:process.env.FREE_SHIPPING_THRESHOLD_MINOR!};
 try {
  process.env.STRIPE_FLAT_SHIPPING_RATE_ID='';process.env.FREE_SHIPPING_THRESHOLD_MINOR='0';
  const free=getConfig();assert.equal(free.STRIPE_FLAT_SHIPPING_RATE_ID,undefined);
  for(const subtotal of [0,1598,3196,100000])assert.equal(chooseShipping(subtotal,free),'shr_free');
  process.env.FREE_SHIPPING_THRESHOLD_MINOR='5000';assert.throws(()=>getConfig(),/flat shipping rate/);
  process.env.FREE_SHIPPING_THRESHOLD_MINOR='';assert.throws(()=>getConfig(),/both free shipping fields/);
  process.env.FREE_SHIPPING_THRESHOLD_MINOR='-1';assert.throws(()=>getConfig());
 }finally{Object.assign(process.env,saved);}
});
test('server database client keeps Stripe test mode in its separate Supabase schema',async()=>{
 const savedFetch=globalThis.fetch;const savedKey=process.env.STRIPE_SECRET_KEY;const savedMode=process.env.COMMERCE_LIVE_MODE;
 const origins={STOREFRONT_URL:process.env.STOREFRONT_URL,ORDER_BASE_URL:process.env.ORDER_BASE_URL,CHECKOUT_ALLOWED_ORIGINS:process.env.CHECKOUT_ALLOWED_ORIGINS};
 const profiles:string[]=[];
 globalThis.fetch=async(_url,options)=>{profiles.push(new Headers(options?.headers).get('accept-profile')!);return new Response('[]',{headers:{'content-type':'application/json'}});};
 try{
  await getClients().db.from('moodies_orders').select('order_number');
  process.env.STRIPE_SECRET_KEY='sk_live_local_fixture';process.env.COMMERCE_LIVE_MODE='true';
  Object.assign(process.env,{STOREFRONT_URL:'https://buymoodies.com',ORDER_BASE_URL:'https://buymoodies.com',CHECKOUT_ALLOWED_ORIGINS:'https://buymoodies.com'});
  await getClients().db.from('moodies_orders').select('order_number');
  assert.deepEqual(profiles,['moodies_test','public']);
 }finally{globalThis.fetch=savedFetch;process.env.STRIPE_SECRET_KEY=savedKey;process.env.COMMERCE_LIVE_MODE=savedMode;Object.assign(process.env,origins);}
});
test('unguessable public order tokens are deterministic for retry, different per checkout and hashed at rest',()=>{
 const token=orderToken(key,config.ORDER_TOKEN_SECRET); assert.equal(token.length,43);assert.ok(validToken(token));assert.equal(token,orderToken(key,config.ORDER_TOKEN_SECRET));
 assert.notEqual(token,orderToken('other',config.ORDER_TOKEN_SECRET)); assert.notEqual(hash(token),token);assert.equal(validToken('1001'),false);
});
test('order snapshots preserve Stripe totals and reject changed quantities, SKUs, prices or missing delivery data',()=>{
 const result=normalizeOrder(session,lines,attempt,'checkout.session.completed');
 assert.equal(result.order.total,3650);assert.equal(result.order.payment_status,'paid');assert.equal(result.items[0].quantity,2);assert.equal(result.items[0].total_amount,3150);
 for(const patch of [{quantity:3},{amount_subtotal:1},{price:{...price,id:'price_attacker'}},{price:{...price,unit_amount:1}}]) assert.throws(()=>normalizeOrder(session,[{...lines[0],...patch}] as Stripe.LineItem[],attempt,'checkout.session.completed'));
 assert.throws(()=>normalizeOrder({...session,collected_information:null},lines,attempt,'checkout.session.completed'));
});
test('incomplete/failed/expired checkouts never count as paid; 100 percent discount does',()=>{
 assert.equal(paymentState({...session,status:'open'},'checkout.session.completed'),'pending');
 assert.equal(paymentState({...session,payment_status:'unpaid'},'checkout.session.completed'),'pending');
 assert.equal(paymentState({...session,payment_status:'unpaid'},'checkout.session.async_payment_failed'),'failed');
 assert.equal(paymentState({...session,status:'expired',payment_status:'unpaid'},'checkout.session.expired'),'cancelled');
 assert.equal(paymentState({...session,payment_status:'no_payment_required',amount_total:0},'checkout.session.completed'),'paid');
 assert.equal(paymentState({...session,payment_status:'no_payment_required',amount_total:1},'checkout.session.completed'),'pending');
});
test('HTTP checkout rejects client amount, cross-origin traffic, invalid key and oversized bodies before network access',async()=>{
 const request=(payload:unknown,origin='http://localhost:3000',requestKey=key)=>new Request('http://localhost/api/checkout',{method:'POST',headers:{'content-type':'application/json',origin,'idempotency-key':requestKey},body:JSON.stringify(payload)});
 assert.equal((await checkout(request({items:[{sku:variant.sku,quantity:1,price:1}]}))).status,400);
 assert.equal((await checkout(request({items:[{sku:variant.sku,quantity:1}]},'https://attacker.invalid'))).status,403);
 assert.equal((await checkout(request({items:[{sku:variant.sku,quantity:1}]},undefined,'invalid'))).status,400);
 assert.equal((await checkout(request({padding:'x'.repeat(20000)}))).status,413);
});
test('webhook route verifies raw signature and timestamp; ignores unrelated historical events',async()=>{
 const stripe=new Stripe(config.STRIPE_SECRET_KEY);
 const payload=JSON.stringify({id:'evt_unrelated',object:'event',type:'customer.created',livemode:false,data:{object:{id:'cus_test'}}});
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:config.STRIPE_WEBHOOK_SECRET});
 const request=(body:string,sig:string)=>new Request('http://localhost/api/stripe/webhook',{method:'POST',headers:{'stripe-signature':sig},body});
 assert.equal((await webhook(request(payload,signature))).status,200);
 assert.equal((await webhook(request(payload+' ',signature))).status,400);
 const old=stripe.webhooks.generateTestHeaderString({payload,secret:config.STRIPE_WEBHOOK_SECRET,timestamp:1});
 assert.equal((await webhook(request(payload,old))).status,400);
});
