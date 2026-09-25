"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { splitSettings } = require("../src/pkjs/config-message.js");

// Stand-in for Clay.prepareSettingsForAppMessage: string keys -> numeric keys.
const KEYS = { API_TOKEN: 100, ROLE: 101, CT0_ONLY: 102, REFRESH_MINUTES: 103 };

function prepare(settings) {
	const out = {};
	for (const [key, val] of Object.entries(settings)) {
		const value = val && typeof val === "object" && "value" in val ? val.value : val;
		out[KEYS[key]] = typeof value === "boolean" ? (value ? 1 : 0) : value;
	}
	return out;
}

test("extracts the token and strips it from the watch dict", () => {
	const raw = {
		API_TOKEN: { value: "  secret-token  " },
		ROLE: { value: "buyer" },
		CT0_ONLY: { value: true },
		REFRESH_MINUTES: { value: 15 },
	};

	const { token, watchDict } = splitSettings(raw, prepare, KEYS.API_TOKEN);

	assert.equal(token, "secret-token");
	assert.equal(watchDict[KEYS.ROLE], "buyer");
	assert.equal(watchDict[KEYS.CT0_ONLY], 1);
	assert.equal(watchDict[KEYS.REFRESH_MINUTES], 15);
	assert.equal(KEYS.API_TOKEN in watchDict, false);
	assert.equal(JSON.stringify(watchDict).includes("secret-token"), false);
});

test("extracts the optional API base and strips it from the watch dict", () => {
	const raw = {
		API_BASE: { value: "  http://127.0.0.1:8787/api/v2  " },
		ROLE: { value: "buyer" },
	};
	const { apiBase, watchDict } = splitSettings(raw, prepare, KEYS.API_TOKEN);

	assert.equal(apiBase, "http://127.0.0.1:8787/api/v2");
	assert.equal("API_BASE" in watchDict, false);
	assert.equal(watchDict[KEYS.ROLE], "buyer");
});

test("tolerates a missing token", () => {
	const { token, watchDict } = splitSettings({ ROLE: { value: "both" } }, prepare, KEYS.API_TOKEN);
	assert.equal(token, "");
	assert.equal(watchDict[KEYS.ROLE], "both");
});

test("does not mutate the input settings", () => {
	const raw = { API_TOKEN: { value: "x" }, ROLE: { value: "seller" } };
	splitSettings(raw, prepare, KEYS.API_TOKEN);
	assert.equal(raw.API_TOKEN.value, "x");
});
