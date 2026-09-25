/*
 * Mock CardTrader API for local, deterministic QA.
 *
 * Serves the sanitized fixtures in test/fixtures/cardtrader and can be forced
 * into the error modes the app has to handle. Start it standalone:
 *
 *   node tools/mock-cardtrader/server.mjs
 *
 * ...then point the app at it (see tools/mock-cardtrader/README.md).
 * The unit tests import startMockServer() and use an ephemeral port.
 */

import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES = join(ROOT, "test", "fixtures", "cardtrader");

const ERROR_BODIES = {
	401: { error_code: "unauthorized", errors: [], extra: { message: "You are not authorized to access this page" } },
	404: { error_code: "not_found", errors: [], extra: { message: "Data is not ready" } },
	429: { error: "Too many requests: max 200 requests per 10 seconds" },
	500: { error: "Internal mock error" },
};

function loadFixture(name) {
	return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

function send(res, status, body, headers) {
	res.writeHead(status, Object.assign({ "content-type": "application/json" }, headers || {}));
	res.end(JSON.stringify(body));
}

export async function startMockServer(options) {
	options = options || {};
	const token = options.token || "mock-token";
	const fixtures = {
		info: loadFixture("info.json"),
		orders: loadFixture("orders-buyer.json"),
		ct0: loadFixture("ct0-box-items.json"),
	};

	let mode = "ok";
	const requests = [];

	const server = http.createServer((req, res) => {
		const url = new URL(req.url, "http://localhost");
		requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) });

		// Test control plane.
		if (url.pathname === "/__mock/mode") {
			if (req.method === "POST") {
				let body = "";
				req.on("data", chunk => (body += chunk));
				req.on("end", () => {
					try {
						mode = JSON.parse(body).mode || "ok";
					} catch (e) {
						mode = "ok";
					}
					send(res, 200, { mode });
				});
			} else {
				send(res, 200, { mode });
			}
			return;
		}
		if (url.pathname === "/__mock/requests") {
			send(res, 200, requests);
			return;
		}

		// Forced global error modes.
		if (mode in ERROR_BODIES) {
			const headers = mode === "429" ? { "retry-after": "1" } : undefined;
			return send(res, Number(mode), ERROR_BODIES[mode], headers);
		}

		const auth = req.headers.authorization || "";
		if (auth !== `Bearer ${token}`) return send(res, 401, ERROR_BODIES[401]);

		const path = url.pathname.replace(/^\/api\/v2/, "");

		if (path === "/info") return send(res, 200, fixtures.info);

		if (path === "/ct0_box_items") {
			return send(res, 200, mode === "empty" ? [] : fixtures.ct0);
		}

		if (path === "/orders") {
			let orders = mode === "empty" ? [] : fixtures.orders.slice();
			if (url.searchParams.get("order_as") === "seller") orders = [];

			const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
			const limit = Math.max(1, Number(url.searchParams.get("limit") || "20"));
			const start = (page - 1) * limit;
			return send(res, 200, orders.slice(start, start + limit));
		}

		const match = path.match(/^\/orders\/(\d+)$/);
		if (match) {
			const order = fixtures.orders.find(item => item.id === Number(match[1]));
			if (!order) return send(res, 404, ERROR_BODIES[404]);
			return send(res, 200, order);
		}

		send(res, 404, { error_code: "not_found", errors: [], extra: { message: "Unknown route " + path } });
	});

	const port = options.port == null ? 0 : options.port;
	await new Promise(resolve => server.listen(port, options.host || "127.0.0.1", resolve));
	const address = server.address();

	return {
		url: `http://127.0.0.1:${address.port}/api/v2`,
		token,
		requests,
		mode: () => mode,
		setMode: value => {
			mode = value;
		},
		close: () => new Promise(resolve => server.close(resolve)),
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const token = process.env.MOCK_TOKEN || "mock-token";
	const mock = await startMockServer({ port: Number(process.env.PORT || 8787), token });
	console.log(`Mock CardTrader listening at ${mock.url}`);
	console.log(`Token: ${token}`);
	console.log(`Point the app's advanced "API base URL" at: ${mock.url}`);
}
