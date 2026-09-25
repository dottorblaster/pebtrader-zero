/*
 * Phone-side settings access.
 *
 * The CardTrader API token lives in its own localStorage key so it is easy to
 * keep out of anything sent to the watch. The non-secret preferences are
 * managed by Clay under the "clay-settings" key.
 */

var TOKEN_KEY = "cardtrader-token";
var API_BASE_KEY = "cardtrader-api-base";
var CLAY_SETTINGS_KEY = "clay-settings";

function readClaySettings() {
	try {
		return JSON.parse(localStorage.getItem(CLAY_SETTINGS_KEY)) || {};
	} catch (e) {
		return {};
	}
}

function getToken() {
	return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
	if (token) {
		localStorage.setItem(TOKEN_KEY, token);
	} else {
		localStorage.removeItem(TOKEN_KEY);
	}
}

/** Advanced override; empty means the real CardTrader API. */
function getApiBase() {
	return localStorage.getItem(API_BASE_KEY) || "";
}

function setApiBase(url) {
	if (url) {
		localStorage.setItem(API_BASE_KEY, url);
	} else {
		localStorage.removeItem(API_BASE_KEY);
	}
}

function getPreferences() {
	var stored = readClaySettings();
	return {
		role: stored.ROLE === "buyer" || stored.ROLE === "seller" ? stored.ROLE : "both",
		ct0Only: stored.CT0_ONLY === true || stored.CT0_ONLY === 1,
		refreshMinutes: Number(stored.REFRESH_MINUTES) || 0,
	};
}

module.exports = {
	getToken: getToken,
	setToken: setToken,
	getApiBase: getApiBase,
	setApiBase: setApiBase,
	getPreferences: getPreferences,
};
