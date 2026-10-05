import type Stripe from 'stripe';
export type Variant = {
  id: string; product_id: string; sku: string; name: string; stripe_price_id: string;
  inventory_quantity: number; inventory_policy: 'deny' | 'unlimited'; active: boolean;
  products: { name: string; active: boolean; stripe_product_id: string };
};
export type ItemSnapshot = {
  product_id: string; variant_id: string; sku: string; product_name: string; variant_name: string;
  quantity: number; stripe_price_id: string; unit_amount: number;
};
export type Attempt = {
  id: string; cart_hash: string; public_token_hash: string; items: ItemSnapshot[];
  stripe_params: Stripe.Checkout.SessionCreateParams; stripe_checkout_session_id: string | null; created_at: string;
};
