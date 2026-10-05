import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { createCheckout } from '../src/lib/checkout';
import { processEvent } from '../src/lib/webhook';
import type { Config } from '../src/lib/config';
import type { Attempt,Variant } from '../src/lib/types';

// Real Stripe/Supabase SDKs against local fixtures; no Stripe account or payment is claimed.
test('SDK checkout resolves trusted Prices and survives uncertainty; webhook retrieves authoritative Session',async()=>{
 const key='20000000-0000-4000-8000-000000000001';
 const config:Config={STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_URL:'http://localhost:54321',SUPABASE_SERVICE_ROLE_KEY:'fixture',ORDER_TOKEN_SECRET:'secret-for-local-test-at-least-32-characters',COMMERCE_LIVE_MODE:false,COMMERCE_CURRENCY:'usd',STOREFRONT_URL:'http://localhost:3000',ORDER_BASE_URL:'http://localhost:3000',CHECKOUT_ALLOWED_ORIGINS:['http://localhost:3000'],SHIPPING_ALLOWED_COUNTRIES:['US'],STRIPE_FREE_SHIPPING_RATE_ID:'shr_free',FREE_SHIPPING_THRESHOLD_MINOR:0,STRIPE_AUTOMATIC_TAX:false,STRIPE_ALLOW_PROMOTION_CODES:true};
 const variant:Variant={id:key,product_id:key,sku:'MOODIES-RAINBOW-PACK',name:'Hot + Cool',stripe_price_id:'price_rainbow',inventory_quantity:10,inventory_policy:'deny',active:true,products:{name:'Rainbow Pack',active:true,stripe_product_id:'prod_rainbow'}};
 const price={id:'price_rainbow',object:'price',active:true,type:'one_time',billing_scheme:'per_unit',unit_amount:1598,currency:'usd',livemode:false,product:{id:'prod_rainbow',object:'product',active:true}};
 let attempt:Attempt|null=null;let failBinding=true;let createCount=0;let shippingAmount=399;const bodies:string[]=[];const requestKeys:string[]=[];
 const rpcCalls:{name:string;body:Record<string,unknown>}[]=[];
 let session:Record<string,unknown>={id:'cs_test_fixture',object:'checkout.session',url:'https://checkout.stripe.com/c/pay/cs_test_fixture',status:'open',payment_status:'unpaid',mode:'payment',livemode:false};
 const lines=[{id:'li_test',object:'item',price,quantity:2,currency:'usd',amount_subtotal:3196,amount_total:3196}];
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  let value:unknown;
  const path=req.url?.split('?')[0];
  if(path==='/v1/prices/price_rainbow')value=price;
  else if(path==='/v1/shipping_rates/shr_free')value={id:'shr_free',object:'shipping_rate',active:true,livemode:false,type:'fixed_amount',fixed_amount:{amount:shippingAmount,currency:'usd'}};
  else if(path==='/v1/checkout/sessions' && req.method==='POST'){
   bodies.push(body);requestKeys.push(String(req.headers['idempotency-key']));
   if(createCount===0)createCount++;value=session;
  }else if(path==='/v1/checkout/sessions/cs_test_fixture')value=session;
  else if(path==='/v1/checkout/sessions/cs_test_fixture/line_items')value={object:'list',data:lines,has_more:false,url:path};
  else {res.writeHead(404);res.end('{}');return;}
  res.writeHead(200,{'content-type':'application/json','request-id':'req_fixture'});res.end(JSON.stringify(value));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');
 const stripe=new Stripe(config.STRIPE_SECRET_KEY,{host:'127.0.0.1',port:address.port,protocol:'http',maxNetworkRetries:0});
 const db=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false},global:{fetch:async(url,options)=>{
  const path=new URL(String(url)).pathname;const method=options?.method??'GET';const body=options?.body?JSON.parse(String(options.body)):null;
  let value:unknown=[];
  if(path.endsWith('/moodies_checkout_attempts')) {
   if(method==='POST'){attempt={...body,created_at:new Date().toISOString(),stripe_checkout_session_id:null};value=attempt;}
   else if(method==='PATCH'){
    if(failBinding){failBinding=false;return new Response(JSON.stringify({code:'XX000',message:'fixture binding failure'}),{status:500});}
    assert.ok(attempt);attempt.stripe_checkout_session_id=body.stripe_checkout_session_id;value=null;
   }else {
    const requestedKey=new URL(String(url)).searchParams.get('id')?.replace(/^eq\./,'');
    const record=attempt?.id===requestedKey?attempt:null;
    value=new Headers(options?.headers).get('accept')?.includes('vnd.pgrst.object')?record:(record?[record]:[]);
   }
  }else if(path.endsWith('/moodies_product_variants'))value=[variant];
  else if(path.endsWith('/moodies_stripe_events'))value=[];
  else if(path.includes('/rpc/')){rpcCalls.push({name:path.split('/').at(-1)!,body});value={duplicate:false};}
  else throw new Error(`Unexpected database request ${path}`);
  return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
 }}});
 try{
  await assert.rejects(createCheckout([{sku:variant.sku,quantity:2}],key,db,stripe,config),/Invalid Stripe Shipping Rate/);
  assert.equal(bodies.length,0);assert.equal(attempt,null);shippingAmount=0;
  await assert.rejects(createCheckout([{sku:variant.sku,quantity:2}],key,db,stripe,config));
  const result=await createCheckout([{sku:variant.sku,quantity:2}],key,db,stripe,config);
  assert.match(result.url,/checkout.stripe.com/);assert.equal(createCount,1);assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(requestKeys[0],requestKeys[1]);
  const sent=new URLSearchParams(bodies[0]);assert.equal(sent.get('line_items[0][price]'),'price_rainbow');assert.equal(sent.get('line_items[0][quantity]'),'2');assert.equal(sent.get('ui_mode'),'hosted_page');assert.equal(sent.get('shipping_options[0][shipping_rate]'),'shr_free');assert.equal(sent.get('automatic_tax[enabled]'),'false');assert.equal(sent.get('allow_promotion_codes'),'true');assert.equal(sent.get('metadata[commerce]'),'moodies');assert.ok(!bodies[0].includes('price_data'));
  await assert.rejects(createCheckout([{sku:variant.sku,quantity:1}],key,db,stripe,config));
  variant.inventory_quantity=0;await assert.rejects(createCheckout([{sku:variant.sku,quantity:1}],'20000000-0000-4000-8000-000000000002',db,stripe,config));
  variant.inventory_quantity=10;variant.active=false;await assert.rejects(createCheckout([{sku:variant.sku,quantity:1}],'20000000-0000-4000-8000-000000000003',db,stripe,config));
  variant.active=true;await assert.rejects(createCheckout([{sku:'UNKNOWN',quantity:1}],'20000000-0000-4000-8000-000000000004',db,stripe,config));
  session={...session,status:'complete',payment_status:'paid',url:null,currency:'usd',amount_subtotal:3196,amount_total:3196,total_details:{amount_shipping:0,amount_tax:0,amount_discount:0},metadata:{commerce:'moodies',checkout_attempt_id:key},client_reference_id:key,payment_intent:'pi_fixture',customer:'cus_fixture',customer_details:{email:'buyer@example.invalid'},collected_information:{shipping_details:{name:'Test Buyer',address:{line1:'Test St',country:'US'}}}};
  await processEvent({id:'evt_paid_fixture',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_fixture',payment_status:'unpaid'}}} as unknown as Stripe.Event,db,stripe,config);
  assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'moodies_apply_checkout_event');const order=rpcCalls[0].body.p_order as Record<string,unknown>;assert.equal(order.payment_status,'paid');assert.equal(order.total,3196);assert.equal(order.shipping_amount,0);assert.equal((rpcCalls[0].body.p_items as unknown[]).length,1);
  await assert.rejects(createCheckout([{sku:variant.sku,quantity:2}],key,db,stripe,config));
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
