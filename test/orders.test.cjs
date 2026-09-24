"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const orders = require("../src/pkjs/orders.js");

const fixture = JSON.parse(
	fs.readFileSync(path.join(__dirname, "fixtures/cardtrader/orders-buyer.json"), "utf8")
);

test("summarizeOrder condenses a fixture order", () => {
	const summary = orders.summarizeOrder(fixture[0]);

	assert.equal(summary.id, 38985298);
	assert.equal(summary.code, fixture[0].code);
	assert.equal(summary.state, "done");
	assert.equal(summary.stateKnown, true);
	assert.equal(summary.role, "buyer");
	assert.equal(summary.ct0, true);
	assert.equal(summary.size, 51);
	assert.equal(summary.total, "€306.76");
	assert.equal(summary.paidAt, "2026-08-27T01:26:53.000Z");
	assert.equal(summary.sentAt, "2026-08-27T12:08:17.000Z");
	assert.equal(summary.cancelledAt, null);
	assert.equal(summary.shipping.name, "FedEx Priority");
	assert.equal(summary.shipping.tracked, true);
	assert.equal(summary.preview.length, 2);
	assert.equal(summary.preview[0].name, "Lembas");
});

test("normalizeOrders sorts newest first and caps the list", () => {
	const all = orders.normalizeOrders(fixture);
	assert.equal(all.length, 2);
	assert.equal(all[0].id, 38985298); // paid 2026-08-27
	assert.equal(all[1].id, 36619310); // paid 2026-06-29

	const capped = orders.normalizeOrders(fixture, { maxOrders: 1 });
	assert.equal(capped.length, 1);
	assert.equal(capped[0].id, 38985298);
});

test("ct0Only filters non-CardTrader-Zero orders", () => {
	const mixed = [fixture[0], Object.assign({}, fixture[1], { via_cardtrader_zero: false })];
	assert.equal(orders.normalizeOrders(mixed).length, 2);
	assert.equal(orders.normalizeOrders(mixed, { ct0Only: true }).length, 1);
});

test("summarizeOrderDetail caps items and flags truncation", () => {
	const detail = orders.summarizeOrderDetail(fixture[1], { maxItems: 3 });

	assert.equal(detail.itemCount, 318);
	assert.equal(detail.items.length, 3);
	assert.equal(detail.itemsTruncated, true);
	assert.equal(detail.items[0].name, "Island");
	assert.equal(detail.items[0].condition, "Moderately Played");
});

test("unknown states degrade gracefully", () => {
	const summary = orders.summarizeOrder({ id: 1, state: "brand_new_state" });
	assert.equal(summary.state, "brand_new_state");
	assert.equal(summary.stateKnown, false);
});

test("missing fields do not throw", () => {
	const summary = orders.summarizeOrder({});
	assert.equal(summary.id, null);
	assert.equal(summary.state, "unknown");
	assert.equal(summary.size, 0);
	assert.equal(summary.shipping, null);
	assert.deepEqual(summary.preview, []);
});

test("toWatchList projects the minimal watch fields", () => {
	const list = orders.toWatchList(orders.normalizeOrders(fixture));
	assert.equal(list.length, 2);
	assert.deepEqual(Object.keys(list[0]).sort(), ["ct0", "id", "size", "state", "total", "who"]);
	assert.equal(list[0].state, "done");
	assert.equal(list[0].size, 51);
	assert.equal(list[0].total, "€306.76");
	assert.equal(list[0].ct0, true);
});

test("fetchOrders passes filters to the client and normalizes", async () => {
	const calls = [];
	const client = {
		getOrders(params) {
			calls.push(params);
			return Promise.resolve({ ok: true, status: 200, data: fixture });
		},
	};

	const result = await orders.fetchOrders(client, { role: "buyer", ct0Only: true, maxOrders: 1 });

	assert.deepEqual(calls[0], { sort: "date.desc", limit: 100, order_as: "buyer" });
	assert.equal(result.ok, true);
	assert.equal(result.rawCount, 2);
	assert.equal(result.data.length, 1);
});

test("fetchOrders omits order_as for role 'both' and propagates errors", async () => {
	const calls = [];
	const client = {
		getOrders(params) {
			calls.push(params);
			return Promise.resolve({
				ok: false,
				status: 401,
				error: { code: "unauthorized", message: "nope" },
			});
		},
	};

	const result = await orders.fetchOrders(client, { role: "both" });

	assert.equal("order_as" in calls[0], false);
	assert.equal(result.ok, false);
	assert.equal(result.error.code, "unauthorized");
});
