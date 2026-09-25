"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDate, formatDay, formatDateTime } = require("../src/pkjs/format.js");

test("formatDate extracts the date part", () => {
	assert.equal(formatDate("2026-08-27T01:26:53.000Z"), "2026-08-27");
	assert.equal(formatDate("2026-08-27"), "2026-08-27");
});

test("formatDate rejects junk", () => {
	assert.equal(formatDate(null), null);
	assert.equal(formatDate(undefined), null);
	assert.equal(formatDate(12345), null);
	assert.equal(formatDate("short"), null);
});

test("formatDateTime extracts date and time", () => {
	assert.equal(formatDateTime("2026-08-27T01:26:53.000Z"), "2026-08-27 01:26");
});

test("formatDateTime rejects junk", () => {
	assert.equal(formatDateTime(null), null);
	assert.equal(formatDateTime("2026-08-27"), null);
});

test("formatDay is compact", () => {
	assert.equal(formatDay("2026-09-21T08:16:32.000Z"), "21 Sep");
	assert.equal(formatDay("2026-01-05"), "5 Jan");
	assert.equal(formatDay("2026-12-31T23:59:59Z"), "31 Dec");
});

test("formatDay rejects junk", () => {
	assert.equal(formatDay(null), null);
	assert.equal(formatDay(12345), null);
	assert.equal(formatDay("short"), null);
	assert.equal(formatDay("2026-13-01"), null);
	assert.equal(formatDay("2026-00-01"), null);
});
