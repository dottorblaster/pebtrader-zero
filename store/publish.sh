#!/usr/bin/env bash
#
# Publish the current build to the Pebble app store.
#
# One-time setup: `pebble login` (opens a browser; sign in with the same GitHub
# account as the Pebble mobile app).
#
# Usage:
#   store/publish.sh                       # create/publish with the assets below
#   store/publish.sh --is-published        # extra flags go to `pebble publish`
#   CATEGORY=tools store/publish.sh        # override the store category
#   store/publish.sh --release-notes "..." 
#
# Runs non-interactively so the icons, screenshots and description below are
# actually used (an interactive `pebble publish` ignores those flags and
# prompts instead). The first run creates the app; later runs add a release.

set -euo pipefail
cd "$(dirname "$0")/.."

# Optional: the store category key. Omit to let the CLI pick its default.
CATEGORY_FLAG=()
if [ -n "${CATEGORY:-}" ]; then
  CATEGORY_FLAG=(--category "$CATEGORY")
fi

pebble publish \
  --non-interactive \
  --name "PebTrader Zero" \
  --description "$(cat store/description.md)" \
  --icon-small store/icon-small.png \
  --icon-large store/icon-large.png \
  --screenshots store/emery_*.png store/gabbro_*.png \
  "${CATEGORY_FLAG[@]}" \
  "$@"
