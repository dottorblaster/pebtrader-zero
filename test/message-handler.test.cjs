"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../src/common/protocol.js");
const { createMessageHandler } = require("../src/common/message-handler.js");

function feed(handle, type, payload, seq) {
	protocol.encodeChunks(payload, seq).forEach(chunk => {
		handle({
			TYPE: type,
			SEQ: chunk.seq,
			CHUNK_INDEX: chunk.index,
			CHUNK_COUNT: chunk.count,
			DATA: chunk.data,
		});
	});
}

test("dispatches an orders payload", () => {
	const received = [];
	const handle = createMessageHandler(protocol, { onOrders: payload => received.push(payload) });

	feed(handle, protocol.TYPES.ORDERS, { orders: [{ id: 1 }], total: 1 }, 1);

	assert.equal(received.length, 1);
	assert.equal(received[0].orders.length, 1);
});

test("dispatches an order detail payload", () => {
	const received = [];
	const handle = createMessageHandler(protocol, { onDetail: payload => received.push(payload) });
	const lines = [{ t: "Done", h: true }, { t: "Total: €1", h: false }];

	feed(handle, protocol.TYPES.ORDER_DETAIL, { lines }, 2);

	assert.equal(received.length, 1);
	assert.equal(received[0].lines.length, 2);
});

test("dispatches status", () => {
	const statuses = [];
	const handle = createMessageHandler(protocol, {
		onStatus: (status, code, message) => statuses.push([status, code, message]),
	});

	handle({
		TYPE: protocol.TYPES.STATUS,
		STATUS: protocol.STATUS.ERROR,
		ERROR_CODE: protocol.ERROR_CODES.NO_TOKEN,
		ERROR_MESSAGE: "nope",
	});

	assert.deepEqual(statuses[0], [protocol.STATUS.ERROR, protocol.ERROR_CODES.NO_TOKEN, "nope"]);
});

test("dispatches a ct0 group payload", () => {
	const received = [];
	const handle = createMessageHandler(protocol, { onCt0Group: payload => received.push(payload) });

	feed(handle, protocol.TYPES.CT0_GROUP, { text: protocol.HEADING_MARK + "Ready to ship\n26 cards" }, 3);

	assert.equal(received.length, 1);
	assert.equal(received[0].text.split("\n")[1], "26 cards");
});

test("dispatches a ct0 groups payload", () => {
	const received = [];
	const handle = createMessageHandler(protocol, { onCt0Groups: payload => received.push(payload) });

	feed(handle, protocol.TYPES.CT0_GROUPS, { groups: [{ key: "ok" }, { key: "pending" }] }, 4);

	assert.equal(received.length, 1);
	assert.deepEqual(received[0].groups.map(group => group.key), ["ok", "pending"]);
});

test("consecutive streams do not corrupt each other", () => {
	const received = [];
	const handle = createMessageHandler(protocol, {
		onOrders: payload => received.push(["orders", payload]),
		onDetail: payload => received.push(["detail", payload]),
	});

	const big = { lines: Array.from({ length: 40 }, (_, i) => ({ t: "line " + i, h: false })) };
	feed(handle, protocol.TYPES.ORDERS, { orders: [{ id: 1 }] }, 1);
	feed(handle, protocol.TYPES.ORDER_DETAIL, big, 2);

	assert.deepEqual(received.map(entry => entry[0]), ["orders", "detail"]);
	assert.equal(received[1][1].lines.length, 40);
});

test("a new seq discards a partial stream", () => {
	const received = [];
	const handle = createMessageHandler(protocol, { onDetail: payload => received.push(payload) });

	const partial = protocol.encodeChunks({ lines: [{ t: "x".repeat(2000) }] }, 1, 100);
	handle({ TYPE: protocol.TYPES.ORDER_DETAIL, SEQ: partial[0].seq, CHUNK_INDEX: partial[0].index, CHUNK_COUNT: partial[0].count, DATA: partial[0].data });
	feed(handle, protocol.TYPES.ORDER_DETAIL, { lines: [{ t: "done" }] }, 2);

	assert.equal(received.length, 1);
	assert.equal(received[0].lines[0].t, "done");
});
