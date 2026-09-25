"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const ct0 = require("../src/pkjs/ct0.js");

const fixture = JSON.parse(
	fs.readFileSync(path.join(__dirname, "fixtures/cardtrader/ct0-box-items.json"), "utf8")
);

function expectedValueCents(items) {
	return items.reduce((sum, item) => {
		const units = Object.values(item.quantity).reduce((a, b) => a + b, 0);
		return sum + (item.buyer_price.cents || 0) * units;
	}, 0);
}

test("summarizeCt0Items aggregates the fixture", () => {
	const summary = ct0.summarizeCt0Items(fixture);

	assert.equal(summary.itemCount, 41);
	assert.equal(summary.counts.ok, 26);
	assert.equal(summary.counts.pending, 31);
	assert.equal(summary.counts.missing, 0);
	assert.equal(summary.units, 57);
	assert.equal(summary.currency, "EUR");

	const expected = expectedValueCents(fixture);
	assert.equal(summary.totalValueCents, expected);
	assert.equal(summary.totalValue, (expected / 100).toFixed(2) + " EUR");
	assert.equal(
		summary.valueByState.ok + summary.valueByState.pending + summary.valueByState.missing,
		expected
	);
});

test("soonest ETA is the earliest pending estimate", () => {
	const summary = ct0.summarizeCt0Items(fixture);
	const pendingEtas = fixture
		.filter((item) => (item.quantity.pending || 0) > 0 && item.estimated_arrived_at)
		.map((item) => item.estimated_arrived_at)
		.sort();

	assert.equal(summary.soonestEta, pendingEtas[0]);
});

test("items are capped and the truncation flag is set", () => {
	const summary = ct0.summarizeCt0Items(fixture, { maxItems: 5 });
	assert.equal(summary.items.length, 5);
	assert.equal(summary.itemsTruncated, true);
});

test("missing and pending are distinguishable", () => {
	const items = [
		{ id: 1, name: "A", quantity: { missing: 2 }, buyer_price: { cents: 100, currency: "EUR" } },
		{ id: 2, name: "B", quantity: { pending: 3 }, buyer_price: { cents: 200, currency: "EUR" } },
	];
	const summary = ct0.summarizeCt0Items(items);

	assert.equal(summary.counts.missing, 2);
	assert.equal(summary.counts.pending, 3);
	assert.equal(summary.valueByState.missing, 200);
	assert.equal(summary.valueByState.pending, 600);
	assert.equal(summary.items.find((item) => item.name === "A").state, "missing");
	assert.equal(summary.items.find((item) => item.name === "B").state, "pending");
});

test("mixed states pick the dominant one", () => {
	const summary = ct0.summarizeCt0Items([{ id: 1, quantity: { ok: 1, pending: 2 } }]);
	assert.deepEqual(summary.counts, { ok: 1, pending: 2, missing: 0, other: 0 });
	assert.equal(summary.items[0].state, "pending");
});

test("empty box yields zeroes", () => {
	const summary = ct0.summarizeCt0Items([]);
	assert.equal(summary.itemCount, 0);
	assert.equal(summary.units, 0);
	assert.equal(summary.totalValueCents, 0);
	assert.equal(summary.soonestEta, null);
	assert.deepEqual(summary.items, []);
});

test("items are sorted by soonest ETA", () => {
	const items = [
		{ id: 1, quantity: { pending: 1 }, estimated_arrived_at: "2026-10-01T00:00:00Z" },
		{ id: 2, quantity: { pending: 1 }, estimated_arrived_at: "2026-09-01T00:00:00Z" },
		{ id: 3, quantity: { ok: 1 }, arrived_at: "2026-08-01T00:00:00Z" },
	];
	const summary = ct0.summarizeCt0Items(items);
	assert.deepEqual(summary.items.map((item) => item.id), [2, 1, 3]);
});

test("boxLines summarises the fixture box", () => {
	const summary = ct0.summarizeCt0Items(fixture);
	const lines = ct0.boxLines(summary);
	const text = lines.map(line => line.t);

	assert.ok(lines.some(line => line.t === "In the box" && line.h === true));
	assert.ok(text.includes("26 ready"));
	assert.ok(text.includes("31 on the way"));
	assert.ok(text.some(t => t.indexOf("Total value:") === 0));
	assert.ok(lines.some(line => line.t === "Items (41)" && line.h === true));
});

test("boxLines distinguishes missing items", () => {
	const summary = ct0.summarizeCt0Items([{ id: 1, name: "A", quantity: { missing: 2 }, buyer_price: { cents: 100, currency: "EUR" } }]);
	const lines = ct0.boxLines(summary);
	assert.ok(lines.some(line => line.t === "2 missing (refunded)"));
	assert.ok(lines.some(line => line.t === "2x A"));
	assert.ok(lines.some(line => line.t.indexOf("missing") !== -1 && !line.h));
});

test("fetchCt0Box normalizes and propagates errors", async () => {
	const okClient = {
		getCt0BoxItems: () => Promise.resolve({ ok: true, status: 200, data: fixture }),
	};
	const ok = await ct0.fetchCt0Box(okClient);
	assert.equal(ok.ok, true);
	assert.equal(ok.data.itemCount, 41);
	assert.ok(Array.isArray(ok.lines));
	assert.equal(typeof ok.payload.text, "string");

	const errClient = {
		getCt0BoxItems: () =>
			Promise.resolve({
				ok: false,
				status: 401,
				error: { code: "unauthorized", message: "nope" },
			}),
	};
	const err = await ct0.fetchCt0Box(errClient);
	assert.equal(err.ok, false);
	assert.equal(err.error.code, "unauthorized");
});
