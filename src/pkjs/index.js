/*
 * PebTrader Zero - phone-side (PebbleKit JS) entry point.
 *
 * Runs inside the Pebble mobile app. This is where CardTrader API calls will
 * live (the API token stays on the phone). For now it just proves the JS
 * environment is wired up.
 */

Pebble.addEventListener("ready", function (e) {
	console.log("PebTrader Zero PKJS ready");
});
