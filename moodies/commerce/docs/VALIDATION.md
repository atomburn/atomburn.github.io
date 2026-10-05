# Verification and remaining launch work

Updated October 5, 2026 (Pacific). Implementation is isolated in `moodies/commerce` on `codex/moodies-commerce`. Opus's storefront wiring `b4a5f0e` is merged into this branch; source assets/design are preserved. No merge to main or GitHub Pages publication was performed.

## Passed locally

- ESLint and strict TypeScript checks.
- **13 application/HTTP/SDK/CLI tests:** strict cart input, trusted Stripe prices, inactive/unknown/out-of-stock rejection, immutable checkout retries after uncertain database binding, zero-threshold free shipping without a paid fallback, rejection of a nonzero free rate, test/live database schema routing, signed webhook timestamp/body checks, authoritative Session retrieval, correct snapshots/totals, payment-state handling, hashed order-token privacy, and documented operational CLI startup/input validation without network access.
- **13 real PostgreSQL tests** in a temporary isolated local database: atomic order/items/stock, 20 concurrent identical events, 20 concurrent different events for one Session, pending/failed/expired behavior, async success, rollback/retry, shortages, unlimited inventory, monotonic refunds/no restock, early-refund retry, shipment idempotency, RLS/privileges, and test-schema isolation.
- Production build with all checkout/catalog/order/webhook routes.
- Full dependency audit: zero reported vulnerabilities.
- Client bundles and staged source contain no actual configured server secrets, including the Stripe key, webhook signing secret, Loopmuse service-role key and local order-token secret.
- Initial production-server smoke test returned HTTP 200 and served the baseline HTML byte-for-byte (`ebc4e29dbac14a102581f720851ea81aeb7d934448a91465ce12af3e8e57abdf`); a sampled asset also matched. Missing Stripe configuration returned a generic 503 without customer or credential data.
- Final production-server smoke check serves Opus's `b0cf1ba` storefront byte-for-byte, SHA-256 `8b394b63b6118e6c93b47c8d31f3f620a0697213f2a4077496b0ba599405c309`. The current live `https://buymoodies.com/` returned HTTP 200 with that same hash. A sampled asset also matched. Root/asset caching is public, max-age=0; root has no noindex header. API responses have private/no-store/no-referrer/noindex headers and a generic 503 until Stripe credentials are configured.

The checks above use local fixtures and an isolated database. The real Stripe/Supabase acceptance below is separate evidence.

## Verified and configured externally

- **Loopmuse** (`zmpjhziyinchinmigzke`) is active/healthy. The owner chose it for Moodies, with its own tables.
- Applied `202610050001_moodies_commerce.sql` and `202610050002_moodies_test_schema.sql` in one transaction and recorded both in Supabase migration history. Existing application tables were not changed.
- Confirmed all **12 Moodies tables** (six live, six test) have RLS and no anonymous/authenticated SELECT privilege.
- Added only `moodies_test` to Data API exposed schemas, preserving the existing `public` and `graphql_public` entries. Table/function access remains service-only.
- Existing server service-role reads returned HTTP 200 from both schemas. The test catalog now contains synthetic Rainbow Pack stock; the live catalog remains empty. Credentials are in ignored local environment storage with mode 0600; no real credentials are committed.
- Classic **Buymoodies** account is `acct_103i1t26QnS1lszt`. Live account status showed **Payments active / Payouts paused**, with an update-bank-account task. No bank/account changes were performed.
- Created and verified the classic account's **test-mode** shipping rate `shr_1UN4AT26QnS1lsztvhcG8PiL`: **Free shipping, USD 0.00, Active**. Local test settings use it with `FREE_SHIPPING_THRESHOLD_MINOR=0`.
- Opened the correct private settings file in TextEdit; the owner saved the existing test secret. Verified the key against `acct_103i1t26QnS1lszt` without displaying its value. Created test Product `prod_VNq7VY6HxeeRES` and Price `price_1UN4Qw26QnS1lsztSWjpvDjL`: USD 1598, one-time, exclusive tax behavior. This is the current storefront price for testing; the live price decision remains open.
- Five redacted 2024–2025 Gmail receipts support the historical 99-cent economy/399-cent tracked options, now superseded by the owner's free-shipping instruction. They also show the historical $19.99 selling price, versus the rebuilt storefront's $15.98.
- Vercel link targets the existing `atomburns-projects/buymoodies` project. A protected test Preview is now deployed; Production deployment/settings remain unchanged.

## Real backend acceptance passed

- Used the official Stripe CLI 1.53.0 with the existing test key and `listen --latest`; its signing secret was saved privately. The local production server ran on port 3197.
- Seeded **10 synthetic Rainbow Packs** only in `moodies_test`. Confirmed the live catalog and live order table both contain zero records.
- In Safari, an ignored local test-cart page fetched the real catalog, added one `MOODIES-RAINBOW-PACK`, sent identifiers/quantity to the backend, and redirected to hosted Checkout. Opus's source HTML/assets were not edited.
- Completed Checkout with Stripe's `4242` test card and fictional buyer details. Stripe reported **complete / paid / test mode**, subtotal/total **1598 cents**, shipping/tax/discount **0**. Its real `checkout.session.completed` delivery returned **HTTP 200**.
- Supabase created exactly **one purchase order, M-1001**, one item with quantity 1, the correct SKU/Price/name snapshots, and totals matching Stripe. Synthetic inventory changed **10 → 9** once. The browser confirmation showed the paid order and delivery address.
- Replayed that retrieved Stripe event **20 concurrent times**, signing the replay requests locally with the test webhook secret. Every request returned **200**; the order count stayed **1**, stock stayed **9**, and the event ledger retained one row for that event.
- Created and expired a separate unpaid Checkout. Its real `checkout.session.expired` webhook returned **200** and created **M-1002 / cancelled / inventory_processed=false**. Paid purchase count and stock remained unchanged.
- Fully refunded the test payment through Stripe. The real `charge.refunded` webhook returned **200**. M-1001 now shows **refunded / on hold**, refunded amount **1598**, stock **9**. The confirmation page and API show that state. Replaying the refund and earlier completed event preserved it and did not restock.
- Actual HTTP checks passed: configured catalog **200**, injected client price **400**, unknown SKU/excess stock **409**, unapproved browser origin **403**, unsigned webhook **400**, sequential order guess **404**. The private order API exposes no customer email, Stripe IDs, checkout attempt ID or token hash, and carries no-store/no-referrer headers.

At the end of that local acceptance, test data contained **one refunded purchase and one distinct cancelled checkout**, not duplicate purchase orders. Private machine-local evidence is in ignored `.vercel/commerce-acceptance.json`. No real card or live charge was used. The later integrated Preview acceptance is recorded below.

## Integrated Vercel Preview acceptance passed

- Merged Opus's pushed `b4a5f0e` into the commerce branch as `7499a55`. Re-ran all 26 application/database tests, lint, typecheck, and the production build successfully.
- Fixed CLI packaging: explicitly include staged storefront/media in `.vercelignore`, while excluding local secrets/build output/test harness; remote staging checks the uploaded storefront when sibling source is absent. Dry-run confirmed 235 files, with `.env.local`, `.vercel/`, local build/dependencies and `public/commerce-test.html` excluded.
- Vercel Preview deployment `dpl_7JrNXqVkeKVKY7XY8LMmMmMrC5o8` is Ready at https://buymoodies-commerce-test-atomburns-projects.vercel.app. The remote Next.js build passed. Preview root matched merged source byte-for-byte, and its catalog returned the test Rainbow Pack at 1598 cents with synthetic stock 8.
- Configured 15 Preview-only environment values, storing actual server keys as Vercel Secrets. Classic Stripe test mode and Loopmuse's `moodies_test` schema are enforced. Created a dedicated test webhook; its automation bypass is private. Vercel Authentication remains enabled, and an unauthenticated catalog request redirected to authentication.
- Stopped the local Stripe listener before purchase, so it could not process these events. Safari opened the protected Preview through its existing authenticated session, added one Rainbow Pack in Opus's cart, and used the page's checkout handler to reach hosted Stripe Sandbox showing $15.98 and free shipping.
- Completed payment with Stripe's 4242 test card and fictional shipping details. The hosted webhook created **exactly one M-1004 order**, with one correct SKU/item at 1598 cents, shipping/tax/discount zero; synthetic stock changed **8 → 7 once**. Stripe totals, stored order/items, public order API and browser confirmation agreed.
- Replayed the retrieved actual completed event in 20 concurrent signed requests to the hosted endpoint. All returned 200; M-1004 remained one order and stock remained 7. These were signed test requests, not Stripe Dashboard resends.
- Fully refunded only this test payment. The hosted refund webhook changed M-1004 to **refunded / on hold**, refund amount 1598, stock 7. Earlier test orders were preserved.
- Preview browser confirmation and API worked; order tokens/bypass secrets are not published in this document. Private acceptance records are in ignored, mode-0600 `.vercel/preview-private.json`.
- Production `buymoodies.com` remained HTTP 200 with the previous email-checkout HTML hash `8b394b63b6118e6c93b47c8d31f3f620a0697213f2a4077496b0ba599405c309`; its production deployment ID remained `dpl_9Bkjje38J3NrHfSfLCRy1J9RpArX`. No production environment values were configured.

## Required before live launch

Resolve Stripe payouts, settle the selling price and actual physical stock count, create the live Product/Price and zero-dollar Shipping Rate, configure live Vercel secrets/webhook destination and tax/payment settings, seed actual physical stock, and validate a separate live-configured deployment before production promotion. Frontend integration and test-mode Preview acceptance are complete. No live inventory count is guessed; the live catalog remains empty and cannot accept sales. Production Shippo labels, owner email notifications and a browser admin are deferred.
