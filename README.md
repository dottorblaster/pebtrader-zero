# PebTrader Zero

[![Build](https://github.com/dottorblaster/pebtrader-zero/actions/workflows/build.yml/badge.svg)](https://github.com/dottorblaster/pebtrader-zero/actions/workflows/build.yml)

A PebbleOS (Alloy) watch app to view the state of your
[CardTrader Zero](https://www.cardtrader.com/) orders, right on your wrist.

The watch UI is written in JavaScript with the [Alloy](https://developer.repebble.com/guides/alloy/)
framework (Moddable XS). CardTrader API calls run on the phone in PebbleKit JS,
so your API token never leaves the phone.

> **Status:** early scaffold. The app currently renders a hello-world screen.
> See the [issues](https://github.com/dottorblaster/pebtrader-zero/issues) for the roadmap.

## Target platforms

Alloy supports the modern Pebble hardware only:

- **emery** — Pebble Time 2
- **gabbro** — Pebble Round 2

## Getting started

### 1. Install the toolchain

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then
install the Pebble CLI and SDK:

```sh
uv tool install pebble-tool
pebble sdk install latest
```

Make sure `~/.local/bin` is on your `PATH` (the `uv tool install` output tells
you how to add it).

### 2. Install emulator dependencies

The emulator needs SDL2 and a few graphics libraries. On openSUSE:

```sh
sudo zypper install libSDL2-2_0-0 glib2-tools libpixman-1-0 libz1
```

On Ubuntu:

```sh
sudo apt install libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0
```

### 3. Build and run

```sh
pebble build                      # build for all targetPlatforms
pebble install --emulator emery   # install and launch on the emery emulator
pebble install --emulator gabbro  # ...or the gabbro emulator
```

To install on a physical watch (Developer Connection enabled in the Pebble app):

```sh
pebble login
pebble install --cloudpebble
```

## Project layout

```
src/c/mdbl.c                   C glue around the Moddable runtime
src/embeddedjs/main.js         JavaScript that runs on the watch (UI + logic)
src/embeddedjs/manifest.json   Moddable manifest (lists JS modules to build)
src/pkjs/index.js              PebbleKit JS: CardTrader API calls (phone side)
package.json                   Project metadata (UUID, platforms, resources)
wscript                        Build rules - usually no need to edit
```

Alloy apps have two JavaScript environments: `embeddedjs` runs on the watch,
`pkjs` runs on the connected phone.

## Documentation

- Alloy framework: <https://developer.repebble.com/guides/alloy/>
- Pebble developer docs: <https://developer.repebble.com/>
- PebbleOS firmware docs: <https://pebbleos-core.readthedocs.io/>
- CardTrader API: <https://www.cardtrader.com/en/docs/api>
