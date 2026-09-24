# Watch <-> phone protocol

How PebTrader Zero moves data between the watch (Alloy/Moddable JS) and the
phone (PebbleKit JS). The single source of truth is
[`src/common/protocol.js`](../src/common/protocol.js), which is loaded by both
runtimes.

## Why a side-effect module

PKJS is **CommonJS** and the Moddable watch runtime is **ESM**; neither can
import the other's module object. `src/common/protocol.js` is therefore a small
UMD-ish module that:

- exports itself via `module.exports` for PKJS, and
- installs itself on `globalThis.PebTraderProtocol` for the watch.

The watch re-exports it as ESM through `src/embeddedjs/protocol.js`, which does
`import "shared-protocol"` (mapped in `src/embeddedjs/manifest.json`).

## Message keys

Declared in `package.json` under `pebble.messageKeys` (the test suite asserts
they match `protocol.MESSAGE_KEYS`).

| Key | Direction | Type | Meaning |
| --- | --- | --- | --- |
| `API_TOKEN` | config only | string | CardTrader token. **Never sent to the watch.** |
| `ROLE` | config only | string | `buyer` / `seller` / `both` |
| `CT0_ONLY` | config only | int | `1` to show CardTrader Zero orders only |
| `REFRESH_MINUTES` | config only | int | `0` = manual |
| `COMMAND` | watch -> phone | int | one of `COMMANDS` |
| `ORDER_ID` | watch -> phone | int | order id for `GET_DETAIL` |
| `TYPE` | phone -> watch | int | one of `TYPES` |
| `STATUS` | phone -> watch | int | `LOADING` / `OK` / `ERROR` |
| `ERROR_CODE` | phone -> watch | int | one of `ERROR_CODES` |
| `ERROR_MESSAGE` | phone -> watch | string | short, human readable |
| `SEQ` | phone -> watch | int | stream id (increments per payload) |
| `CHUNK_INDEX` | phone -> watch | int | 0-based chunk index |
| `CHUNK_COUNT` | phone -> watch | int | total chunks in this stream |
| `DATA` | phone -> watch | string | JSON text chunk |

## Commands (watch -> phone)

| Command | Value | Payload |
| --- | --- | --- |
| `REFRESH` | 1 | fetch orders + CT0 box |
| `GET_ORDERS` | 2 | fetch orders only |
| `GET_DETAIL` | 3 | fetch one order (`ORDER_ID`) |
| `GET_BOX` | 4 | fetch the CT0 box only |

## Payload types (phone -> watch)

| Type | Value | Body (JSON) |
| --- | --- | --- |
| `STATUS` | 10 | `{ status, errorCode?, message? }` |
| `ORDERS` | 11 | `{ orders: [summary...] }` |
| `ORDER_DETAIL` | 12 | `{ order: detail }` |
| `BOX` | 13 | `{ box: summary }` |

## Status and errors

`STATUS`: `LOADING` 0, `OK` 1, `ERROR` 2.

`ERROR_CODES`: `NO_TOKEN` 1, `UNAUTHORIZED` 2, `NOT_FOUND` 3, `VALIDATION` 4,
`RATE_LIMITED` 5, `SERVER` 6, `NETWORK` 7, `PARSE` 8, `UNKNOWN` 9.

The API client's string codes map through `protocol.errorCodeFromApi()`
(e.g. `unauthorized` -> `UNAUTHORIZED`).

## Domain model

Order states (`ORDER_STATES`) with display labels and UI groups:

| State | Label | Group |
| --- | --- | --- |
| `hub_pending` | At hub | active |
| `paid` | Paid | active |
| `sent` | Shipped | active |
| `arrived` | Arrived | active |
| `done` | Done | done |
| `request_for_cancel` | Cancel? | attention |
| `canceled` / `cancelled` | Cancelled | cancelled |
| `lost` | Lost | cancelled |
| unknown | Unknown | unknown |

CT0 box states (`CT0_STATES`): `ok` ("Ready"), `pending` ("On the way"),
`missing` ("Missing").

Unknown values always degrade to the `unknown` label/group instead of throwing.

## Chunking

AppMessage payloads are small, so every phone -> watch payload is:

1. serialized to JSON (`encodePayload`),
2. split into `CHUNK_SIZE`-byte chunks at UTF-8 character boundaries
   (`chunkText`, 800 bytes by default),
3. sent as one AppMessage per chunk carrying `TYPE`, `SEQ`, `CHUNK_INDEX`,
   `CHUNK_COUNT` and `DATA`.

The watch feeds each chunk to `createReassembler().push(...)`. Chunks may
arrive out of order; the reassembler returns the full JSON text once every
index is present. A new `SEQ` resets the buffer so a stale stream cannot
corrupt a fresh one. `decodePayload` then parses the JSON.

## Limits

`protocol.LIMITS` bounds what the watch is ever asked to hold:

| Limit | Value |
| --- | --- |
| `ORDERS` | 12 order summaries per `ORDERS` payload |
| `BOX_ITEMS` | 12 box items per `BOX` payload |
| `DETAIL_ITEMS` | 12 items per order detail |
| `PAYLOAD_BYTES` | 8192 bytes per reassembled payload |

The test suite encodes a worst-case payload (12 orders with long names and
shipping, or a capped box) and asserts it stays under `PAYLOAD_BYTES`.

## Watch list projection

To keep the payload (and the watch's tiny JS heap) small, PKJS sends only the
fields a list row needs for each order (`orders.toWatchList`):

| Field | Meaning |
| --- | --- |
| `id` | order id (for `GET_DETAIL`) |
| `state` | order state |
| `size` | number of items |
| `total` | formatted total |
| `who` | counterparty username |
| `ct0` | `true` for CardTrader Zero orders |

The `ORDERS` payload body is `{ orders: [...], total }`.

## Example flow

```
watch  --{ COMMAND: REFRESH }-->                         phone
watch  <--{ TYPE: STATUS,  STATUS: LOADING }--            phone
watch  <--{ TYPE: ORDERS,  SEQ: 1, CHUNK_INDEX: 0, ...}--  phone
watch  <--{ TYPE: ORDERS,  SEQ: 1, CHUNK_INDEX: 1, ...}--  phone
watch  <--{ TYPE: BOX,     SEQ: 2, CHUNK_INDEX: 0, ...}--  phone
watch  --{ COMMAND: GET_DETAIL, ORDER_ID: 38985298 }-->   phone
watch  <--{ TYPE: ORDER_DETAIL, SEQ: 3, ... }--           phone
```
