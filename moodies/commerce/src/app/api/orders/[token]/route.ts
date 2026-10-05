import { getClients } from '@/lib/clients';
import { getPublicOrder } from '@/lib/orders';
import { errorResponse } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: {params:Promise<{token:string}>}) {
  try {
    const { token } = await context.params;
    const order = await getPublicOrder(token,getClients().db);
    return Response.json(order ?? {status:'processing'},{status:order ? 200 : 202,headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return errorResponse(error); }
}
