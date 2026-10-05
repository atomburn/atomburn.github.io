import { getClients } from '@/lib/clients';
import { validatePrice } from '@/lib/checkout';
import { errorResponse } from '@/lib/http';
import type { Variant } from '@/lib/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const {db,stripe,config}=getClients();
    const catalog=await db.from('moodies_product_variants').select('*,products:moodies_products!inner(name,active,stripe_product_id)').eq('active',true).eq('products.active',true).order('sku').limit(100);
    if(catalog.error) throw catalog.error;
    const products=[];
    for(const variant of catalog.data as unknown as Variant[]) {
      const price=await stripe.prices.retrieve(variant.stripe_price_id,{expand:['product']});
      const unitAmount=validatePrice(price,variant,config);
      products.push({sku:variant.sku,name:variant.products.name,variantName:variant.name,unitAmount,currency:config.COMMERCE_CURRENCY,
        available:variant.inventory_policy==='unlimited'||variant.inventory_quantity>0,
        maxQuantity:variant.inventory_policy==='unlimited'?20:Math.min(20,variant.inventory_quantity)});
    }
    return Response.json({products},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {return errorResponse(error);}
}
