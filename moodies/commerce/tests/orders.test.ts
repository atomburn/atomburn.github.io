import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {getPublicOrder} from '../src/lib/orders';
import {orderToken,hash} from '../src/lib/tokens';
test('order lookup requires secret token, hashes it, and selects only customer-safe fields',async()=>{
 const token=orderToken('fixture','local-secret-at-least-32-characters');let calls=0;let ready=false;
 const db=createClient('http://localhost:54321','fixture',{auth:{persistSession:false},global:{fetch:async(url)=>{
  calls++;const u=new URL(String(url));
  if(u.pathname.endsWith('/moodies_checkout_attempts')){
   assert.equal(u.searchParams.get('public_token_hash'),`eq.${hash(token)}`);assert.equal(u.searchParams.get('select'),'id');
   return Response.json([{id:'30000000-0000-4000-8000-000000000001'}]);
  }
  assert.ok(u.pathname.endsWith('/moodies_orders'));
  const select=u.searchParams.get('select')!;for(const forbidden of ['stripe_','customer_email','public_token_hash','inventory_shortfalls'])assert.ok(!select.includes(forbidden));
  assert.ok(!select.includes('*'));
  return Response.json(ready?[{order_number:1001,payment_status:'paid',items:[]}]:[]);
 }}});
 await assert.rejects(getPublicOrder('1001',db));assert.equal(calls,0);
 assert.equal(await getPublicOrder(token,db),null);ready=true;
 assert.equal((await getPublicOrder(token,db))?.payment_status,'paid');
});
