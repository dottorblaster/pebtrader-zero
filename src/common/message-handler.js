/*
 * Pure watch-side AppMessage payload handler: reassembles chunked payloads and
 * dispatches them to callbacks.
 *
 * Lives in src/common so it can be unit-tested in Node (the watch's
 * pebble/message module cannot be). `protocol` is injected, so this file has no
 * runtime dependency of its own.
 *
 * Loaded by the watch the same way as the shared protocol: imported for its
 * side effect, then read off globalThis.
 */

(function (root, factory) {
	var value = factory();
	if (typeof module !== "undefined" && module.exports) module.exports = value;
	if (typeof globalThis !== "undefined") globalThis.PebTraderMessageHandler = value;
	else if (root) root.PebTraderMessageHandler = value;
})(this, function () {
	"use strict";

	function createMessageHandler(protocol, handlers) {
		handlers = handlers || {};
		var reassembler = protocol.createReassembler();

		return function handle(data) {
			var type = data.TYPE;
			if (type === undefined) return;

			var TYPES = protocol.TYPES;
			if (type === TYPES.STATUS) {
				if (handlers.onStatus) handlers.onStatus(data.STATUS, data.ERROR_CODE, data.ERROR_MESSAGE);
				return;
			}

			var text = reassembler.push({
				seq: data.SEQ,
				index: data.CHUNK_INDEX,
				count: data.CHUNK_COUNT,
				data: data.DATA,
			});
			if (text === null) return;

			var payload;
			try {
				payload = protocol.decodePayload(text);
			} catch (e) {
				if (handlers.onStatus) handlers.onStatus(protocol.STATUS.ERROR, protocol.ERROR_CODES.PARSE, "Bad data");
				return;
			}

			if (type === TYPES.ORDERS && handlers.onOrders) handlers.onOrders(payload);
			else if (type === TYPES.BOX && handlers.onBox) handlers.onBox(payload);
			else if (type === TYPES.ORDER_DETAIL && handlers.onDetail) handlers.onDetail(payload);
		};
	}

	return { createMessageHandler: createMessageHandler };
});
