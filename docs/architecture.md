# Architecture

PebTrader Zero is an [Alloy](https://developer.repebble.com/guides/alloy/) app:
JavaScript on the watch and PebbleKit JS on the phone.

## Components

| Component | Runs on | Source | Job |
| --- | --- | --- | --- |
| Watch app | The watch (Moddable XS) | `src/embeddedjs/` | UI, screen stack, AppMessage client |
| Phone (PKJS) | The phone | `src/pkjs/` | Holds the token, calls CardTrader, formats payloads |
| Shared | Both | `src/common/` | Protocol, line codec, message handler, snapshot codec |
| Firmware glue | The watch | `src/c/mdbl.c` | Creates the Moddable machine and sizes its heap |

The watch never talks to the network and never sees the API token.

## Data flow

```
CardTrader API --HTTPS--> PKJS (api.js -> orders.js / ct0.js)
        --AppMessage--> watch (messenger.js -> app.js -> Poco)
```

1. PKJS sends a small wake message on `ready`; that is what makes the
   AppMessage channel writable on the watch.
2. The watch sends a `COMMAND` (`REFRESH`, `GET_DETAIL` or `GET_BOX`).
3. PKJS fetches from CardTrader, normalizes the data and formats it for display.
4. PKJS serializes the payload to JSON, splits it into ~800-byte chunks and
   sends them one at a time (paced), because AppMessage drops messages sent
   back to back.
5. The watch reassembles the chunks and draws them with Poco.

See [protocol.md](protocol.md) for the wire contract and
[configuration.md](configuration.md) for the settings.

## CardTrader endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /info` | Token validation (config page and API client) |
| `GET /orders` | Order list (`order_as`, `sort=date.desc`, `limit`) |
| `GET /orders/:id` | Order detail |
| `GET /ct0_box_items` | CardTrader Zero box |

Documented global rate limit: **200 requests / 10 s**. The client spaces
requests by at least 50 ms (`minIntervalMs`) and backs off on 429/5xx, honouring
`Retry-After`.

## Design decisions

**Poco, not Piu.** The Moddable watch heap is tiny; a Piu tree of text labels
exhausted it. The UI uses Poco — one renderer, imperative drawing, a fixed
screen buffer — and the shared protocol tables are built lazily.

**A raised C heap.** `src/c/mdbl.c` passes a `ModdableCreationRecord` with a
larger slot/chunk heap. The firmware default was too small for the message
layer plus a parsed order list (and the firmware requires all of
stack/slot/chunk to be non-zero).

**Two module systems.** PKJS is CommonJS and the watch is ESM; neither can
import the other's module object. Files in `src/common/` are UMD-ish
side-effect modules: they export through `module.exports` for PKJS and install
themselves on `globalThis` for the watch. `src/embeddedjs/protocol.js`
re-exports the shared protocol as ESM.

**Formatting on the phone.** The watch receives pre-formatted display strings
(orders list projection, detail/box lines) rather than rich objects, keeping
its heap small.

## Source map

```
src/c/mdbl.c                 Moddable machine + heap sizing
src/embeddedjs/main.js       entry point
src/embeddedjs/app.js        shell: screens, buttons, requests, Poco rendering
src/embeddedjs/messenger.js  AppMessage send/receive
src/embeddedjs/cache.js      local snapshot cache
src/embeddedjs/nav.js        logical screen descriptors + stack
src/pkjs/index.js            Clay config + webviewclosed
src/pkjs/api.js              pure API client (injectable transport)
src/pkjs/client.js           client wired to settings + XMLHttpRequest
src/pkjs/orders.js           order fetch + normalize + formatting
src/pkjs/ct0.js              CT0 box fetch + normalize + formatting
src/pkjs/messaging.js        COMMAND handling, chunked sends
src/pkjs/send-queue.js       serialized, paced, retrying send queue
src/common/protocol.js       message keys, domain model, chunk codec
src/common/message-handler.js reassemble + dispatch watch payloads
src/common/snapshot.js       offline snapshot codec
```
