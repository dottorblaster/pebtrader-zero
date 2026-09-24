"use strict";

/*
 * Smoke test for the PKJS wiring module. Requiring it must not touch
 * XMLHttpRequest or localStorage (both are only used at call time), so it
 * loads cleanly in Node.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

test("client.js exposes the API surface", () => {
	const client = require("../src/pkjs/client.js");
	assert.equal(typeof client.getInfo, "function");
	assert.equal(typeof client.getOrders, "function");
	assert.equal(typeof client.getCt0BoxItems, "function");
});
