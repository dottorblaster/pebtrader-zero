# Configuration

Everything is configured from the Pebble mobile app: open the app list, find
**PebTrader Zero**, and tap its settings (gear) icon. All settings are stored
on the phone.

## API token

PebTrader Zero uses your own CardTrader API token.

1. Sign in at <https://www.cardtrader.com>.
2. Open your profile → **Settings** → **API**.
3. Copy the token.
4. Paste it into the app's **API token** field and save.

The token is verified when you save: the config page calls
`GET /info`. If it is wrong you get an inline error and **Save** stays
disabled. The token is stored only on the phone and is never sent to the watch
— see [../SECURITY.md](../SECURITY.md).

## Display settings

| Setting | Values | Effect |
| --- | --- | --- |
| **Orders** | My purchases (buyer) / My sales (seller) / Both | Which role to fetch orders for |
| **CardTrader Zero orders only** | on / off | Hide orders that were not placed via CardTrader Zero |
| **Refresh interval** | Manual / 15 / 30 / 60 minutes | How often the phone refreshes while the app is open (`Manual` = only on launch and on hold-select) |

## Advanced

| Setting | Effect |
| --- | --- |
| **API base URL** | Optional. Leave empty for the real CardTrader API. Point it at `tools/mock-cardtrader` (or another HTTPS endpoint) for testing. The client refuses non-HTTPS URLs except loopback |

## Where settings are stored

Phone-side `localStorage` inside the Pebble app:

| Key | Contents |
| --- | --- |
| `cardtrader-token` | API token |
| `cardtrader-api-base` | Optional API base URL override |
| `clay-settings` | Non-secret preferences (role, CT0-only, refresh interval) |

The watch keeps its own small snapshot (recent order rows and the CT0 box text)
so it can show something offline. See the watch controls in the
[README](../README.md#using-the-app).

## Changing settings

Saving settings re-validates the token, applies the new API base and re-arms
the refresh timer. The watch receives the non-secret preferences; the token and
API base stay on the phone.
