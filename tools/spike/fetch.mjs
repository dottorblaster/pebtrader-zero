#!/usr/bin/env node
/*
 * CardTrader Zero spike helper.
 *
 * Fetches the endpoints that matter for the order/CT0-box use case with a real
 * API token, then writes:
 *   - raw responses to .secrets/raw/            (gitignored, never committed)
 *   - sanitized fixtures to test/fixtures/cardtrader/ (safe to commit)
 *   - a machine-readable summary to stdout
 *
 * The token is never printed. Source, first match wins:
 *   1. the CARDTRADER_TOKEN environment variable
 *   2. .secrets/cardtrader.token
 *
 * Usage:
 *   node tools/spike/fetch.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_URL = "https://api.cardtrader.com/api/v2";
const RAW_DIR = join(ROOT, ".secrets", "raw");
const FIXTURE_DIR = join(ROOT, "test", "fixtures", "cardtrader");
const REDACTED = "[REDACTED]";

async function loadToken() {
	if (process.env.CARDTRADER_TOKEN) return process.env.CARDTRADER_TOKEN.trim();
	const tokenPath = join(ROOT, ".secrets", "cardtrader.token");
	if (existsSync(tokenPath)) return (await readFile(tokenPath, "utf8")).trim();
	throw new Error(
		"No token found. Set CARDTRADER_TOKEN or write .secrets/cardtrader.token"
	);
}

function isAddress(value) {
	return typeof value === "object" && value !== null && ("street" in value || "zip" in value || "city" in value);
}

function isUser(value) {
	return typeof value === "object" && value !== null && ("email" in value || "username" in value || "can_sell_via_hub" in value);
}

function isOrder(value) {
	return typeof value === "object" && value !== null && ("order_as" in value || "via_cardtrader_zero" in value || "order_items" in value);
}

function isApp(value) {
	return typeof value === "object" && value !== null && "user_id" in value;
}

const ALWAYS_REDACT = new Set(["email", "phone", "username", "shared_secret", "tracking_code"]);
const ADDRESS_FIELDS = new Set(["street", "zip", "city", "state_or_province", "note"]);

/** Recursively redact personal data while preserving shape and types. */
export function sanitize(value) {
	if (Array.isArray(value)) return value.map(sanitize);
	if (typeof value !== "object" || value === null) return value;

	const address = isAddress(value);
	const user = isUser(value);
	const order = isOrder(value);
	const app = isApp(value);
	const out = {};

	for (const [key, raw] of Object.entries(value)) {
		if (ALWAYS_REDACT.has(key)) {
			out[key] = REDACTED;
		} else if (address && (ADDRESS_FIELDS.has(key) || key === "name")) {
			out[key] = REDACTED;
		} else if ((user || app) && key === "name") {
			out[key] = REDACTED;
		} else if (order && (key === "code" || key === "transaction_code")) {
			out[key] = REDACTED;
		} else if (key === "description" && typeof raw === "string" && /@|https?:\/\//.test(raw)) {
			out[key] = REDACTED;
		} else {
			out[key] = sanitize(raw);
		}
	}
	return out;
}

function distinctStates(orders) {
	const states = new Map();
	for (const order of orders) {
		const state = order?.state ?? "(none)";
		states.set(state, (states.get(state) ?? 0) + 1);
	}
	return Object.fromEntries([...states.entries()].sort());
}

function ct0Quantities(items) {
	const totals = { ok: 0, pending: 0, missing: 0, other: 0 };
	for (const item of items) {
		const quantity = item?.quantity ?? {};
		for (const [state, count] of Object.entries(quantity)) {
			if (state in totals) totals[state] += count;
			else totals.other += count;
		}
	}
	return totals;
}

async function get(token, path, params = {}) {
	const url = new URL(`${BASE_URL}${path}`);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	const started = Date.now();
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
	});
	const text = await response.text();
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		body = text;
	}
	const rateLimit = {};
	for (const [header, value] of response.headers) {
		if (header.toLowerCase().startsWith("x-ratelimit")) rateLimit[header] = value;
	}
	return {
		path: url.pathname,
		params,
		status: response.status,
		ok: response.ok,
		ms: Date.now() - started,
		bytes: Buffer.byteLength(text),
		contentType: response.headers.get("content-type"),
		rateLimit,
		body,
	};
}

async function saveRaw(name, result) {
	await mkdir(RAW_DIR, { recursive: true });
	await writeFile(join(RAW_DIR, `${name}.json`), JSON.stringify(result.body, null, 2));
}

async function saveFixture(name, body) {
	await mkdir(FIXTURE_DIR, { recursive: true });
	await writeFile(join(FIXTURE_DIR, `${name}.json`), `${JSON.stringify(sanitize(body), null, 2)}\n`);
}

function describe(result) {
	const { body } = result;
	let shape;
	if (Array.isArray(body)) shape = `array[${body.length}]`;
	else if (body && typeof body === "object") shape = `object{${Object.keys(body).length}}`;
	else shape = typeof body;
	return { status: result.status, ok: result.ok, ms: result.ms, bytes: result.bytes, shape };
}

async function main() {
	const token = await loadToken();
	const summary = { baseUrl: BASE_URL, fetchedAt: new Date().toISOString(), requests: {} };

	const info = await get(token, "/info");
	await saveRaw("info", info);
	await saveFixture("info", info.body);
	summary.requests.info = describe(info);
	summary.requests.info.appKeys = info.body && typeof info.body === "object" ? Object.keys(info.body) : [];

	const buyer = await get(token, "/orders", { order_as: "buyer", limit: 100, sort: "date.desc" });
	await saveRaw("orders-buyer", buyer);
	await saveFixture("orders-buyer", buyer.body);
	summary.requests.ordersBuyer = describe(buyer);
	if (Array.isArray(buyer.body)) {
		summary.requests.ordersBuyer.states = distinctStates(buyer.body);
		summary.requests.ordersBuyer.ct0Count = buyer.body.filter((o) => o.via_cardtrader_zero).length;
	}

	const buyerPage2 = await get(token, "/orders", { order_as: "buyer", limit: 100, page: 2, sort: "date.desc" });
	await saveRaw("orders-buyer-page2", buyerPage2);
	summary.requests.ordersBuyerPage2 = describe(buyerPage2);

	const seller = await get(token, "/orders", { order_as: "seller", limit: 100, sort: "date.desc" });
	await saveRaw("orders-seller", seller);
	await saveFixture("orders-seller", seller.body);
	summary.requests.ordersSeller = describe(seller);
	if (Array.isArray(seller.body)) {
		summary.requests.ordersSeller.states = distinctStates(seller.body);
		summary.requests.ordersSeller.ct0Count = seller.body.filter((o) => o.via_cardtrader_zero).length;
	}

	const ct0 = await get(token, "/ct0_box_items");
	await saveRaw("ct0-box-items", ct0);
	await saveFixture("ct0-box-items", ct0.body);
	summary.requests.ct0BoxItems = describe(ct0);
	if (Array.isArray(ct0.body)) {
		summary.requests.ct0BoxItems.quantities = ct0Quantities(ct0.body);
		summary.requests.ct0BoxItems.itemKeys = ct0.body[0] ? Object.keys(ct0.body[0]) : [];
	}

	console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`spike fetch failed: ${error.message}`);
		process.exitCode = 1;
	});
}
