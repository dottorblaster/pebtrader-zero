"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const protocol = require("../src/common/protocol.js");
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

test("groupSummary buckets the fixture into ready and on the way", () => {
	const { groups } = ct0.groupSummary(fixture);

	assert.deepEqual(groups.map(group => group.key), ["ok", "pending"]);
	assert.equal(groups[0].label, "Ready to ship");
	assert.equal(groups[0].units, 26);
	assert.equal(groups[0].itemCount, 10);
	assert.equal(groups[0].value, "86.35 EUR");
	assert.equal(groups[0].secondary, "26 cards");
	assert.equal(groups[1].label, "On the way");
	assert.equal(groups[1].units, 31);
	assert.equal(groups[1].itemCount, 31);

	// Every item in a group really holds units of that state.
	groups.forEach(group => {
		group.items.forEach(item => assert.ok(item.states[group.key] > 0, "item has no units in " + group.key));
	});
	// Groups account for every unit in the box.
	const units = groups.reduce((sum, group) => sum + group.units, 0);
	assert.equal(units, 57);
});

test("groups only appear when they hold units", () => {
	const { groups } = ct0.groupSummary([
		{ id: 1, name: "A", quantity: { missing: 2 }, buyer_price: { cents: 100, currency: "EUR" } },
	]);

	assert.deepEqual(groups.map(group => group.key), ["missing"]);
	assert.equal(groups[0].label, "Missing");
	assert.equal(groups[0].units, 2);
});

test("groupRows builds minimal watch rows", () => {
	const { groups } = ct0.groupSummary(fixture);
	const rows = ct0.groupRows(groups);

	assert.deepEqual(rows[0], {
		key: "ok",
		label: "Ready to ship",
		secondary: "26 cards",
		value: "86.35 EUR",
	});
	// Only what the watch draws - no item arrays.
	assert.deepEqual(Object.keys(rows[0]).sort(), ["key", "label", "secondary", "value"]);
});

test("itemsInState sorts pending by soonest ETA and ready by newest arrival", () => {
	const items = [
		{ id: 1, quantity: { pending: 1 }, estimated_arrived_at: "2026-10-01T00:00:00Z" },
		{ id: 2, quantity: { pending: 1 }, estimated_arrived_at: "2026-09-01T00:00:00Z" },
		{ id: 3, quantity: { ok: 1 }, arrived_at: "2026-08-01T00:00:00Z" },
		{ id: 4, quantity: { ok: 1 }, arrived_at: "2026-09-01T00:00:00Z" },
	];
	const summaries = items.map(ct0.summarizeItem);

	assert.deepEqual(ct0.itemsInState(summaries, "pending").map(item => item.id), [2, 1]);
	assert.deepEqual(ct0.itemsInState(summaries, "ok").map(item => item.id), [4, 3]);
});

test("groupLines lists the totals and one line per purchase", () => {
	const { groups } = ct0.groupSummary(fixture);
	const group = groups[0];
	const lines = ct0.groupLines(group);
	const text = lines.map(line => line.t);

	assert.deepEqual(
		lines.filter(line => line.h).map(line => line.t),
		["Ready to ship"]
	);
	assert.equal(text[1], "10 purchases · 26 cards · 86.35 EUR");
	// Heading, totals, then one line per purchase.
	assert.equal(lines.length, 2 + group.itemCount);
	group.items.forEach((item, index) => {
		assert.equal(text[2 + index], ct0.groupItemLine(item));
	});
	// quantity x name · price · compact date
	assert.match(text[2], /^\d+x .+ \u00b7 \S+ \u00b7 \d+ [A-Z][a-z]{2}$/);
});

test("group lines carry a price and a compact date", () => {
	const { groups } = ct0.groupSummary(fixture);
	const ready = ct0.groupLines(groups[0]).map(line => line.t);
	const pending = ct0.groupLines(groups[1]).map(line => line.t);

	// Ready items end on the arrival day, traveling ones on their ETA.
	assert.ok(ready.some(line => /\S+ \u00b7 \d+ [A-Z][a-z]{2}$/.test(line)), "ready line has price + day");
	assert.ok(pending.some(line => /ETA \d+ [A-Z][a-z]{2}$/.test(line)), "pending line has an ETA");
});

test("boxLines keeps the two-line box format", () => {
	const summary = ct0.summarizeCt0Items(fixture);
	const text = ct0.boxLines(summary).map(line => line.t);

	assert.ok(text.some(line => line.indexOf("ready · arrived ") === 0));
});

test("groupLines caps long groups and says how many are left", () => {
	const { groups } = ct0.groupSummary(fixture);
	const lines = ct0.groupLines(groups[1], { maxItems: 4 });
	const text = lines.map(line => line.t);

	assert.equal(lines.length, 2 + 4 + 1);
	assert.equal(text[text.length - 1], "\u2026 and 27 more");
});

test("groupLines copes with an empty group", () => {
	const lines = ct0.groupLines({ key: "ok", label: "Ready to ship", units: 0, itemCount: 0, items: [] });

	assert.deepEqual(lines, [
		{ t: "Ready to ship", h: true },
		{ t: "0 purchases · 0 cards", h: false },
		{ t: "Nothing here right now.", h: false },
	]);
});

test("fetchCt0Groups returns the group rows and a packed payload", async () => {
	const client = { getCt0BoxItems: () => Promise.resolve({ ok: true, status: 200, data: fixture }) };
	const result = await ct0.fetchCt0Groups(client, { maxItems: 12 });

	assert.equal(result.ok, true);
	assert.equal(result.rows.length, 2);
	assert.deepEqual(result.payload.groups, result.rows);
});

test("fetchCt0Group returns lines for one state", async () => {
	const client = { getCt0BoxItems: () => Promise.resolve({ ok: true, status: 200, data: fixture }) };
	const result = await ct0.fetchCt0Group(client, "pending", { maxItems: 40 });

	assert.equal(result.ok, true);
	assert.equal(typeof result.payload.text, "string");
	assert.equal(result.lines[0].t, "On the way");
	assert.equal(result.payload.text.split("\n")[0], protocol.HEADING_MARK + "On the way");
});

test("fetchCt0Group degrades when the group emptied out", async () => {
	const client = { getCt0BoxItems: () => Promise.resolve({ ok: true, status: 200, data: [] }) };
	const result = await ct0.fetchCt0Group(client, "ok");

	assert.equal(result.ok, true);
	assert.deepEqual(result.lines, [
		{ t: "Ready to ship", h: true },
		{ t: "Nothing here right now.", h: false },
	]);
});

test("fetchCt0Group propagates client errors", async () => {
	const client = {
		getCt0BoxItems: () =>
			Promise.resolve({ ok: false, status: 429, error: { code: "rate_limited", message: "slow down" } }),
	};
	const result = await ct0.fetchCt0Group(client, "ok");

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "rate_limited");
});
