"use strict";

/*
 * Guards the committed CardTrader fixtures: they must stay safe to publish.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "fixtures", "cardtrader");
const FILES = fs.readdirSync(DIR).filter(name => name.endsWith(".json"));

const ALWAYS_REDACTED = [
	"email",
	"phone",
	"username",
	"street",
	"zip",
	"city",
	"state_or_province",
	"shared_secret",
	"tracking_code",
	"note",
];

test("there are fixtures to check", () => {
	assert.ok(FILES.length > 0);
});

test("fixtures contain no emails, URLs or bearer tokens", () => {
	for (const file of FILES) {
		const text = fs.readFileSync(path.join(DIR, file), "utf8");
		assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, `${file} contains an email`);
		assert.doesNotMatch(text, /https?:\/\//i, `${file} contains a URL`);
		assert.doesNotMatch(text, /Bearer\s/i, `${file} contains a bearer token`);
		assert.doesNotMatch(text, /cardtrader-token/, `${file} mentions a token key`);
	}
});

test("every sensitive field is redacted", () => {
	for (const file of FILES) {
		const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
		walk(data, file);
	}

	function walk(value, file) {
		if (Array.isArray(value)) {
			value.forEach(item => walk(item, file));
			return;
		}
		if (!value || typeof value !== "object") return;

		for (const [key, child] of Object.entries(value)) {
			if (ALWAYS_REDACTED.includes(key)) {
				assert.equal(child, "[REDACTED]", `${file}: ${key} is not redacted`);
			}
			walk(child, file);
		}
	}
});
