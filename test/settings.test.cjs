"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Minimal localStorage shim, installed before requiring the module.
const store = new Map();
global.localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => store.set(key, String(value)),
	removeItem: (key) => store.delete(key),
};

const settings = require("../src/pkjs/settings.js");

test("token round-trips and clears", () => {
	settings.setToken("abc123");
	assert.equal(settings.getToken(), "abc123");

	settings.setToken("");
	assert.equal(settings.getToken(), "");
});

test("preferences fall back to defaults", () => {
	store.clear();
	assert.deepEqual(settings.getPreferences(), {
		role: "both",
		ct0Only: false,
		refreshMinutes: 0,
	});
});

test("preferences are read from clay-settings", () => {
	store.clear();
	store.set(
		"clay-settings",
		JSON.stringify({ ROLE: "seller", CT0_ONLY: 1, REFRESH_MINUTES: "30" })
	);
	assert.deepEqual(settings.getPreferences(), {
		role: "seller",
		ct0Only: true,
		refreshMinutes: 30,
	});
});
