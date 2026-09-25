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
		// Left to itself the Message module opens the channel with the platform
		// maximum buffers (8.2 KB each), and that firmware heap is the same
		// budget the JS machine below needs. Outbound commands are a few dozen
		// bytes; inbound payloads arrive chunked at protocol.CHUNK_SIZE. Sizing
		// the buffers to what we actually send frees several KB of RAM.
		input: 2048,
		output: 512,
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

	// The AppMessage outbox holds one message at a time. Writing while an earlier
	// send is still in flight makes app_message_outbox_begin() fail, and the
	// Moddable message module turns that into an uncaught error - which Alloy
	// shows as a fatal crash. Report the failure instead so the shell can retry.
	function write(dict) {
		try {
			message.write(dict);
			return true;
		} catch (e) {
			return false;
		}
	}

	return {
		requestRefresh() {
			return write(new Map([["COMMAND", protocol.COMMANDS.REFRESH]]));
		},
		requestBox() {
			return write(new Map([["COMMAND", protocol.COMMANDS.GET_BOX]]));
		},
		requestCt0() {
			return write(new Map([["COMMAND", protocol.COMMANDS.GET_CT0]]));
		},
		requestCt0Group(key) {
			return write(
				new Map([
					["COMMAND", protocol.COMMANDS.GET_CT0_GROUP],
					["CT0_GROUP", key],
				])
			);
		},
		requestDetail(orderId) {
			return write(
				new Map([
					["COMMAND", protocol.COMMANDS.GET_DETAIL],
					["ORDER_ID", orderId],
				])
			);
		},
	};
}
