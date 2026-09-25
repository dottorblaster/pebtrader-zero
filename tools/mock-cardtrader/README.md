# Mock CardTrader server

A tiny local HTTP server that serves the sanitized fixtures in
`test/fixtures/cardtrader`, so the app can be exercised end to end without
touching the real API. The unit tests start it on an ephemeral port and drive
the real API client against it.

## Run it

```sh
node tools/mock-cardtrader/server.mjs
# Mock CardTrader listening at http://127.0.0.1:8787/api/v2
# Token: mock-token
```

Environment: `PORT` (default `8787`), `MOCK_TOKEN` (default `mock-token`).

## Point the app at it

The emulator's PebbleKit JS runs on the host, so `127.0.0.1` reaches the mock.

1. Start the mock and note the URL and token it prints.
2. Open PebTrader Zero's settings in the Pebble mobile app.
3. Set **API token** to `mock-token`.
4. Under **Advanced**, set **API base URL** to `http://127.0.0.1:8787/api/v2`.
5. Save and (re)launch the app.

Leaving **API base URL** empty uses the real CardTrader API.

## Error states

The control endpoint forces the API errors the app has to handle:

```sh
curl -X POST http://127.0.0.1:8787/__mock/mode -H 'content-type: application/json' -d '{"mode":"429"}'
curl http://127.0.0.1:8787/__mock/mode
```

| Mode | Behaviour |
| --- | --- |
| `ok` | serve the fixtures (default) |
| `empty` | return empty arrays for orders and the box |
| `401` | every request is unauthorized |
| `404` | every request is not found |
| `429` | every request is rate limited (with `Retry-After`) |
| `500` | every request is a server error |

`GET http://127.0.0.1:8787/__mock/requests` lists the requests the mock has
received, which is handy when checking what the app actually asked for.

## Endpoints

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/v2/info` | the app info fixture |
| `GET /api/v2/orders` | buyer orders; `order_as=seller` returns `[]`; supports `page`/`limit` |
| `GET /api/v2/orders/:id` | one order, or 404 |
| `GET /api/v2/ct0_box_items` | the CT0 box fixture |
