import { getClients } from '@/lib/clients';
import { getConfig } from '@/lib/config';
import { parseCart, parseRequestKey, CommerceError } from '@/lib/input';
import { createCheckout } from '@/lib/checkout';
import { errorResponse, requireOrigin, withCors, readJson } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  let allowed: string[] = [];
  try {
    const { db, stripe, config } = getClients(); allowed = config.CHECKOUT_ALLOWED_ORIGINS;
    requireOrigin(request,allowed);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new CommerceError(415,'Use application/json.');
    const items = parseCart(await readJson(request)); const key = parseRequestKey(request.headers.get('idempotency-key'));
    return withCors(Response.json(await createCheckout(items,key,db,stripe,config)),request,allowed);
  } catch (error) { return withCors(errorResponse(error),request,allowed); }
}
export async function OPTIONS(request: Request) {
  try { const allowed = getConfig().CHECKOUT_ALLOWED_ORIGINS; requireOrigin(request,allowed); return withCors(new Response(null,{ status:204 }),request,allowed); }
  catch (error) { return errorResponse(error); }
}
