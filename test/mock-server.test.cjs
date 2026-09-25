"use strict";

/*
 * Drives the real API client against the local mock CardTrader server, so the
 * whole request/response path is exercised without touching the network.
 * The mock serves the same sanitized fixtures the normalizer tests use.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { createClient } = require("../src/pkjs/api.js");

const ORDER_FIXTURE = JSON.parse(
	fs.readFileSync(path.join(__dirname, "fixtures", "cardtrader", "orders-buyer.json"), "utf8")
);

function nodeTransport(options) {
	return fetch(options.url, { method: options.method, headers: options.headers })
		.then(async response => ({
			status: response.status,
			text: await response.text(),
			headers: Object.fromEntries(response.headers),
		}))
		.catch(error => {
			throw new Error(error.message);
		});
}

async function withMock(run) {
	const { startMockServer } = await import("../tools/mock-cardtrader/server.mjs");
	const mock = await startMockServer();
	try {
		return await run(mock);
	} finally {
		await mock.close();
	}
}

function clientFor(mock, token) {
	return createClient({
		transport: nodeTransport,
		getToken: () => token || mock.token,
		baseUrl: mock.url,
		minIntervalMs: 0,
	});
}

test("serves the sanitized fixtures", async () => {
	await withMock(async mock => {
		const client = clientFor(mock);

		const info = await client.getInfo();
		assert.equal(info.ok, true);
		assert.equal(typeof info.data.id, "number");

		const orders = await client.getOrders({ order_as: "buyer" });
		assert.equal(orders.ok, true);
		assert.deepEqual(
			orders.data.map(order => order.id),
			ORDER_FIXTURE.map(order => order.id)
		);

		const first = ORDER_FIXTURE[0];
		const order = await client.getOrder(first.id);
		assert.equal(order.ok, true);
		assert.equal(order.data.id, first.id);

		const box = await client.getCt0BoxItems();
		assert.equal(box.ok, true);
		assert.equal(box.data.length, 41);
	});
});

test("maps 401, 404 and 429 the same way the real API does", async () => {
	await withMock(async mock => {
		const badToken = clientFor(mock, "wrong-token");
		const unauthorized = await badToken.getInfo();
		assert.equal(unauthorized.ok, false);
		assert.equal(unauthorized.error.code, "unauthorized");

		const client = clientFor(mock);
		const missing = await client.getOrder(99999999);
		assert.equal(missing.error.code, "not_found");

		mock.setMode("429");
		const limited = await client.getInfo();
		assert.equal(limited.error.code, "rate_limited");
		assert.equal(limited.retryable, true);
	});
});

test("serves empty results and filters seller orders", async () => {
	await withMock(async mock => {
		const client = clientFor(mock);

		const seller = await client.getOrders({ order_as: "seller" });
		assert.deepEqual(seller.data, []);

		mock.setMode("empty");
		const emptyOrders = await client.getOrders({});
		assert.deepEqual(emptyOrders.data, []);
		const emptyBox = await client.getCt0BoxItems();
		assert.deepEqual(emptyBox.data, []);

		mock.setMode("ok");
		assert.equal((await client.getOrders({})).data.length, ORDER_FIXTURE.length);
	});
});

test("paginates orders", async () => {
	await withMock(async mock => {
		const client = clientFor(mock);

		const page1 = await client.getOrders({ order_as: "buyer", limit: 1, page: 1 });
		const page2 = await client.getOrders({ order_as: "buyer", limit: 1, page: 2 });

		assert.equal(page1.data.length, 1);
		assert.equal(page2.data.length, 1);
		assert.notEqual(page1.data[0].id, page2.data[0].id);
	});
});
