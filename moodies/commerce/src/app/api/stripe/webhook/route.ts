import { getClients } from '@/lib/clients';
import { processEvent } from '@/lib/webhook';
import { errorResponse, readText } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { db, stripe, config } = getClients();
    const signature = request.headers.get('stripe-signature');
    if (!signature) return Response.json({error:'Missing Stripe signature.'},{status:400});
    const body = await readText(request,1048576);
    let event;
    try { event = stripe.webhooks.constructEvent(body,signature,config.STRIPE_WEBHOOK_SECRET); }
    catch { return Response.json({error:'Invalid Stripe signature.'},{status:400}); }
    await processEvent(event,db,stripe,config);
    return Response.json({received:true});
  } catch (error) { return errorResponse(error); }
}
