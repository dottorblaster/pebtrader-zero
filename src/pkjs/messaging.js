/*
 * Watch <-> phone messaging (PKJS side).
 *
 * Handles COMMAND messages from the watch, fetches from CardTrader through the
 * API client and streams results back as chunked AppMessages. See
 * docs/protocol.md for the wire contract.
 *
 * Keys are the string names declared in package.json ("TYPE", "COMMAND", ...);
 * PebbleKit JS maps them to the firmware's numeric keys automatically.
 *
 * The token never travels over this channel: only normalized, non-secret data
 * is sent to the watch.
 */

var protocol = require("../common/protocol");
var client = require("./client");
var settings = require("./settings");
var orders = require("./orders");

var seq = 0;

/*
 * All sends go through one queue: AppMessage drops messages sent while a
 * previous one is still in flight, and PKJS may need a couple of tries before
 * the channel is ready.
 */
var queue = [];
var pumping = false;
var MAX_TRIES = 3;

function enqueue(dict) {
	queue.push({ dict: dict, tries: 0 });
	pump();
}

function pump() {
	if (pumping || queue.length === 0) return;
	pumping = true;
	var item = queue.shift();

	Pebble.sendAppMessage(
		item.dict,
		function () {
			pumping = false;
			pump();
		},
		function () {
			pumping = false;
			item.tries += 1;
			if (item.tries <= MAX_TRIES) {
				queue.unshift(item);
				setTimeout(pump, 300);
			} else {
				pump();
			}
		}
	);
}

function sendStatus(status, errorCode, message) {
	var dict = { TYPE: protocol.TYPES.STATUS, STATUS: status };
	if (errorCode !== undefined && errorCode !== null) dict.ERROR_CODE = errorCode;
	if (message) dict.ERROR_MESSAGE = String(message).slice(0, 60);
	enqueue(dict);
}

function sendPayload(type, payload) {
	seq = (seq % 100000) + 1;
	var chunks = protocol.encodeChunks(payload, seq);
	var list = chunks.map(function (chunk) {
		return {
			TYPE: type,
			SEQ: chunk.seq,
			CHUNK_INDEX: chunk.index,
			CHUNK_COUNT: chunk.count,
			DATA: chunk.data,
		};
	});
	list.forEach(enqueue);
}

function refreshOrders() {
	var prefs = settings.getPreferences();
	sendStatus(protocol.STATUS.LOADING);

	orders
		.fetchOrders(client, {
			role: prefs.role,
			ct0Only: prefs.ct0Only,
			maxOrders: protocol.LIMITS.ORDERS,
		})
		.then(function (result) {
			if (!result.ok) {
				sendStatus(
					protocol.STATUS.ERROR,
					protocol.errorCodeFromApi(result.error.code),
					result.error.message
				);
				return;
			}
			sendPayload(protocol.TYPES.ORDERS, {
				orders: orders.toWatchList(result.data),
				total: result.rawCount,
			});
			sendStatus(protocol.STATUS.OK);
		});
}

function onAppMessage(e) {
	var payload = (e && e.payload) || {};
	var command = payload.COMMAND;
	if (command === protocol.COMMANDS.REFRESH || command === protocol.COMMANDS.GET_ORDERS) {
		refreshOrders();
	}
}

function start() {
	// PKJS must send first: the watch cannot write until it has received a
	// message (that is what marks the AppMessage channel writable).
	Pebble.addEventListener("ready", refreshOrders);
	Pebble.addEventListener("appmessage", onAppMessage);
}

module.exports = {
	start: start,
	refreshOrders: refreshOrders,
};
