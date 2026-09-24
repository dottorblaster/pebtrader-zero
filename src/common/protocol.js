/*
 * Shared watch <-> phone protocol: domain model, message keys and codec.
 *
 * Loaded by BOTH runtimes:
 *   - PKJS (CommonJS):      var protocol = require("../common/protocol");
 *   - Watch (Moddable ESM): import "shared-protocol"; var protocol = globalThis.PebTraderProtocol;
 *
 * It is a UMD-ish side-effect module because PKJS is CommonJS and the Moddable
 * watch runtime is ESM; neither can import the other's module object directly.
 * See docs/protocol.md for the wire contract.
 */

(function (root, factory) {
	var value = factory();
	if (typeof module !== "undefined" && module.exports) module.exports = value;
	if (typeof globalThis !== "undefined") globalThis.PebTraderProtocol = value;
	else if (root) root.PebTraderProtocol = value;
})(this, function () {
	"use strict";

	// Must match pebble.messageKeys in package.json.
	var MESSAGE_KEYS = [
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

	// Commands: watch -> phone.
	var COMMANDS = {
		REFRESH: 1, // orders + CT0 box
		GET_ORDERS: 2,
		GET_DETAIL: 3, // requires ORDER_ID
		GET_BOX: 4,
	};

	// Payload types: phone -> watch.
	var TYPES = {
		STATUS: 10,
		ORDERS: 11,
		ORDER_DETAIL: 12,
		BOX: 13,
	};

	var STATUS = {
		LOADING: 0,
		OK: 1,
		ERROR: 2,
	};

	var ERROR_CODES = {
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

	// API client error code -> protocol error code.
	var API_ERROR_TO_PROTOCOL = {
		no_token: ERROR_CODES.NO_TOKEN,
		unauthorized: ERROR_CODES.UNAUTHORIZED,
		not_found: ERROR_CODES.NOT_FOUND,
		validation_error: ERROR_CODES.VALIDATION,
		rate_limited: ERROR_CODES.RATE_LIMITED,
		server_error: ERROR_CODES.SERVER,
		network_error: ERROR_CODES.NETWORK,
		parse_error: ERROR_CODES.PARSE,
	};

	var ORDER_STATES = [
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

	var ORDER_STATE_LABELS = {
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

	var ORDER_STATE_GROUPS = {
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

	var CT0_STATES = ["ok", "pending", "missing"];
	var CT0_STATE_LABELS = { ok: "Ready", pending: "On the way", missing: "Missing" };

	// Keep watch payloads bounded (see docs/protocol.md).
	var LIMITS = {
		ORDERS: 12,
		BOX_ITEMS: 12,
		DETAIL_ITEMS: 12,
		PAYLOAD_BYTES: 8192,
	};

	// Bytes of JSON text per AppMessage chunk. The Alloy Message module opens
	// app_message with the platform maximum, but stay conservative.
	var CHUNK_SIZE = 800;

	function invert(map) {
		var out = {};
		Object.keys(map).forEach(function (key) {
			out[map[key]] = key;
		});
		return out;
	}

	function orderStateLabel(state) {
		return ORDER_STATE_LABELS[state] || ORDER_STATE_LABELS.unknown;
	}

	function orderStateGroup(state) {
		return ORDER_STATE_GROUPS[state] || "unknown";
	}

	function isKnownOrderState(state) {
		return ORDER_STATES.indexOf(state) !== -1;
	}

	function ct0StateLabel(state) {
		return CT0_STATE_LABELS[state] || state;
	}

	function errorCodeFromApi(code) {
		return API_ERROR_TO_PROTOCOL[code] || ERROR_CODES.UNKNOWN;
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
		MESSAGE_KEYS: MESSAGE_KEYS,
		COMMANDS: COMMANDS,
		COMMAND_NAMES: invert(COMMANDS),
		TYPES: TYPES,
		TYPE_NAMES: invert(TYPES),
		STATUS: STATUS,
		STATUS_NAMES: invert(STATUS),
		ERROR_CODES: ERROR_CODES,
		API_ERROR_TO_PROTOCOL: API_ERROR_TO_PROTOCOL,
		ORDER_STATES: ORDER_STATES,
		ORDER_STATE_LABELS: ORDER_STATE_LABELS,
		ORDER_STATE_GROUPS: ORDER_STATE_GROUPS,
		CT0_STATES: CT0_STATES,
		CT0_STATE_LABELS: CT0_STATE_LABELS,
		LIMITS: LIMITS,
		CHUNK_SIZE: CHUNK_SIZE,
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
