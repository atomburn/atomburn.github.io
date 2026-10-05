# Hooks for Opus

Backend lives in `moodies/commerce` on `codex/moodies-commerce`. Opus's completed wiring commit `b4a5f0e` is merged here. No merge to `main` or GitHub Pages publication was performed.

The combined storefront/backend is deployed to https://buymoodies-commerce-test-atomburns-projects.vercel.app with Vercel Authentication retained. Preview credentials use the classic Stripe test account and Loopmuse's isolated `moodies_test` schema. Safari completed the real storefront cart and hosted test payment; the hosted webhook created one order M-1004 at $15.98 with free shipping, stock 8 → 7, and a paid confirmation. Twenty concurrent signed replays left counts unchanged. The test payment was refunded; its hosted webhook set refunded/on hold without restocking. Production remains on the earlier email-checkout build; do not promote the test deployment.

The hook contract below documents the now-implemented behavior.

## Checkout

Replace only the existing `#checkout` click handler's mailto/checkoutUrl path with a POST to same-origin `/api/checkout`. Keep the custom cart/drawer and visual design. Convert localStorage cart product ID `rainbow-pack` to backend SKU `MOODIES-RAINBOW-PACK`. Send **no prices/subtotal/names/Stripe IDs**.

```js
// Keep this key for retries of the same cart. Replace it when the cart changes,
// or after a completed/cancelled/expired checkout. Persist across reloads.
const signature = JSON.stringify(items);
let checkoutAttempt;
try { checkoutAttempt = JSON.parse(sessionStorage.getItem('moodies-checkout-attempt')); }
catch { checkoutAttempt = null; }
if (!checkoutAttempt || checkoutAttempt.signature !== signature) {
  checkoutAttempt = { signature, key: crypto.randomUUID() };
  sessionStorage.setItem('moodies-checkout-attempt', JSON.stringify(checkoutAttempt));
}
const response = await fetch('/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Idempotency-Key': checkoutAttempt.key },
  body: JSON.stringify({ items }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || 'Checkout is unavailable.');
location.assign(result.url);
```

Here `items` is `[{ sku: 'MOODIES-RAINBOW-PACK', quantity: cart['rainbow-pack'] }]` after validating nonempty integer quantities. Disable the button during the request and show API errors visibly in the existing cart/toast. On an explicit expiry/completion error, start a new attempt key; on a network/503 error, retain the key and offer retry. Do not silently fall back to email after uncertain checkout creation. Do not mark an order paid from a redirect. Do not auto-clear the cart before confirmed payment; the order page's backend state is authoritative.

## Price and inventory display

Fetch `/api/catalog` on load and before entering checkout. Example response:

```json
{"products":[{"sku":"MOODIES-RAINBOW-PACK","name":"Rainbow Pack","variantName":"Hot + Cool six-pack","unitAmount":1598,"currency":"usd","available":true,"maxQuantity":20}]}
```

Set the existing display price from `unitAmount / 100`, update `soldOut`/quantity controls from `available` and `maxQuantity`, and keep current artwork/content. Catalog numbers are for display; the backend always resolves the Price again for a new checkout. Catalog errors should disable checkout and show an availability message. No Supabase client or secret keys belong in the page.

## Shipping

The owner chose **free shipping for now, with no minimum spend**. The backend validates a zero-dollar Stripe Shipping Rate for every new checkout. Update the existing cart shipping label to **Free shipping** when wiring these hooks. Tax remains calculated at checkout.

## Order page

Hosted Stripe returns to `/order/<secure-token>`. A simple server-rendered confirmation already exists; it shows “Confirming” while awaiting webhook receipt. For a custom branded renderer, `GET /api/orders/<token>` returns 202 while processing and 200 with products, totals, shipping destination, payment/fulfillment state and tracking. Invalid/unknown tokens return 404. Responses expose no database IDs, email, token hashes, Stripe IDs or internal inventory notes. Keep tokens out of analytics and external referrers.

## Deploy together

Deploy the `moodies/commerce` app to the existing `buymoodies` Vercel project. Run `npm run storefront:stage` before the CLI upload to include the sibling HTML/assets; the remote build uses those staged copies and includes Next.js API/order routes. The prior static-only folder deployment would omit the backend. Keep Preview Stripe credentials/data in test mode and live production credentials/data separate. Both use Loopmuse: the backend selects isolated `moodies_test` tables for test mode and `public.moodies_*` tables for live mode. No domain/email record edits are needed.
