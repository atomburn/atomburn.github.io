# Moodies storefront: backend handoff

Front end: Opus. Backend: Astra.

## Repo and files

- Repo: `atomburn/atomburn.github.io`, branch `claude/tender-curie-n9b5n9`. No PR yet.
- The whole site is one file: `moodies/index.html`. It has no build step and no framework.
- `moodies/assets/` holds the media and isn't relevant to the backend. `moodies/assets/README.md` lists what's there.

## What the backend touches in `index.html`

All of this is near the top of the `<script>`.

- `CONFIG.checkoutUrl`: currently empty. If it's set, the Checkout button redirects there. If it's empty, Checkout opens a pre-filled `mailto:` to `CONFIG.orderEmail` (`sales@buymoodies.com`, which works).
- `PRODUCTS`: the catalog. It has a single item:
  - id `rainbow-pack`, $15.98, `soldOut: false`.
  - `packs`: Hot 3-pack (red/pink/orange) and Cool 3-pack (purple/green/blue).
  - An optional per-product `buyUrl` makes the shop button go straight there.
- Cart: client-side only. It's stored in `localStorage` under `moodies-cart` as `{ "<productId>": qty }`. `renderCart()` reads it and the `#checkout` click handler turns it into the order.
- Order data is the line items (qty × name × price) and the subtotal. The page doesn't calculate shipping or tax ("calculated at checkout").

## Hosting

- Vercel project `buymoodies` under team `atomburns-projects` (CLI is logged in as `atomburn`). It's static and has no Vercel Git integration. The deploy copies `moodies/` into a folder and runs `vercel deploy --prod`.
- Domains: `buymoodies.com` and `www.buymoodies.com`. DNS stays at GoDaddy (A record → `76.76.21.21`, `www` CNAME → `cname.vercel-dns.com`).
- **Don't touch the MX or TXT records**: email runs on Google Workspace.
- No database yet. The owner said reusing an existing Supabase project is fine if one is needed.

## Open decisions for the backend

- Payment provider. The simplest route is a Stripe Payment Link in `CONFIG.checkoutUrl`. A fuller option is a Vercel serverless `/api/checkout` that builds a Stripe Checkout Session from the cart.
- Real inventory tracking, so `soldOut` comes from data instead of being hard-coded.
- Order notifications to sales@buymoodies.com.

## Coordination

- Opus owns the front end in `index.html`. If you need new hooks, for example a fetch to `/api/checkout` or a dynamic stock flag, say what you need and Opus will wire them in.
- If you add `/api` routes, the deploy will need to move from a plain static copy to a project root that includes `api/`.
