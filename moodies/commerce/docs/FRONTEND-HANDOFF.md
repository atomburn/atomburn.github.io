# Hooks for Opus

Backend lives in `moodies/commerce` on `codex/moodies-commerce`, initially based on `1d3edd1`, with Opus's subsequent storefront commits through `b0cf1ba` included unchanged. This backend branch does not modify `moodies/index.html` or any asset.

Backend acceptance passed against the classic Stripe account in test mode and Loopmuse's `moodies_test` schema: a browser cart sent one real SKU, hosted Checkout charged the test card $15.98 with free shipping, its webhook created order M-1001 and reduced synthetic stock from 10 to 9, and 20 signed replays left both counts unchanged. A separate expired checkout did not consume stock. The test purchase was then refunded; its order is refunded/on hold and stock remains 9. This used an ignored local test cart; the source storefront hooks below still need wiring and Preview verification.

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

Deploy the `moodies/commerce` app to the existing `buymoodies` Vercel project. Its build copies Opus's latest unchanged HTML/assets into `public/` and includes Next.js API/order routes. The prior static-only folder deployment would omit the backend. Keep Preview Stripe credentials/data in test mode and live production credentials/data separate. Both use Loopmuse: the backend selects isolated `moodies_test` tables for test mode and `public.moodies_*` tables for live mode. No domain/email record edits are needed.
