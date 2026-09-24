/*
 * Ready-to-use CardTrader API client for PKJS.
 *
 * Wires the pure client (src/pkjs/api.js) to the phone's settings and to
 * XMLHttpRequest. Import this from the PKJS code that needs to call the API.
 */

var api = require("./api");
var settings = require("./settings");
var xhrTransport = require("./xhr-transport");

module.exports = api.createClient({
	transport: xhrTransport.request,
	getToken: settings.getToken,
});
