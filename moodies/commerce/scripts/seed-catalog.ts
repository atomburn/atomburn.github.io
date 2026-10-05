import { loadEnvConfig } from '@next/env';
import { getClients } from '../src/lib/clients';
async function main() {
  loadEnvConfig(process.cwd());
  const {db,stripe,config}=getClients();
  const priceId=process.env.MOODIES_RAINBOW_PRICE_ID;
  const stock=process.env.MOODIES_RAINBOW_INVENTORY;
  if (!priceId?.startsWith('price_') || !stock || !/^\d+$/.test(stock) || Number(stock)>2147483647) throw new Error('Set the verified Rainbow Pack Price ID and physical inventory count.');
  const price=await stripe.prices.retrieve(priceId,{expand:['product']});
  const product=typeof price.product==='string'?null:price.product;
  if (!product || product.deleted || !product.active || !price.active || price.type!=='one_time' || price.currency!==config.COMMERCE_CURRENCY || price.livemode!==config.COMMERCE_LIVE_MODE) throw new Error('Price is not valid for this environment.');
  // Never reset inventory on a rerun after purchases. This is an initial catalog insert only.
  const existing=await db.from('moodies_product_variants').select('id').eq('sku','MOODIES-RAINBOW-PACK').maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) throw new Error('SKU already exists. Use the inventory operation for deliberate stock changes.');
  const saved=await db.from('moodies_products').upsert({slug:'rainbow-pack',name:'Rainbow Pack',stripe_product_id:product.id,active:true},{onConflict:'slug'}).select('id').single();
  if(saved.error) throw saved.error;
  const variant=await db.from('moodies_product_variants').insert({product_id:saved.data.id,sku:'MOODIES-RAINBOW-PACK',name:'Hot + Cool six-pack',stripe_price_id:price.id,inventory_quantity:Number(stock),inventory_policy:'deny'});
  if(variant.error) throw variant.error;
  console.log('Seeded Rainbow Pack from the verified Stripe Price.');
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Commerce operation failed.");
  process.exitCode = 1;
});
