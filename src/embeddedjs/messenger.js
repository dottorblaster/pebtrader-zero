/*
 * Watch-side messaging: sends commands to PKJS and reassembles the chunked
 * payloads it sends back. See docs/protocol.md.
 *
 * The Message key order MUST match package.json pebble.messageKeys, because
 * AppMessage assigns `10000 + index` in that order. protocol.MESSAGE_KEYS is
 * asserted to equal that list, so we reuse it here.
 *
 * Payload handling lives in src/common/message-handler.js so it can be tested.
 */

import Message from "pebble/message";
import protocol from "./protocol";
import "shared-message-handler";

const createMessageHandler = globalThis.PebTraderMessageHandler.createMessageHandler;

export function createMessenger(handlers) {
	const handle = createMessageHandler(protocol, handlers);

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
			if (handlers && handlers.onReady) handlers.onReady();
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
