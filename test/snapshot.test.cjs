"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const snapshot = require("../src/common/snapshot.js");

test("round-trips a snapshot", () => {
	const value = {
		at: 123456,
		items: [{ id: 1, primary: "Done", secondary: "1 item", value: "€1.00" }],
		box: "In the box\n1 ready",
	};

	const parsed = snapshot.parse(snapshot.serialize(value));

	assert.deepEqual(parsed.items, value.items);
	assert.equal(parsed.at, 123456);
	assert.equal(parsed.box, "In the box\n1 ready");
});

test("rejects missing, corrupt and old caches", () => {
	assert.equal(snapshot.parse(null), null);
	assert.equal(snapshot.parse(""), null);
	assert.equal(snapshot.parse("{not json"), null);
	assert.equal(snapshot.parse(JSON.stringify({ v: 999, items: [] })), null);
	assert.equal(snapshot.parse(JSON.stringify({ v: snapshot.VERSION })), null);
});

test("tolerates a snapshot without a box", () => {
	const parsed = snapshot.parse(snapshot.serialize({ items: [], at: null, box: null }));
	assert.deepEqual(parsed.items, []);
	assert.equal(parsed.box, null);
});
