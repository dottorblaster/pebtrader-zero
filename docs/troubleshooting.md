# Troubleshooting

## The watch says "Setup needed"

No API token is configured. Add one from the phone app — see
[configuration.md](configuration.md).

## The watch says "Token invalid"

CardTrader rejected the token (HTTP 401). Copy it again from CardTrader →
Settings → API and save.

## The watch says "Offline" / "Could not reach CardTrader"

The phone could not reach the API. Check the phone's connection. If the watch
has cached data it keeps showing it, marked `cached` in the header.

## The header says "Orders · cached HH:MM"

The watch is showing its last snapshot; the most recent refresh did not
succeed. Hold **select** to refresh.

## "No response from your phone"

The watch sent a request but PKJS did not answer in time. The app retries twice
with backoff and then offers to retry (press select). Make sure the Pebble app
is running and the watch is connected.

## The build fails or the wrong message keys are used

The Pebble build caches generated message keys and does not always regenerate
them when `package.json` changes (symptoms: missing keys, unexpected key
numbers). Force a clean rebuild:

```sh
pebble clean && pebble build
```

## Emulator: "Alloy: Fatal Error - memory full"

The Moddable JS heap is too small. `src/c/mdbl.c` raises it (the firmware
requires all of `stack`/`slot`/`chunk` to be non-zero when a creation record is
supplied). Don't lower those values; raise them if you add heavy modules.

Watch the message in the logs: `# Chunk allocation: N bytes failed in fixed size
heap` means the **chunk** heap (`PEBBLE_JS_CHUNK_HEAP`), while a plain
`fxAbort memory full` with the shell already running usually means the **slot**
heap.

## Emulator: app faults immediately, `PC: 0`

The app died while creating the Moddable machine or opening AppMessage - the
app RAM budget is shared, so a JS heap that is too large leaves nothing for
`app_message_open` (which the `Message` module would otherwise call with the
8.2 KB platform maximum buffers). Shrink the heaps in `src/c/mdbl.c` and/or the
`input`/`output` buffers in `src/embeddedjs/messenger.js` until it launches, and
re-test on both emery and gabbro. See
[architecture.md](architecture.md#design-decisions).

## Nothing shows in the simulator / blank screen

- Wait for the first frame: the app draws a fixed Poco buffer, not a Piu tree.
- Make sure PebbleKit JS is ready — the watch only requests data once the
  AppMessage channel is writable.
- Check the logs: `pebble logs --emulator emery`.

## Tests

```sh
npm test
```

For end-to-end work without the real API, run the local mock server — see
[tools/mock-cardtrader/README.md](../tools/mock-cardtrader/README.md).

## Still stuck?

Open an issue with the emulator/watch model, the steps you took and the output
of `pebble logs`.
