/*
 * Shared watch <-> phone protocol: domain model, message keys and codec.
 *
 * Loaded by BOTH runtimes:
 *   - PKJS (CommonJS):      var protocol = require("../common/protocol");
 *   - Watch (Moddable ESM): import "shared-protocol"; var protocol = globalThis.PebTraderProtocol;
 *
 * It is a UMD-ish side-effect module because PKJS is CommonJS and the Moddable
 * watch runtime is ESM; neither can import the other's module object directly.
 *
 * The data tables are built lazily: the watch's JS heap is tiny, and eagerly
 * allocating every map/string at startup exhausts it before the Piu app is up.
 *
 * See docs/protocol.md for the wire contract.
 */

(function (root, factory) {
	var value = factory();
	if (typeof module !== "undefined" && module.exports) module.exports = value;
	if (typeof globalThis !== "undefined") globalThis.PebTraderProtocol = value;
	else if (root) root.PebTraderProtocol = value;
})(this, function () {
	"use strict";

	var cache = {};

	// Bytes of JSON text per AppMessage chunk. The Alloy Message module opens
	// app_message with the platform maximum, but stay conservative.
	var CHUNK_SIZE = 800;

	function get(key) {
		if (!(key in cache)) cache[key] = build(key);
		return cache[key];
	}

	function build(key) {
		switch (key) {
			case "MESSAGE_KEYS":
				return [
					"API_TOKEN",
					"ROLE",
					"CT0_ONLY",
					"REFRESH_MINUTES",
					"COMMAND",
					"ORDER_ID",
					"TYPE",
					"STATUS",
					"ERROR_CODE",
					"ERROR_MESSAGE",
					"SEQ",
					"CHUNK_INDEX",
					"CHUNK_COUNT",
					"DATA",
				];
			case "COMMANDS":
				return { REFRESH: 1, GET_ORDERS: 2, GET_DETAIL: 3, GET_BOX: 4 };
			case "TYPES":
				return { STATUS: 10, ORDERS: 11, ORDER_DETAIL: 12, BOX: 13 };
			case "STATUS":
				return { LOADING: 0, OK: 1, ERROR: 2 };
			case "ERROR_CODES":
				return {
					NO_TOKEN: 1,
					UNAUTHORIZED: 2,
					NOT_FOUND: 3,
					VALIDATION: 4,
					RATE_LIMITED: 5,
					SERVER: 6,
					NETWORK: 7,
					PARSE: 8,
					UNKNOWN: 9,
				};
			case "API_ERROR_TO_PROTOCOL":
				return {
					no_token: 1,
					unauthorized: 2,
					not_found: 3,
					validation_error: 4,
					rate_limited: 5,
					server_error: 6,
					network_error: 7,
					parse_error: 8,
				};
			case "ORDER_STATES":
				return [
					"hub_pending",
					"paid",
					"sent",
					"arrived",
					"done",
					"request_for_cancel",
					"canceled",
					"cancelled",
					"lost",
				];
			case "ORDER_STATE_LABELS":
				return {
					hub_pending: "At hub",
					paid: "Paid",
					sent: "Shipped",
					arrived: "Arrived",
					done: "Done",
					request_for_cancel: "Cancel?",
					canceled: "Cancelled",
					cancelled: "Cancelled",
					lost: "Lost",
					unknown: "Unknown",
				};
			case "ORDER_STATE_GROUPS":
				return {
					hub_pending: "active",
					paid: "active",
					sent: "active",
					arrived: "active",
					request_for_cancel: "attention",
					done: "done",
					canceled: "cancelled",
					cancelled: "cancelled",
					lost: "cancelled",
					unknown: "unknown",
				};
			case "CT0_STATES":
				return ["ok", "pending", "missing"];
			case "CT0_STATE_LABELS":
				return { ok: "Ready", pending: "On the way", missing: "Missing" };
			case "LIMITS":
				return { ORDERS: 12, BOX_ITEMS: 12, DETAIL_ITEMS: 12, PAYLOAD_BYTES: 8192 };
		}
	}

	function orderStateLabel(state) {
		var labels = get("ORDER_STATE_LABELS");
		return labels[state] || labels.unknown;
	}

	function orderStateGroup(state) {
		var groups = get("ORDER_STATE_GROUPS");
		return groups[state] || "unknown";
	}

	function isKnownOrderState(state) {
		return get("ORDER_STATES").indexOf(state) !== -1;
	}

	function ct0StateLabel(state) {
		var labels = get("CT0_STATE_LABELS");
		return labels[state] || state;
	}

	function errorCodeFromApi(code) {
		var map = get("API_ERROR_TO_PROTOCOL");
		return map[code] || get("ERROR_CODES").UNKNOWN;
	}

	/** UTF-8 byte length of a JS string (surrogate-pair aware). */
	function byteLength(text) {
		var bytes = 0;
		for (var i = 0; i < text.length; i++) {
			var code = text.charCodeAt(i);
			if (code < 0x80) bytes += 1;
			else if (code < 0x800) bytes += 2;
			else if (code >= 0xd800 && code <= 0xdbff) {
				bytes += 4;
				i++;
			} else bytes += 3;
		}
		return bytes;
	}

	function encodePayload(value) {
		return JSON.stringify(value);
	}

	function decodePayload(text) {
		return JSON.parse(text);
	}

	/** Split text into chunks that each fit chunkSize UTF-8 bytes. */
	function chunkText(text, chunkSize) {
		chunkSize = chunkSize || CHUNK_SIZE;
		var chunks = [];
		var current = "";
		var currentBytes = 0;

		for (var i = 0; i < text.length; i++) {
			var ch = text.charAt(i);
			var code = text.charCodeAt(i);
			var size;
			if (code < 0x80) size = 1;
			else if (code < 0x800) size = 2;
			else if (code >= 0xd800 && code <= 0xdbff) {
				ch += text.charAt(++i);
				size = 4;
			} else size = 3;

			if (currentBytes + size > chunkSize && current.length) {
				chunks.push(current);
				current = "";
				currentBytes = 0;
			}
			current += ch;
			currentBytes += size;
		}
		if (current.length) chunks.push(current);
		return chunks.length ? chunks : [""];
	}

	/** value -> [{ seq, index, count, data }] ready for AppMessage. */
	function encodeChunks(value, seq, chunkSize) {
		var chunks = chunkText(encodePayload(value), chunkSize);
		return chunks.map(function (data, index) {
			return { seq: seq, index: index, count: chunks.length, data: data };
		});
	}

	/**
	 * Stateful chunk reassembler for the watch.
	 * push({ seq, index, count, data }) returns the full text when the last
	 * missing chunk arrives, otherwise null. A new seq resets the buffer.
	 */
	function createReassembler() {
		var state = { seq: null, count: 0, parts: null, received: 0 };

		return {
			reset: function () {
				state = { seq: null, count: 0, parts: null, received: 0 };
			},
			push: function (chunk) {
				if (!chunk || typeof chunk.count !== "number") return null;

				if (chunk.seq !== state.seq) {
					state.seq = chunk.seq;
					state.count = chunk.count;
					state.parts = new Array(chunk.count);
					state.received = 0;
				}
				if (chunk.index < 0 || chunk.index >= state.count) return null;
				if (state.parts[chunk.index] === undefined) {
					state.parts[chunk.index] = chunk.data;
					state.received++;
				}
				if (state.received === state.count) {
					var text = state.parts.join("");
					this.reset();
					return text;
				}
				return null;
			},
		};
	}

	return {
		CHUNK_SIZE: CHUNK_SIZE,
		get MESSAGE_KEYS() { return get("MESSAGE_KEYS"); },
		get COMMANDS() { return get("COMMANDS"); },
		get TYPES() { return get("TYPES"); },
		get STATUS() { return get("STATUS"); },
		get ERROR_CODES() { return get("ERROR_CODES"); },
		get API_ERROR_TO_PROTOCOL() { return get("API_ERROR_TO_PROTOCOL"); },
		get ORDER_STATES() { return get("ORDER_STATES"); },
		get ORDER_STATE_LABELS() { return get("ORDER_STATE_LABELS"); },
		get ORDER_STATE_GROUPS() { return get("ORDER_STATE_GROUPS"); },
		get CT0_STATES() { return get("CT0_STATES"); },
		get CT0_STATE_LABELS() { return get("CT0_STATE_LABELS"); },
		get LIMITS() { return get("LIMITS"); },
		orderStateLabel: orderStateLabel,
		orderStateGroup: orderStateGroup,
		isKnownOrderState: isKnownOrderState,
		ct0StateLabel: ct0StateLabel,
		errorCodeFromApi: errorCodeFromApi,
		byteLength: byteLength,
		encodePayload: encodePayload,
		decodePayload: decodePayload,
		chunkText: chunkText,
		encodeChunks: encodeChunks,
		createReassembler: createReassembler,
	};
});
