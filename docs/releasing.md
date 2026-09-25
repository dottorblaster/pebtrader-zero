# Releasing

PebTrader Zero ships through two channels:

| Channel | Trigger | Result |
| --- | --- | --- |
| **GitHub Release** | pushing a `v*` tag | the `Release` workflow tests, builds and attaches `pebtrader-zero.pbw` |
| **Pebble app store** | `store/publish.sh` | a new store release |

## Versioning

`package.json` `version` uses three parts (`major.minor.0`, as the SDK expects).
Tag releases `v<version>`, e.g. `v0.1.0`.

## 1. Cut a GitHub Release

```sh
# bump the version in package.json, then:
git commit -am "chore(release): v0.2.0"
git tag -a v0.2.0 -m "PebTrader Zero 0.2.0"
git push origin main
git push origin v0.2.0
```

Pushing the tag runs `.github/workflows/release.yml`, which:

1. installs the toolchain,
2. runs `npm test`,
3. runs `pebble build`,
4. creates the GitHub Release for the tag and attaches `build/*.pbw`, with
   auto-generated notes.

Verify:

```sh
gh release view v0.2.0
gh release download v0.2.0
```

A normal push to `main` runs the **CI** workflow (tests + build) but does **not**
create a release.

## 2. Publish to the app store

See [store/README.md](../store/README.md) for the full guide. In short:

```sh
pebble login          # one-time, opens a browser
store/publish.sh      # first run creates the app; prompts for the category
store/publish.sh --is-published --release-notes "Added the CT0 box screen."
```

The first store publish creates the app; later runs upload a new release for the
same app (matched by the app UUID `61efda9c-…`).

## Before releasing

- `npm test` is green (CI enforces it).
- A clean `pebble clean && pebble build` works (the build caches generated
  message keys — see [troubleshooting.md](troubleshooting.md)).
- The assets in `store/` (icons, screenshots, description) are up to date.
- You've done the manual checks the emulator can't cover: vibration, the
  request timeout, and the `watch.connected` offline transition.

## Checklist

- [ ] `package.json` version bumped
- [ ] `npm test` green
- [ ] `pebble clean && pebble build` green
- [ ] `store/` assets up to date
- [ ] tag pushed → `Release` workflow green → `.pbw` attached
- [ ] `store/publish.sh` run (and `--is-published` when ready)
