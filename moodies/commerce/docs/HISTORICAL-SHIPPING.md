# Historical shipping findings

Read on October 4, 2026 (Pacific), from Squarespace order-confirmation emails in the signed-in **sales@buymoodies.com** Gmail account. The Gmail connector was connected to a different mailbox, so these receipts were read directly in Safari. No customer names, addresses, contact details or payment identifiers are copied here.

| Order | Date | Rainbow Packs | Merchandise subtotal | Explicit shipping | Service | Tax | Total |
|---|---|---:|---:|---:|---|---:|---:|
| [01218](https://mail.google.com/mail/u/2/#search/from%3Asquarespace.com+subject%3A(01218)) | 2025-03-10 | 2 | $39.98 | **$0.99** | USPS First Class Snail Mail | $0.00 | $40.97 |
| [01216](https://mail.google.com/mail/u/2/#search/from%3Asquarespace.com+subject%3A(01216)) | 2025-01-24 | 1 | $19.99 | **$0.99** | Economy charge; service label was not retained for this sample | $0.00 | $20.98 |
| [01215](https://mail.google.com/mail/u/2/#search/from%3Asquarespace.com+subject%3A(01215)) | 2025-01-06 | 1 | $19.99 | **$0.99** | USPS First Class Snail Mail | $0.00 | $20.98 |
| [01213](https://mail.google.com/mail/u/2/#search/from%3Asquarespace.com+subject%3A(01213)) | 2024-12-02 | 1 | $19.99 | **$3.99** | USPS First Class Shipping & Handling with Tracking Info | $0.00 | $23.98 |
| [01209](https://mail.google.com/mail/u/2/#search/from%3Asquarespace.com+subject%3A(01209)) | 2024-09-05 | 3 | $59.97 | **$3.99** | USPS First Class Shipping & Handling with Tracking Info | $0.00 | $63.96 |

The historical store offered at least two shipping choices: **$0.99 economy** and **$3.99 with tracking**. Both values are explicitly labeled Shipping & Handling in receipts, rather than inferred by subtracting the rebuilt site's price from old Stripe charges. The $3.99 charge appears on both one-pack and three-pack orders, which supports a per-order flat charge for that option in this sample.

The owner subsequently chose **free shipping for now, on every eligible order, with no minimum spend**. Checkout is configured for a verified zero-dollar Stripe Shipping Rate. The historical fees above are retained only as evidence for a future policy decision; neither is the current customer charge. These receipts also do not quote current USPS/Shippo postage or establish today's fulfillment cost.

No free-shipping threshold is established by these five receipts. The three-pack order still paid $3.99 on a $59.97 merchandise subtotal. The current free-shipping policy is an explicit owner decision, with `FREE_SHIPPING_THRESHOLD_MINOR=0`.

All five examples sold the Rainbow Pack for **$19.99**, whereas the rebuilt HTML displays **$15.98**. That selling-price discrepancy requires a decision before creating the actual Stripe Price; it must not be treated as a shipping difference. Historical zero tax on these receipts does not establish current tax obligations; use the configured Stripe Tax account setup.

After the owner chose free shipping, an active USD 0 test-mode Stripe Shipping Rate named Free shipping was created in the classic Buymoodies account (`shr_1UN4AT26QnS1lsztvhcG8PiL`). No live Shipping Rate or Product/Price was created or changed. No historical customer records were changed.
