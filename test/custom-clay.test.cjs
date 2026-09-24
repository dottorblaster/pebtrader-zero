"use strict";

/*
 * Tests the Clay custom function (src/pkjs/custom-clay.js) with a mocked
 * config-page environment, so token validation is verified without a phone.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const customClay = require("../src/pkjs/custom-clay.js");

function makeItem(value) {
	return {
		value,
		enabled: true,
		handlers: {},
		get() {
			return this.value;
		},
		set(next) {
			this.value = next;
			return this;
		},
		disable() {
			this.enabled = false;
			return this;
		},
		enable() {
			this.enabled = true;
			return this;
		},
		on(event, handler) {
			this.handlers[event] = handler;
			return this;
		},
	};
}

class MockXHR {
	open(method, url) {
		this.method = method;
		this.url = url;
	}
	setRequestHeader(name, value) {
		this.headers = this.headers || {};
		this.headers[name] = value;
	}
	send() {
		MockXHR.last = this;
	}
	respond(status) {
		this.status = status;
		if (this.onload) this.onload();
	}
	fail() {
		if (this.onerror) this.onerror();
	}
}

function buildPage(token) {
	const items = {
		API_TOKEN: makeItem(token),
		"token-status": makeItem(""),
		submit: makeItem("Save"),
	};
	const clayConfig = {
		EVENTS: { AFTER_BUILD: "afterBuild" },
		handlers: {},
		on(event, handler) {
			this.handlers[event] = handler;
		},
		getItemByMessageKey(key) {
			return items[key];
		},
		getItemById(id) {
			return items[id];
		},
	};
	global.XMLHttpRequest = MockXHR;
	customClay.call(clayConfig, { $: {} });
	clayConfig.handlers.afterBuild.call(clayConfig);
	return items;
}

test("empty token disables save", () => {
	const items = buildPage("");
	assert.match(items["token-status"].value, /Enter your CardTrader API token/);
	assert.equal(items.submit.enabled, false);
});

test("valid token enables save", () => {
	const items = buildPage("good-token");
	// AFTER_BUILD validation started a request.
	MockXHR.last.respond(200);
	assert.match(items["token-status"].value, /Token OK/);
	assert.equal(items.submit.enabled, true);
	assert.equal(MockXHR.last.headers.Authorization, "Bearer good-token");
	assert.equal(MockXHR.last.url, "https://api.cardtrader.com/api/v2/info");
});

test("invalid token shows an error and keeps save disabled", () => {
	const items = buildPage("bad-token");
	MockXHR.last.respond(401);
	assert.match(items["token-status"].value, /Invalid token/);
	assert.equal(items.submit.enabled, false);
});

test("network failure warns but allows saving", () => {
	const items = buildPage("some-token");
	MockXHR.last.fail();
	assert.match(items["token-status"].value, /Could not reach CardTrader/);
	assert.equal(items.submit.enabled, true);
});

test("editing the token re-validates", () => {
	const items = buildPage("first");
	MockXHR.last.respond(200);
	assert.equal(items.submit.enabled, true);

	items.API_TOKEN.value = "second";
	items.API_TOKEN.handlers.change.call(items.API_TOKEN);
	assert.equal(items.submit.enabled, false);
	MockXHR.last.respond(401);
	assert.match(items["token-status"].value, /Invalid token/);
});
