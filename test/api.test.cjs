"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient, isAllowedBaseUrl, DEFAULT_BASE_URL } = require("../src/pkjs/api.js");
const { parseHeaders } = require("../src/pkjs/xhr-transport.js");

function jsonResponse(status, body, headers) {
	return { status, text: JSON.stringify(body), headers: headers || {} };
}

function makeTransport(responses) {
	const calls = [];
	let index = 0;
	function transport(options) {
		calls.push(options);
		const response = responses[Math.min(index, responses.length - 1)];
		index += 1;
		if (response instanceof Error) return Promise.reject(response);
		return Promise.resolve(response);
	}
	transport.calls = calls;
	return transport;
}

function build(responses, overrides) {
	const transport = makeTransport(responses);
	const sleeps = [];
	const client = createClient(
		Object.assign(
			{
				transport,
				getToken: () => "tok",
				sleep: (ms) => {
					sleeps.push(ms);
					return Promise.resolve();
				},
				now: () => 0,
				minIntervalMs: 0,
			},
			overrides
		)
	);
	return { client, transport, sleeps };
}

test("only allows HTTPS, or loopback HTTP for the local mock", () => {
	assert.equal(isAllowedBaseUrl("https://api.cardtrader.com/api/v2"), true);
	assert.equal(isAllowedBaseUrl("HTTPS://API.CARDRADER.COM"), true);
	assert.equal(isAllowedBaseUrl("http://127.0.0.1:8787/api/v2"), true);
	assert.equal(isAllowedBaseUrl("http://localhost:8787/api/v2"), true);
	assert.equal(isAllowedBaseUrl("http://[::1]:8787"), true);
	assert.equal(isAllowedBaseUrl("http://evil.example.com/api/v2"), false);
	assert.equal(isAllowedBaseUrl("ftp://example.com"), false);
	assert.equal(isAllowedBaseUrl(""), false);
	assert.equal(isAllowedBaseUrl(null), false);
});

test("refuses to send the token to a non-HTTPS endpoint", async () => {
	const { client, transport } = build([jsonResponse(200, {})], { baseUrl: "http://evil.example.com/api/v2" });
	const result = await client.getInfo();

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "insecure_base_url");
	assert.equal(transport.calls.length, 0);
});

test("getInfo returns parsed data and sends the bearer token", async () => {
	const { client, transport } = build([jsonResponse(200, { id: 1, name: "app" })]);
	const result = await client.getInfo();

	assert.deepEqual(result, { ok: true, status: 200, data: { id: 1, name: "app" } });
	assert.equal(transport.calls.length, 1);
	assert.equal(transport.calls[0].method, "GET");
	assert.equal(transport.calls[0].url, DEFAULT_BASE_URL + "/info");
	assert.equal(transport.calls[0].headers.Authorization, "Bearer tok");
});

test("getOrder hits /orders/:id", async () => {
	const { client, transport } = build([jsonResponse(200, { id: 123 })]);
	const result = await client.getOrder(123);

	assert.equal(result.ok, true);
	assert.equal(transport.calls[0].url, DEFAULT_BASE_URL + "/orders/123");
});

test("no token short-circuits without a request", async () => {
	const { client, transport } = build([], { getToken: () => "" });
	const result = await client.getInfo();

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "no_token");
	assert.equal(result.retryable, false);
	assert.equal(transport.calls.length, 0);
});

test("401 maps to unauthorized and is not retried", async () => {
	const { client, transport } = build([
		jsonResponse(401, { error_code: "unauthorized", extra: { message: "nope" } }),
	]);
	const result = await client.getInfo();

	assert.equal(result.error.code, "unauthorized");
	assert.equal(result.error.message, "nope");
	assert.equal(result.retryable, false);
	assert.equal(transport.calls.length, 1);
});

test("404 maps to not_found", async () => {
	const { client } = build([
		jsonResponse(404, { error_code: "not_found", extra: { message: "missing" } }),
	]);
	const result = await client.getCt0BoxItems();

	assert.equal(result.error.code, "not_found");
	assert.equal(result.error.message, "missing");
});

test("422 maps to validation_error with the API message", async () => {
	const { client } = build([
		jsonResponse(422, {
			error_code: "missing_parameter",
			extra: { message: "Missing required parameter(s) game_id" },
		}),
	]);
	const result = await client.getOrders({ order_as: "buyer" });

	assert.equal(result.error.code, "validation_error");
	assert.match(result.error.message, /game_id/);
});

test("retries server errors and then succeeds", async () => {
	const { client, transport, sleeps } = build([
		jsonResponse(500, { error: "boom" }),
		jsonResponse(200, { ok: 1 }),
	]);
	const result = await client.getInfo();

	assert.equal(result.ok, true);
	assert.equal(transport.calls.length, 2);
	assert.deepEqual(sleeps, [500]);
});

test("gives up after maxRetries", async () => {
	const { client, transport } = build(
		[jsonResponse(500, {}), jsonResponse(500, {}), jsonResponse(500, {})],
		{ maxRetries: 2 }
	);
	const result = await client.getInfo();

	assert.equal(result.error.code, "server_error");
	assert.equal(result.retryable, true);
	assert.equal(transport.calls.length, 3);
});

test("honours Retry-After on 429", async () => {
	const { client, sleeps } = build([
		jsonResponse(429, { error: "Too many requests" }, { "retry-after": "2" }),
		jsonResponse(200, {}),
	]);
	const result = await client.getInfo();

	assert.equal(result.ok, true);
	assert.deepEqual(sleeps, [2000]);
});

test("retries network errors", async () => {
	const { client, transport } = build([
		new Error("boom"),
		jsonResponse(200, { ok: true }),
	]);
	const result = await client.getInfo();

	assert.equal(result.ok, true);
	assert.equal(transport.calls.length, 2);
});

test("network errors end as network_error", async () => {
	const { client } = build([new Error("down")], { maxRetries: 0 });
	const result = await client.getInfo();

	assert.equal(result.error.code, "network_error");
	assert.equal(result.retryable, true);
});

test("invalid JSON maps to parse_error", async () => {
	const { client } = build([{ status: 200, text: "<html>", headers: {} }]);
	const result = await client.getInfo();

	assert.equal(result.ok, false);
	assert.equal(result.error.code, "parse_error");
	assert.equal(result.retryable, false);
});

test("encodes query parameters and drops empty ones", async () => {
	const { client, transport } = build([jsonResponse(200, [])]);
	await client.getOrders({
		order_as: "buyer",
		limit: 100,
		state: undefined,
		page: null,
		sort: "date.desc",
	});

	const url = transport.calls[0].url;
	assert.match(url, /order_as=buyer/);
	assert.match(url, /limit=100/);
	assert.match(url, /sort=date\.desc/);
	assert.equal(url.includes("state="), false);
	assert.equal(url.includes("page="), false);
});

test("never echoes the token in the result", async () => {
	const { client } = build([jsonResponse(200, { ok: true })]);
	const result = await client.getInfo();

	assert.equal(JSON.stringify(result).includes("tok"), false);
});

test("rate limiter spaces out requests", async () => {
	let clock = 0;
	const { client, sleeps } = build([jsonResponse(200, {}), jsonResponse(200, {})], {
		minIntervalMs: 50,
		now: () => clock,
		sleep: (ms) => {
			sleeps.push(ms);
			clock += ms;
			return Promise.resolve();
		},
	});

	await client.getInfo();
	await client.getInfo();

	assert.deepEqual(sleeps, [50]);
});

test("parseHeaders normalises header names", () => {
	const headers = parseHeaders("Content-Type: application/json\r\nRetry-After: 2\r\n");
	assert.equal(headers["content-type"], "application/json");
	assert.equal(headers["retry-after"], "2");
});
