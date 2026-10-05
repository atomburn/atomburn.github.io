# Verification and remaining acceptance

Verified October 4, 2026 (Pacific). Implementation is isolated in `moodies/commerce` on `codex/moodies-commerce`. Initial storefront baseline was `1d3edd1`; Opus continues to own and update the source HTML separately; commits through `b0cf1ba` are included unchanged in the backend branch.

## Passed locally

- ESLint and strict TypeScript checks.
- **11 application/HTTP/SDK tests:** strict cart input, trusted Stripe prices, inactive/unknown/out-of-stock rejection, immutable checkout retries after uncertain database binding, zero-threshold free shipping without a paid fallback, rejection of a nonzero free rate, test/live database schema routing, signed webhook timestamp/body checks, authoritative Session retrieval, correct snapshots/totals, payment-state handling, hashed order-token privacy.
- **13 real PostgreSQL tests** in a temporary isolated local database: atomic order/items/stock, 20 concurrent identical events, 20 concurrent different events for one Session, pending/failed/expired behavior, async success, rollback/retry, shortages, unlimited inventory, monotonic refunds/no restock, early-refund retry, shipment idempotency, RLS/privileges, and test-schema isolation.
- Production build with all checkout/catalog/order/webhook routes.
- Full dependency audit: zero reported vulnerabilities.
- Client bundles contain no actual configured server secrets, including the Loopmuse service-role key and local order-token secret.
- Initial production-server smoke test returned HTTP 200 and served the baseline HTML byte-for-byte (`ebc4e29dbac14a102581f720851ea81aeb7d934448a91465ce12af3e8e57abdf`); a sampled asset also matched. Missing Stripe configuration returned a generic 503 without customer or credential data.
- Final production-server smoke check serves Opus's `b0cf1ba` storefront byte-for-byte, SHA-256 `8b394b63b6118e6c93b47c8d31f3f620a0697213f2a4077496b0ba599405c309`. The current live `https://buymoodies.com/` returned HTTP 200 with that same hash. A sampled asset also matched. Root/asset caching is public, max-age=0; root has no noindex header. API responses have private/no-store/no-referrer/noindex headers and a generic 503 until Stripe credentials are configured.

These are local SDK fixtures and database checks, not a claim that a real Stripe test-card payment has occurred.

## Verified and configured externally

- **Loopmuse** (`zmpjhziyinchinmigzke`) is active/healthy. The owner chose it for Moodies, with its own tables.
- Applied `202610050001_moodies_commerce.sql` and `202610050002_moodies_test_schema.sql` in one transaction and recorded both in Supabase migration history. Existing application tables were not changed.
- Confirmed all **12 Moodies tables** (six live, six test) have RLS and no anonymous/authenticated SELECT privilege.
- Added only `moodies_test` to Data API exposed schemas, preserving the existing `public` and `graphql_public` entries. Table/function access remains service-only.
- Existing server service-role reads returned HTTP 200 from both schemas with empty catalogs. Credentials are in ignored local environment storage with mode 0600; no real credentials are committed.
- Classic **Buymoodies** account is `acct_103i1t26QnS1lszt`. Live account status showed **Payments active / Payouts paused**, with an update-bank-account task. No bank/account changes were performed.
- Created and verified the classic account's **test-mode** shipping rate `shr_1UN4AT26QnS1lsztvhcG8PiL`: **Free shipping, USD 0.00, Active**. Local test settings use it with `FREE_SHIPPING_THRESHOLD_MINOR=0`.
- Five redacted 2024–2025 Gmail receipts support the historical 99-cent economy/399-cent tracked options, now superseded by the owner's free-shipping instruction. They also show the historical $19.99 selling price, versus the rebuilt storefront's $15.98.
- Local Vercel link targets the existing `atomburns-projects/buymoodies` project. No Preview or Production deployment was created.

## Required before real test acceptance

The existing Stripe test secret key is available in Safari but has not been saved to the backend. Automatic approval review blocked Computer Use from opening macOS Terminal, stating that the app is unavailable for safety reasons. The attempted private key transfer did not occur; the clipboard was subsequently replaced with the public dashboard URL. Computer Use also blocks control of the Codex app. TextEdit was available, but its file chooser did not open the settings file reliably; it was dismissed without changing any document. The private file is prepared and linked from this chat; the owner can paste the existing key after `STRIPE_SECRET_KEY=` on line 2 and save without sharing it in chat. Safari remains on the classic account's test API keys page.

Next: configure the test webhook signing secret, create/reuse the test Rainbow Pack Product/Price, seed synthetic test stock in `moodies_test`, wire Opus's documented cart hooks, perform a real hosted Stripe test-card checkout, then replay its webhook and inspect exactly one Supabase order, correct totals/items and one stock decrement. The shortest procedure is in the README.

## Required before live launch

Resolve Stripe payouts, settle the selling price and actual physical stock count, create the live Product/Price and zero-dollar Shipping Rate, configure live Vercel secrets/webhook destination and tax/payment settings, integrate the frontend, and complete test acceptance. No live inventory count is guessed; the live catalog remains empty and cannot accept sales. Production Shippo labels, owner email notifications and a browser admin are deferred.
