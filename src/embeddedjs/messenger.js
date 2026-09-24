/*
 * Watch-side messaging: sends commands to PKJS and reassembles the chunked
 * payloads it sends back. See docs/protocol.md.
 *
 * The Message key order MUST match package.json pebble.messageKeys, because
 * AppMessage assigns `10000 + index` in that order. protocol.MESSAGE_KEYS is
 * asserted to equal that list, so we reuse it here.
 */

import Message from "pebble/message";
import protocol from "./protocol";

export function createMessenger(handlers) {
	handlers = handlers || {};
	const reassembler = protocol.createReassembler();

	function handle(data) {
		const type = data.TYPE;
		if (type === undefined) return;

		const TYPES = protocol.TYPES;
		if (type === TYPES.STATUS) {
			if (handlers.onStatus) handlers.onStatus(data.STATUS, data.ERROR_CODE, data.ERROR_MESSAGE);
			return;
		}

		const text = reassembler.push({
			seq: data.SEQ,
			index: data.CHUNK_INDEX,
			count: data.CHUNK_COUNT,
			data: data.DATA,
		});
		if (text === null) return;

		let payload;
		try {
			payload = protocol.decodePayload(text);
		} catch (e) {
			if (handlers.onStatus) handlers.onStatus(protocol.STATUS.ERROR, protocol.ERROR_CODES.PARSE, "Bad data");
			return;
		}

		if (type === TYPES.ORDERS && handlers.onOrders) handlers.onOrders(payload);
		else if (type === TYPES.BOX && handlers.onBox) handlers.onBox(payload);
		else if (type === TYPES.ORDER_DETAIL && handlers.onDetail) handlers.onDetail(payload);
	}

	const message = new Message({
		keys: protocol.MESSAGE_KEYS,
		onReadable() {
			const msg = this.read();
			const data = {};
			msg.forEach((value, key) => {
				data[key] = value;
			});
			handle(data);
		},
		onWritable() {
			if (handlers.onReady) handlers.onReady();
		},
	});

	return {
		requestRefresh() {
			message.write(new Map([["COMMAND", protocol.COMMANDS.REFRESH]]));
		},
		requestBox() {
			message.write(new Map([["COMMAND", protocol.COMMANDS.GET_BOX]]));
		},
		requestDetail(orderId) {
			message.write(
				new Map([
					["COMMAND", protocol.COMMANDS.GET_DETAIL],
					["ORDER_ID", orderId],
				])
			);
		},
	};
}
