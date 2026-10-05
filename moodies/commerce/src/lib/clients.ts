import 'server-only';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config';
export function getClients() {
  const config = getConfig();
  return {
    config,
    stripe: new Stripe(config.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 }),
    // Share the existing project without test purchases touching production stock/orders.
    db: createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: config.COMMERCE_LIVE_MODE ? 'public' : 'moodies_test' },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export type CommerceDatabase = ReturnType<typeof getClients>['db'];
