import { notFound } from 'next/navigation';
import { getClients } from '@/lib/clients';
import { getPublicOrder } from '@/lib/orders';
import { CommerceError } from '@/lib/input';
import type Stripe from 'stripe';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function OrderPage({params}:{params:Promise<{token:string}>}) {
  const {token} = await params;
  const {db,config} = getClients();
  let order;
  try { order = await getPublicOrder(token,db); } catch(error) { if (error instanceof CommerceError && error.status === 404) notFound(); throw error; }
  const style = {maxWidth:640,margin:'60px auto',padding:24,fontFamily:'system-ui, sans-serif',lineHeight:1.6};
  if (!order) return <main style={style}><h1>Moodies</h1><h2>Confirming your order</h2><p>We’re waiting for payment confirmation. Refresh this page in a few moments.</p><a href="">Refresh order</a></main>;
  const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:order.currency}).format(n / 100);
  const address = order.shipping_address as Stripe.Address | null;
  const heading = order.payment_status === 'paid' ? (order.order_status === 'on_hold' ? 'Your order needs a stock check' : 'Thank you for your order') : 'Your order status';
  return <main style={style}><h1>Moodies</h1><h2>{heading}</h2><p>Order M-{order.order_number}</p>
    <p>Payment: {order.payment_status.replaceAll('_',' ')} · Fulfillment: {order.fulfillment_status.replaceAll('_',' ')}</p>
    <ul>{order.items.map(item => <li key={item.sku}>{item.quantity} × {item.product_name} ({item.variant_name}) — {money(item.total_amount)}</li>)}</ul>
    <dl>{[['Subtotal',order.subtotal],['Discount',-order.discount_amount],['Shipping',order.shipping_amount],['Tax',order.tax_amount],['Total',order.total],['Refunded',order.refunded_amount]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{money(value as number)}</dd></div>)}</dl>
    {address && <section><h3>Ship to</h3><p>{order.customer_name}<br/>{address.line1}<br/>{address.line2 ? <>{address.line2}<br/></> : null}{address.city}, {address.state} {address.postal_code}<br/>{address.country}</p></section>}
    {order.tracking_url?.startsWith('https://') && <p><a href={order.tracking_url} rel="noreferrer">Track shipment {order.tracking_number}</a></p>}
    <a href={config.STOREFRONT_URL}>Back to Moodies</a>
  </main>;
}
