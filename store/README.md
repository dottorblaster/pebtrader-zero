# App store submission

Everything needed to publish PebTrader Zero to the Pebble app store, and how to
do it. For the version/tag → GitHub Release flow, see
[docs/releasing.md](../docs/releasing.md).

## Assets

| File | Used as |
| --- | --- |
| `icon-small.png` (80×80) | store **iconSmall** |
| `icon-large.png` (144×144) | store **iconLarge** |
| `emery_list.png`, `emery_detail.png`, `emery_box.png` | Emery screenshots |
| `gabbro_list.png`, `gabbro_detail.png`, `gabbro_box.png` | Gabbro screenshots |
| `description.md` | store description |

The watch **launcher** icon is separate: `resources/images/icon.png` (25×25,
`menuIcon`). The store icons above are generated from the same artwork.

> Screenshot filenames must start with the platform and an underscore
> (`emery_…`, `gabbro_…`): `pebble publish` derives the platform from the
> prefix.

## 1. Log in (one-time)

```sh
pebble login
```

This opens a browser; sign in with the same GitHub account you use in the
Pebble mobile app. Check with `pebble login --status`.

## 2. Publish

```sh
store/publish.sh
```

The first run creates the app. It is interactive, so it can prompt for the
**category** (e.g. *Tools & Utilities*). The script supplies the name,
description, icons and screenshots.

For later releases, add `--is-published` (and `--release-notes`) as needed:

```sh
store/publish.sh --is-published --release-notes "Add the CT0 box screen."
```

The underlying command is:

```sh
pebble publish \
  --name "PebTrader Zero" \
  --description "$(cat store/description.md)" \
  --icon-small store/icon-small.png \
  --icon-large store/icon-large.png \
  --screenshots store/emery_*.png store/gabbro_*.png
```

Useful flags: `--category KEY`, `--release-notes TEXT`, `--is-published`,
`--replace-screenshots`, `--sdk VERSION`. `--non-interactive` requires
`--description` and is meant for CI.

## Regenerating the screenshots

The screenshots are captured from the emulator against the local mock server so
they contain no personal data:

```sh
node tools/mock-cardtrader/server.mjs &            # mock API
# point the emulator's PKJS at it (token "mock-token", base
# http://127.0.0.1:8787/api/v2), then:
pebble install --emulator emery
pebble screenshot --emulator emery --no-open store/emery_list.png
# ...and the same for gabbro.
```

Alternatively, `pebble publish` can capture screenshots from the emulator for
you (option 1 when prompted).
