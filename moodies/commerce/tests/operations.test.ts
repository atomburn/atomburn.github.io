import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const env = {
  ...process.env,
  STRIPE_SECRET_KEY: 'sk_test_local_fixture',
  STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'local-fixture',
  ORDER_TOKEN_SECRET: 'local-test-secret-32-characters-minimum',
  COMMERCE_LIVE_MODE: 'false',
  COMMERCE_CURRENCY: 'usd',
  STOREFRONT_URL: 'http://localhost:3000',
  ORDER_BASE_URL: 'http://localhost:3000',
  CHECKOUT_ALLOWED_ORIGINS: 'http://localhost:3000',
  STRIPE_FLAT_SHIPPING_RATE_ID: '',
  STRIPE_FREE_SHIPPING_RATE_ID: 'shr_free',
  FREE_SHIPPING_THRESHOLD_MINOR: '0',
  STRIPE_AUTOMATIC_TAX: 'false',
  STRIPE_ALLOW_PROMOTION_CODES: 'true',
  MOODIES_RAINBOW_PRICE_ID: 'invalid',
  MOODIES_RAINBOW_INVENTORY: 'not-a-count',
};

for (const [script, args, message] of [
  ['ops.ts', ['unknown-operation'], 'Usage: npm run ops'],
  ['seed-catalog.ts', [], 'Set the verified Rainbow Pack Price ID and physical inventory count.'],
] as const) {
  test(`${script} starts through the documented CLI and validates input before network access`, () => {
    const result = spawnSync(process.execPath, [
      resolve('node_modules/tsx/dist/cli.mjs'), '--conditions=react-server', resolve('scripts', script), ...args,
    ], { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(message), result.stderr);
    assert.ok(!result.stderr.includes('Transform failed'));
    assert.ok(!result.stderr.includes(env.STRIPE_SECRET_KEY));
  });
}
