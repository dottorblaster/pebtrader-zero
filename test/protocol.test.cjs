"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const protocol = require("../src/common/protocol.js");
const orders = require("../src/pkjs/orders.js");
const ct0 = require("../src/pkjs/ct0.js");

const boxFixture = JSON.parse(
	fs.readFileSync(path.join(__dirname, "fixtures/cardtrader/ct0-box-items.json"), "utf8")
);

function worstCaseOrders(count) {
	const list = [];
	for (let i = 0; i < count; i++) {
		list.push({
			id: 38000000 + i,
			code: "2026092400000" + i,
			state: "done",
			order_as: "buyer",
			via_cardtrader_zero: true,
			size: 123,
			buyer_total: { cents: 123456, currency: "EUR" },
			formatted_total: "€1234.56",
			paid_at: "2026-09-24T12:34:56.000Z",
			sent_at: "2026-09-24T12:34:56.000Z",
			cancelled_at: null,
			presale: false,
			seller: { username: "a-very-long-seller-username" },
			order_shipping_method: {
				name: "International Tracked Parcel",
				tracked: true,
				tracking_code: "TRACK1234567890",
			},
			order_items: [
				{ name: "Some Very Long Card Name, Foil, Alternate Art", quantity: 4 },
				{ name: "Another Extremely Long Card Name With A Subtitle", quantity: 2 },
			],
		});
	}
	return list;
}

test("encode/decode round-trips", () => {
	const value = { a: 1, b: "x", c: [1, 2], d: { e: true } };
	assert.deepEqual(protocol.decodePayload(protocol.encodePayload(value)), value);
});

test("chunkText respects the byte budget for multi-byte text", () => {
	const text = "é".repeat(100); // 2 bytes each
	const chunks = protocol.chunkText(text, 10);

	for (const chunk of chunks) {
		assert.ok(protocol.byteLength(chunk) <= 10, "chunk exceeds budget");
	}
	assert.equal(chunks.join(""), text);
});

test("encodeChunks + reassembler round-trip", () => {
	const value = { orders: worstCaseOrders(3), note: "héllo wörld" };
	const chunks = protocol.encodeChunks(value, 7);
	const reassembler = protocol.createReassembler();

	let text = null;
	for (const chunk of chunks) {
		const result = reassembler.push(chunk);
		if (result !== null) text = result;
	}

	assert.notEqual(text, null);
	assert.deepEqual(protocol.decodePayload(text), value);
});

test("reassembler handles out-of-order chunks", () => {
	const chunks = protocol.encodeChunks({ orders: worstCaseOrders(4) }, 1);
	const reassembler = protocol.createReassembler();

	let text = null;
	for (const chunk of [...chunks].reverse()) {
		const result = reassembler.push(chunk);
		if (result !== null) text = result;
	}

	assert.notEqual(text, null);
	assert.equal(protocol.decodePayload(text).orders.length, 4);
});

test("a new seq resets the reassembler", () => {
	const big = protocol.encodeChunks({ data: "x".repeat(2000) }, 1, 100);
	const small = protocol.encodeChunks({ data: "small" }, 2, 100);
	const reassembler = protocol.createReassembler();

	reassembler.push(big[0]); // partial stream 1
	const result = reassembler.push(small[0]); // stream 2 completes

	assert.deepEqual(protocol.decodePayload(result), { data: "small" });
});

test("MESSAGE_KEYS matches package.json", () => {
	const pkg = require("../package.json");
	assert.deepEqual(protocol.MESSAGE_KEYS, pkg.pebble.messageKeys);
});

test("watch manifest maps the shared protocol module", () => {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(__dirname, "../src/embeddedjs/manifest.json"), "utf8")
	);
	assert.equal(manifest.modules["shared-protocol"], "../common/protocol");
});

test("packLines marks headings and joins with newlines", () => {
	const packed = protocol.packLines([
		{ t: "Head", h: true },
		{ t: "body", h: false },
	]);
	assert.equal(packed.text, protocol.HEADING_MARK + "Head\nbody");
});

test("state labels and groups degrade gracefully", () => {
	assert.equal(protocol.orderStateLabel("paid"), "Paid");
	assert.equal(protocol.orderStateLabel("nonsense"), "Unknown");
	assert.equal(protocol.orderStateGroup("done"), "done");
	assert.equal(protocol.orderStateGroup("nonsense"), "unknown");
	assert.equal(protocol.ct0StateLabel("pending"), "On the way");
	assert.equal(protocol.errorCodeFromApi("unauthorized"), protocol.ERROR_CODES.UNAUTHORIZED);
	assert.equal(protocol.errorCodeFromApi("bogus"), protocol.ERROR_CODES.UNKNOWN);
});

test("worst-case orders payload stays within budget", () => {
	const summaries = orders.normalizeOrders(worstCaseOrders(protocol.LIMITS.ORDERS), {
		maxOrders: protocol.LIMITS.ORDERS,
	});
	const text = protocol.encodePayload({ type: protocol.TYPES.ORDERS, orders: summaries });
	const size = protocol.byteLength(text);

	assert.ok(size <= protocol.LIMITS.PAYLOAD_BYTES, `orders payload ${size} bytes exceeds budget`);
	assert.ok(protocol.chunkText(text).length <= 16, "too many chunks");
});

test("worst-case box payload stays within budget", () => {
	const box = ct0.summarizeCt0Items(boxFixture, { maxItems: protocol.LIMITS.BOX_ITEMS });
	const text = protocol.encodePayload({ type: protocol.TYPES.BOX, box: box });
	const size = protocol.byteLength(text);

	assert.ok(size <= protocol.LIMITS.PAYLOAD_BYTES, `box payload ${size} bytes exceeds budget`);
	assert.ok(protocol.chunkText(text).length <= 16, "too many chunks");
});
