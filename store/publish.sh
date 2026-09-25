#!/usr/bin/env bash
#
# Publish the current build to the Pebble app store.
#
# One-time setup: `pebble login` (opens a browser; sign in with the same GitHub
# account as the Pebble mobile app).
#
# Usage:
#   store/publish.sh                 # interactive (prompts for category etc.)
#   store/publish.sh --is-published  # extra flags are passed to `pebble publish`
#
# The first publish creates the app; the CLI prompts for the category and uses
# the assets below. Later publishes upload a new release.

set -euo pipefail
cd "$(dirname "$0")/.."

pebble publish \
  --name "PebTrader Zero" \
  --description "$(cat store/description.md)" \
  --icon-small store/icon-small.png \
  --icon-large store/icon-large.png \
  --screenshots store/emery_*.png store/gabbro_*.png \
  "$@"
