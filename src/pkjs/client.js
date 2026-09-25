/*
 * Ready-to-use CardTrader API client for PKJS.
 *
 * Wires the pure client (src/pkjs/api.js) to the phone's settings and to
 * XMLHttpRequest. The base URL can be overridden with the advanced "API base
 * URL" setting (handy for pointing at tools/mock-cardtrader).
 */

var api = require("./api");
var settings = require("./settings");
var xhrTransport = require("./xhr-transport");

module.exports = api.createClient({
	transport: xhrTransport.request,
	getToken: settings.getToken,
	getBaseUrl: function () {
		return settings.getApiBase() || api.DEFAULT_BASE_URL;
	},
});
