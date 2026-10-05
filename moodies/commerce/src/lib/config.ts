import 'server-only';
import { z } from 'zod';
const bool = z.enum(['true', 'false']).transform(v => v === 'true');
const origin = z.url().refine(v => { const u = new URL(v); return u.origin === v && ['http:', 'https:'].includes(u.protocol); }, 'Use an origin without a path or trailing slash');
const schema = z.object({
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ORDER_TOKEN_SECRET: z.string().min(32),
  COMMERCE_LIVE_MODE: bool.default(false),
  COMMERCE_CURRENCY: z.string().regex(/^[a-z]{3}$/).default('usd'),
  STOREFRONT_URL: origin, ORDER_BASE_URL: origin,
  CHECKOUT_ALLOWED_ORIGINS: z.string().min(1).transform(s => s.split(',').map(v => origin.parse(v.trim()))),
  SHIPPING_ALLOWED_COUNTRIES: z.string().default('US').transform(s => s.split(',').map(v => v.trim())).pipe(z.array(z.string().regex(/^[A-Z]{2}$/)).min(1)),
  STRIPE_FLAT_SHIPPING_RATE_ID: z.preprocess(v => v === '' ? undefined : v, z.string().startsWith('shr_').optional()),
  STRIPE_FREE_SHIPPING_RATE_ID: z.preprocess(v => v === '' ? undefined : v, z.string().startsWith('shr_').optional()),
  FREE_SHIPPING_THRESHOLD_MINOR: z.preprocess(v => v === '' ? undefined : v, z.coerce.number().int().nonnegative().safe().optional()),
  STRIPE_AUTOMATIC_TAX: bool.default(false), STRIPE_ALLOW_PROMOTION_CODES: bool.default(true),
});
export type Config = z.infer<typeof schema>;
export function getConfig(): Config {
  const c = schema.parse(process.env);
  if (c.STRIPE_SECRET_KEY.startsWith('sk_live_') !== c.COMMERCE_LIVE_MODE) throw new Error('Stripe mode mismatch');
  const freeShippingConfigured = c.FREE_SHIPPING_THRESHOLD_MINOR !== undefined;
  if (!!c.STRIPE_FREE_SHIPPING_RATE_ID !== freeShippingConfigured) throw new Error('Configure both free shipping fields or neither');
  if ((!freeShippingConfigured || c.FREE_SHIPPING_THRESHOLD_MINOR! > 0) && !c.STRIPE_FLAT_SHIPPING_RATE_ID) throw new Error('Configure a flat shipping rate for orders below the free shipping threshold');
  if (c.COMMERCE_LIVE_MODE && [c.ORDER_BASE_URL, c.STOREFRONT_URL, ...c.CHECKOUT_ALLOWED_ORIGINS].some(v => !v.startsWith('https://'))) throw new Error('Live commerce requires HTTPS');
  return c;
}
