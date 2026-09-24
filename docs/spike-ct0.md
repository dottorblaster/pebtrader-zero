# Spike: CardTrader Zero order data

**Status:** complete
**Date:** 2026-09-24
**Issue:** #3
**Method:** live calls against `https://api.cardtrader.com/api/v2` with a real
account token, via [`tools/spike/fetch.mjs`](../tools/spike/fetch.mjs).

## Question

Which endpoints answer "what is the state of my CardTrader Zero order?", what
fields do they return, and how big are the payloads?

## How the data was captured

```sh
# token from CARDTRADER_TOKEN or .secrets/cardtrader.token (gitignored)
node tools/spike/fetch.mjs
```

Raw responses land in `.secrets/raw/` (never committed); sanitized fixtures
land in `test/fixtures/cardtrader/`. Addresses, emails, names, usernames,
tracking codes, order codes and the app shared secret are redacted.

## Results

### `GET /info` — auth works

- `200 OK`, 122 bytes, ~240 ms.
- Body: `{ "shared_secret", "name", "id", "user_id" }`.
- The documented `webhook_url` key is **absent** when no webhook is configured.
- `shared_secret` is the webhook signing key — never send it to the watch.

### `GET /orders?order_as=buyer` — order-level history

- `200 OK`, **233 KB** for just **2 orders** (~117 KB/order), ~580 ms.
- Both orders are `state: "done"` and `via_cardtrader_zero: true`.
- `size` equals the number of `order_items` (51 and 318 in this account).
- Each order carries: `state`, `size`, `buyer_total`/`buyer_subtotal`,
  `formatted_total`, `paid_at`, `sent_at`, `cancelled_at`,
  `order_shipping_method` (name, tracked, tracking_code, price),
  `order_shipping_address`/`order_billing_address`, and a full `order_items`
  array (name, expansion, quantity, properties, `buyer_price`, …).
- No `seller` totals are visible to a buyer, and vice-versa.
- **Pagination:** the response is a plain JSON array. `limit=100&page=2`
  returned `[]`, so these 2 orders fit in one page. Defaults per docs:
  `page=1`, `limit=20`.

### `GET /orders?order_as=seller` — empty for this account

- `200 OK`, `[]`. The account is buyer-only, so no seller-side data was
  observed.

### `GET /ct0_box_items` — the live CardTrader Zero state

- `200 OK`, **36 KB** for **41 items** (~900 B/item), ~170 ms.
- Item quantities by state: **`ok` = 26, `pending` = 31, `missing` = 0**
  (a single item can hold several copies, hence 41 items → 57 units).
- All 41 items have `estimated_arrived_at`; 10 have `arrived_at`;
  none have `cancelled_at`.
- Item fields: `quantity` (object keyed by state), `seller`, `product_id`,
  `blueprint_id`, `name`, `expansion`, `properties`, `buyer_price`,
  `formatted_price`, `paid_at`, `estimated_arrived_at`, `arrived_at`,
  `cancelled_at`, `presale`, plus one **undocumented** field:
  `return_to_seller` (boolean; `false` here).
- There is **no order id/code** on a CT0 box item — it is item-level, not
  order-level.

## Recommendation

**Primary source: `GET /ct0_box_items`.** It is the only endpoint that reports
the *live* CardTrader Zero state (`pending` / `ok` / `missing`), the expected
arrival date and the arrival date. For this account, `/orders` only returns
finished (`done`) history, while the box has 31 units still on the way.

**Secondary source: `GET /orders?order_as=buyer`.** Use it for order history
and detail the box does not carry: order state (`hub_pending`/`paid`/`sent`/
`arrived`/`done`), totals, shipping method/tracking and the item list.

For seller accounts, `GET /orders?order_as=seller` becomes the primary source
for fulfilment; the app should pick the role from config (see #4).

## Implications for the watch app

1. **Never ship raw payloads to the watch.** 233 KB for two orders will not fit
   an AppMessage. Normalize in PKJS to aggregates: per order → state, size,
   total, key dates, tracking; CT0 → counts by state, total value, soonest ETA.
2. **`size` is authoritative** for item counts; do not rely on
   `order_items.length` after trimming.
3. **Compute box status from `quantity`**, not dates: `ok`/`pending`/`missing`
   are explicit; `estimated_arrived_at` is present even on arrived items.
4. **Fetch cadence is cheap.** The box is one small request; poll it on open
   and on manual refresh (global limit 200 req/10 s, no rate-limit headers seen).

## Limitations / open questions

- Only 2 orders, both `done` and buyer-side: order states `hub_pending`,
  `paid`, `sent`, `arrived`, `request_for_cancel`, `canceled`, `lost` were
  **not observed live** — treat the documented list as authoritative.
- No `missing` CT0 items were present, so that state's fields are unverified.
- No webhook was configured, so webhook payloads were not exercised (out of
  scope: the app polls, see #3 notes).
- `return_to_seller` is undocumented; the app should ignore unknown fields.

## Fixtures

| File | Contents |
| --- | --- |
| `test/fixtures/cardtrader/info.json` | `GET /info` (redacted) |
| `test/fixtures/cardtrader/orders-buyer.json` | 2 CT0 buyer orders (redacted) |
| `test/fixtures/cardtrader/orders-seller.json` | empty seller order list |
| `test/fixtures/cardtrader/ct0-box-items.json` | 41 CT0 box items (redacted) |
