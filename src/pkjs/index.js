/*
 * PebTrader Zero - phone-side (PebbleKit JS) entry point.
 *
 * Runs inside the Pebble mobile app. The CardTrader API token is entered via
 * the Clay config page, stored in phone localStorage and used here for the API
 * calls. It is deliberately never sent to the watch.
 */

var Clay = require("@rebble/clay");
var messageKeys = require("message_keys");
var protocol = require("../common/protocol");
var clayConfig = require("./config");
var customClay = require("./custom-clay");
var settings = require("./settings");
var configMessage = require("./config-message");
var messaging = require("./messaging");

// Watch <-> phone command channel (separate from Clay's config events).
messaging.start();

// We handle showConfiguration/webviewclosed ourselves so the token can be
// stripped before anything is sent to the watch.
var clay = new Clay(clayConfig, customClay, { autoHandleEvents: false });

Pebble.addEventListener("ready", function () {
	console.log("PebTrader Zero PKJS ready (chunk=" + protocol.CHUNK_SIZE + ")");
});

Pebble.addEventListener("showConfiguration", function () {
	Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener("webviewclosed", function (e) {
	if (!e || !e.response) {
		return;
	}

	// Clay persists the raw settings (including the token) to localStorage.
	var raw = clay.getSettings(e.response, false);

	var split = configMessage.splitSettings(
		raw,
		Clay.prepareSettingsForAppMessage,
		messageKeys.API_TOKEN
	);

	settings.setToken(split.token);
	settings.setApiBase(split.apiBase);
	messaging.reconfigure();

	// Only non-secret settings are ever sent to the watch.
	Pebble.sendAppMessage(
		split.watchDict,
		function () {
			console.log("Settings sent to watch");
		},
		function () {
			console.log("Could not send settings to watch");
		}
	);
});
