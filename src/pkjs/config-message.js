/*
 * Pure helpers for turning Clay's raw config-page response into the secret
 * token and the AppMessage dictionary for the watch.
 *
 * Deliberately free of Pebble/Clay/localStorage globals so it can be unit
 * tested in Node.
 */

/**
 * Split Clay's raw settings into the token and the (token-free) watch dict.
 *
 * @param {Object} rawSettings - Clay's raw response: string keys, `{ value }` items
 * @param {Function} prepareSettingsForAppMessage - usually `Clay.prepareSettingsForAppMessage`
 * @param {number} [apiTokenKey] - numeric message key of API_TOKEN, if declared
 * @returns {{ token: string, watchDict: Object }}
 */
function splitSettings(rawSettings, prepareSettingsForAppMessage, apiTokenKey) {
	var raw = {};
	Object.keys(rawSettings || {}).forEach(function (key) {
		raw[key] = rawSettings[key];
	});

	var tokenValue = raw.API_TOKEN && raw.API_TOKEN.value;
	var token = tokenValue == null ? "" : String(tokenValue).trim();

	var baseValue = raw.API_BASE && raw.API_BASE.value;
	var apiBase = baseValue == null ? "" : String(baseValue).trim();

	// Neither secret reaches the watch.
	delete raw.API_TOKEN;
	delete raw.API_BASE;

	var watchDict = prepareSettingsForAppMessage(raw);
	if (watchDict && apiTokenKey !== undefined) {
		delete watchDict[apiTokenKey];
	}

	return { token: token, apiBase: apiBase, watchDict: watchDict };
}

module.exports = {
	splitSettings: splitSettings,
};
