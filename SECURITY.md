# Security and privacy

PebTrader Zero handles a CardTrader API token and a user's order data. This
note covers the trust boundaries, the threats and how they are handled, and
what data the app stores where.

## Assets

| Asset | Where it lives |
| --- | --- |
| CardTrader API token (bearer) | Phone-side PKJS `localStorage` (`cardtrader-token`) |
| Order / CT0 box data | CardTrader API, the phone, and a small cached snapshot on the watch |
| Counterparty username, tracking code | CardTrader API → phone → watch (only when the detail/box screen is open) |

Shipping and billing addresses and email addresses are **never** requested by
the app and never reach the watch.

## Trust boundaries

```
CardTrader API  --(HTTPS)-->  Phone (PebbleKit JS)  --(AppMessage)-->  Watch (Alloy/Poco)
```

- The **phone** is the only component that holds the token and makes network
  calls.
- The **watch** is treated as low-trust and low-capability: it receives only
  normalized, non-secret data.
- **AppMessage** is a short-range Bluetooth link; nothing secret is sent over
  it.

## Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Token leaks to the watch | Stripped from the config payload before `Pebble.sendAppMessage` (`config-message.js`), and covered by a unit test asserting the token never appears in the watch dict |
| Token sent to a malicious endpoint | The API client **rejects any base URL that is not HTTPS**, except loopback HTTP for the local mock server (`api.js`, `isAllowedBaseUrl`) |
| Token in transit | Only HTTPS to `api.cardtrader.com` (or the user's HTTPS override); the Authorization header is only attached to allowed endpoints |
| Token in logs | The token is never logged; the only log lines are lifecycle messages. The config-page validator does not log the value |
| Token in source control / CI | The token lives in `.secrets/cardtrader.token` (gitignored). CI has no secrets and runs with `permissions: contents: read` |
| Personal data leaking into published fixtures | Fixtures are sanitized and a test asserts no emails/URLs/bearer tokens and that every sensitive field is `[REDACTED]` |
| Stale or spoofed responses | The watch ignores payloads whose type does not match its in-flight request (`app.js`) |
| Data over-collection on the watch | The list is a compact projection (id, state, size, total, counterparty, CT0 flag); the detail/box screens receive pre-formatted lines. Addresses are dropped in the normalizer |

## Token at rest

The token is stored in PebbleKit JS `localStorage` in clear text. The platform
offers no secure keystore to an Alloy app, so this is the same trust model as
every other Pebble configuration page. It is never written to the watch,
committed, or transmitted anywhere except CardTrader over HTTPS.

## The advanced API base URL

The config page exposes an optional **API base URL** so the app can be pointed
at `tools/mock-cardtrader` during development. The client refuses to send the
token to anything that is not HTTPS, with plain HTTP allowed only for
`localhost` / `127.0.0.1` / `::1`.

## Privacy

- The app talks **only** to the user's configured CardTrader API endpoint.
  There is no analytics, telemetry or third-party service.
- The phone stores the token and the app preferences (`localStorage`); the
  watch stores a small snapshot (recent order rows and the CT0 box text) so it
  can show something offline.
- Uninstalling the app clears the watch snapshot. Removing the token in the app
  settings deletes it from phone storage.
- CardTrader's own privacy policy governs the data held on their side.

## Verification

- `npm test` includes tests for token stripping, HTTPS enforcement and fixture
  sanitization.
- `review_security` / `review_file` are run over the phone- and watch-side code.
