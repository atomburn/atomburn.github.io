# Moodies commerce

A small Next.js 16 App Router backend for the existing static Moodies storefront. Stripe owns prices, payments, promotions and tax; Supabase owns operational orders and stock. No commerce platform or custom card form is involved.

## Existing architecture and implementation plan

Inspected source: `atomburn/atomburn.github.io`, storefront branch `claude/tender-curie-n9b5n9`, commit `1d3edd1`. `moodies/index.html` is static, uses a localStorage cart, and has one Rainbow Pack at a display price of $15.98. No existing Next.js, Supabase, auth, environment convention or server route exists. Production on the `buymoodies` Vercel project was byte-identical to the inspected baseline HTML on October 4, 2026 (Pacific). This backend branch also includes Opus's subsequent storefront changes through `b0cf1ba`; it edits no storefront HTML/assets itself.

Implemented plan: isolate this Next.js backend under `moodies/commerce`; keep the source HTML/assets unchanged; resolve SKU and Stripe Price server-side; create hosted Checkout; atomically record webhook orders/items/stock; expose private token confirmation; provide internal operations and a future Shippo boundary. Hosted Checkout fits the static frontend with one redirect and requires no publishable key or browser Stripe dependency.

## Implemented

- `GET /api/catalog`: Stripe display prices and current sellable quantities, no private IDs or credentials.
- `POST /api/checkout`: strict SKU/quantity input, server-side Stripe Product/Price and shipping validation, promotions, configurable automatic tax, address collection, dynamic payment methods/wallets.
- `POST /api/stripe/webhook`: raw-body signature/timestamp validation, Session retrieval and full line-item pagination, success/pending/failure/expiry/refund handling.
- `GET /api/orders/[token]` and `/order/[token]`: HMAC-derived 256-bit public token, hash-only lookup, no sequential-ID access, private/no-store responses. The confirmation reads webhook state and cannot create a paid order.
- Internal operations CLI for orders, order detail, stock/activity and shipments. No public admin endpoints; there was no admin authentication to reuse.
- Inventory shortages remain paid orders, stop further checkout, and hold fulfillment for human resolution. No negative stock or automatic refund/restock.

## Database

`supabase/migrations/202610050001_moodies_commerce.sql` creates the live tables in `public`; `202610050002_moodies_test_schema.sql` creates the same protected tables/functions in `moodies_test`:

1. `moodies_products`
2. `moodies_product_variants`
3. `moodies_checkout_attempts` (fixed retry parameters, purchase snapshots and token hashes)
4. `moodies_orders`
5. `moodies_order_items`
6. `moodies_stripe_events`

The owner selected the existing **loopmuse** Supabase project (`zmpjhziyinchinmigzke`). These namespaced tables belong only to Moodies; the migration changes no existing application tables. The migration includes RLS, table/function privilege restrictions, nonnegative integer money/stock constraints, identity order numbers, unique event/Session/PaymentIntent keys, and indexes. Browser anonymous/authenticated roles have no direct commerce table or privileged function access. Server-only service-role access handles all reads/writes. `COMMERCE_LIVE_MODE=false` selects `moodies_test`; live mode selects `public`. Test payments therefore never consume production stock or enter production orders, even with the same Loopmuse project. Add `moodies_test` to Supabase Data API exposed schemas while preserving its existing entries; grant schema usage only to the existing server service role. See [Supabase custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas).

`moodies_apply_checkout_event` commits the event receipt, order, items and inventory in one database transaction. It locks each checkout and locks variants in deterministic order. Different events for the same Session also decrement once. Exceptions roll back the event receipt so Stripe can retry. Late failures never demote a paid or refunded order. Refund processing is cumulative and monotonic; it never restocks inventory. Fulfillment checks payment/refund state again under a row lock.

**Applied on October 4, 2026 (Pacific):** both migrations are installed in Loopmuse and recorded in its migration history. All 12 tables have RLS and no anonymous/authenticated SELECT privilege. Server service-role reads returned HTTP 200 from both schemas. The test catalog now contains the Rainbow Pack and synthetic stock; the live catalog is empty. Existing application tables were not changed. The `moodies_test` schema was added to Data API exposed schemas while preserving `public` and `graphql_public`. Existing Loopmuse service-role credentials are saved only in ignored local environment storage.

For a future fresh Supabase target, initialize/link with the Supabase CLI and use `supabase db push --dry-run`, then `supabase db push`. For a reused target, carry its existing migration history into the same working directory first (`supabase migration fetch --linked`) and review the dry run: only the new Moodies migration should be pending. Do not reset a shared project. See [Supabase CLI](https://supabase.com/docs/reference/cli/supabase-migration-fetch).

## Stripe setup required

Use the **classic Buymoodies account**, `acct_103i1t26QnS1lszt`. Its account-status page shows **Payments active, Payouts paused**, and an **Update your bank account** task affecting payouts. The owner must resolve the payout banking task before launch. Safari showed this account's historical customers/payments and a separate Xero-linked “Buymoodies (New)” account. The existing test secret was saved privately through TextEdit and verified against the classic account. Test Product `prod_VNq7VY6HxeeRES`, Price `price_1UN4Qw26QnS1lsztSWjpvDjL` (USD 1598, one-time, exclusive tax behavior), and free-shipping rate `shr_1UN4AT26QnS1lsztvhcG8PiL` (active, USD 0) are configured. A hosted test-card payment, webhook, order, inventory decrement, replay, expiry and refund have passed; see [Verification](docs/VALIDATION.md). Live Product/Price/shipping, payout banking and tax settings still need setup.

In the selected account's **test mode**:

1. The active test `Rainbow Pack` Product and one-time USD Price are configured at **1598 cents**, matching the current storefront for this test. Five 2024–2025 receipts explicitly show **1999 cents**; confirm the selling price before creating the live Price. Choose the proper product tax code and Price tax behavior for launch. Disable cross-sells and customer-adjustable quantities for these prices so every checkout line matches the trusted snapshot.
2. Create an active fixed USD Stripe Shipping Rate with **amount 0**, named **Free shipping**. Set `STRIPE_FREE_SHIPPING_RATE_ID` to its ID and keep `FREE_SHIPPING_THRESHOLD_MINOR=0`: every eligible order ships free, with no minimum spend. `STRIPE_FLAT_SHIPPING_RATE_ID` can remain blank. This is the owner's current choice; historical 99-cent/399-cent charges are reference only in [Historical shipping](docs/HISTORICAL-SHIPPING.md). For a later paid-shipping policy, configure a flat rate and either remove both free fields or raise the threshold; any positive threshold requires a flat fallback rate. Thresholds use merchandise subtotal before discounts, excluding tax and shipping.
3. Configure payment methods and branding in Stripe. Checkout uses Stripe's eligible methods automatically; wallets depend on Stripe's account/device/country support.
4. Use the existing test secret API key. Set the server webhook secret from the Stripe CLI locally or the webhook destination in hosted environments. Keep all IDs and keys in the same account/mode.
5. Register `/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded`. Match its API version to the pinned SDK: **2026-09-30.endive** (Stripe Node 23.0.0).
6. Leave `STRIPE_AUTOMATIC_TAX=false` until Stripe Tax registrations, business origin, tax codes/behavior and account setup are configured. Enable it when ready; Moodies calculates no custom tax. Stripe Tax can have usage fees.
7. Enable Stripe customer receipt emails if desired. An owner notification to `sales@buymoodies.com` is deferred until a mail provider is selected; this backend does not send outbound mail.

The authoritative payment and retry approach follows [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted) and [webhook verification](https://docs.stripe.com/webhooks).

## Environment

Copy `.env.example` to `.env.local`; do not commit real values.

Required: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_TOKEN_SECRET`, `STOREFRONT_URL`, `ORDER_BASE_URL`, `CHECKOUT_ALLOWED_ORIGINS`, `STRIPE_FREE_SHIPPING_RATE_ID`.

Defaults/config: `COMMERCE_LIVE_MODE=false`, `COMMERCE_CURRENCY=usd`, `SHIPPING_ALLOWED_COUNTRIES=US`, `STRIPE_AUTOMATIC_TAX=false`, `STRIPE_ALLOW_PROMOTION_CODES=true`. Current policy: `FREE_SHIPPING_THRESHOLD_MINOR=0` and a zero-dollar `STRIPE_FREE_SHIPPING_RATE_ID`. A paid flat rate is optional at threshold zero; it is required for paid shipping or a positive free-shipping threshold.

Initial catalog only: set `MOODIES_RAINBOW_PRICE_ID` and `MOODIES_RAINBOW_INVENTORY`, then run `npm run catalog:seed`. Use synthetic stock in test mode and the **actual physical count** in live mode. A rerun refuses to reset existing stock. The store SKU is `MOODIES-RAINBOW-PACK`; frontend product ID remains `rainbow-pack`.

Generate `ORDER_TOKEN_SECRET` using a cryptographically random generator (e.g. `openssl rand -hex 32`). Preserve it across deployments: rotating it changes newly derived retry URLs, while existing stored token hashes remain valid. No `NEXT_PUBLIC_` secret exists; hosted Checkout needs no publishable key, Supabase anon key, or Shippo token.

## One full test purchase

1. Loopmuse migrations, test credentials, Product/Price, free-shipping rate, and test catalog are configured locally. The existing synthetic stock is **9** after the successful test purchase; its refund intentionally did not restock. Do not run the initial seed again. A fresh target needs one initial test seed; production needs the actual physical stock count.
2. Start `stripe listen --latest --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,charge.refunded --forward-to localhost:3197/api/stripe/webhook`. The official CLI is also available through `npx @stripe/cli`. Use the existing test key through `STRIPE_API_KEY` or your existing CLI sign-in. Save its `whsec_…` privately as `STRIPE_WEBHOOK_SECRET`; do not paste keys into chat or commit them. The current local configuration uses port **3197**.
3. Run `npm run storefront:stage`, then `npm run dev -- --hostname 127.0.0.1 --port 3197`. Open the root storefront and use its Rainbow Pack cart. For a direct API check instead, create a session with:

```sh
curl http://localhost:3197/api/checkout \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  --data '{"items":[{"sku":"MOODIES-RAINBOW-PACK","quantity":1}]}'
```

4. Open the returned Stripe URL. Use test card `4242 4242 4242 4242`, a future expiry, any three-digit CVC, email and allowed-country shipping address. Never use a real card in this test.
5. Verify the webhook returns 200, the return page shows the order, `npm run ops -- orders` shows exactly one paid order, `npm run ops -- detail NUMBER` matches Stripe totals/items, and `npm run ops -- inventory` shows one unit removed.
6. In Stripe Workbench resend the same checkout event. Verify counts and inventory remain unchanged. A failed/incomplete checkout must not reduce stock or become paid. A successful async payment must transition once. Refund in Stripe test mode: Supabase records refund status, stock remains unchanged.

`stripe trigger checkout.session.completed` alone is not a full integration test: generic CLI fixtures do not contain Moodies checkout metadata/snapshots.

## Frontend and deployment handoff

See `docs/FRONTEND-HANDOFF.md`. Opus's storefront wiring, commit `b4a5f0e`, is merged into this branch. The custom storefront design and assets are preserved.

Deploy from `moodies/commerce`, not a static-only copy. **Run `npm run storefront:stage` before each CLI deployment**: Vercel uploads only this app directory, so the sibling HTML/assets must be copied into ignored `public/` first. `.vercelignore` includes those copies and excludes local settings, build output, and the local test harness. The remote build validates the staged entry/asset when sibling source is absent. `vercel.json` selects Next.js; `/` rewrites to the unchanged staged HTML. Generated public files remain copies of the canonical source. The existing `buymoodies` project remains the deployment target. No DNS/MX/TXT change is necessary.

Preview is deployed at https://buymoodies-commerce-test-atomburns-projects.vercel.app with Vercel Authentication retained. All required Preview settings are configured in Stripe test mode against Loopmuse's `moodies_test` tables. A dedicated Stripe test webhook uses a privately stored Vercel automation bypass for delivery. Production settings/deployment are untouched. Do not promote this test-mode deployment: create a separate live-configured deployment after resolving the prerequisites below.

On October 5, 2026 (Pacific), Safari completed the integrated Preview cart → Stripe test card → hosted webhook → paid order M-1004 → confirmation flow. One item cost $15.98 with $0 shipping/tax/discount; test stock changed 8 → 7 once. Twenty concurrent signed replays preserved one order and stock 7. The test payment was refunded; the hosted refund webhook put M-1004 on hold without restocking. See `docs/VALIDATION.md`.

## Operations and Shippo boundary

```sh
npm run ops -- orders
npm run ops -- detail 1001
npm run ops -- inventory
npm run ops -- stock MOODIES-RAINBOW-PACK ACTUAL_COUNT
npm run ops -- active MOODIES-RAINBOW-PACK false
npm run ops -- ready
npm run ops -- ship 1001 TRACKING_NUMBER https://carrier.example/tracking
```

These commands require local server credentials. Customer PII printed by `detail`/`ready` is for an authorized operator; do not publish it. Stock-setting is an absolute physical reconciliation: pause the SKU during a count to avoid overwriting a concurrent sale.

`src/lib/fulfillment.ts` exposes `listReadyOrders` and `markShipped`. A future Shippo worker can fetch paid/unfulfilled orders, create/buy a label, then call `markShipped` with provider and shipment ID. Label purchase must have its own provider idempotency/claim mechanism before concurrent workers are enabled. It is intentionally absent today.

## Validation and limits

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:database`, and `npm run storefront:stage && npm run build`. Database tests create/destroy a temporary isolated PostgreSQL cluster; `POSTGRES_BIN` can override the Mac Homebrew binary path. They never use a shared Supabase database. See `docs/VALIDATION.md` for actual results and remaining external checks.

Small inventory race: two open Stripe Sessions can both pass the stock check. Payment is recorded even if stock was consumed first, stock is clamped at zero, and a shortage order is held for operator resolution. Outstanding Sessions retain their trusted snapshots when catalog flags/prices change. No reservations or warehouse system is introduced.

Production prerequisites: resolve the classic Stripe account payout banking task; confirm the live price and physical stock; configure live tax/payment behavior, the zero-dollar shipping rate, Vercel secrets and webhook destination; seed only the actual stock count; validate the separately live-configured deployment before promotion. Frontend integration and test-mode Preview acceptance have passed. Add a Vercel Firewall rate limit to the public checkout/catalog routes and monitor failed webhook deliveries; CORS alone is not bot protection. Bearer order tokens include shipping destination, so avoid logging/sharing URLs and exclude the order routes from third-party analytics. Replay missed Stripe events after outages. Keep processed event IDs and operational order history.

No new platform subscription is introduced. Existing infrastructure limits and Stripe payment/Tax/fulfillment usage costs still apply. Shippo labels, owner email notifications and a browser admin are genuinely deferred.
