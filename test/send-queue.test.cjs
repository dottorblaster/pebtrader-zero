"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSendQueue } = require("../src/pkjs/send-queue.js");

function harness(options) {
	options = options || {};
	const sent = [];
	const scheduled = [];
	const outcomes = (options.outcomes || []).slice();

	const send = (dict, onSuccess, onFailure) => {
		sent.push(dict);
		const outcome = outcomes.length ? outcomes.shift() : "ok";
		if (outcome === "fail") onFailure();
		else onSuccess();
	};
	const schedule = (callback, ms) => scheduled.push({ callback, ms });

	const queue = createSendQueue(Object.assign({ send, schedule }, options));
	return { queue, sent, scheduled };
}

function flush(h) {
	let guard = 0;
	while (h.scheduled.length && guard++ < 1000) {
		h.scheduled.shift().callback();
	}
}

test("sends serially and paces between messages", () => {
	const h = harness({ paceMs: 80 });
	h.queue.enqueue({ n: 1 });
	h.queue.enqueue({ n: 2 });

	assert.deepEqual(h.sent.map(d => d.n), [1]);
	assert.equal(h.scheduled.length, 1);
	assert.equal(h.scheduled[0].ms, 80);

	flush(h);
	assert.deepEqual(h.sent.map(d => d.n), [1, 2]);
});

test("keeps pumping true during the pace delay so enqueues cannot jump the queue", () => {
	const h = harness({ paceMs: 80 });
	h.queue.enqueue({ n: 1 });
	h.queue.enqueue({ n: 2 });
	h.queue.enqueue({ n: 3 });

	// Only the first send has happened; 2 and 3 wait for the pace timer.
	assert.deepEqual(h.sent.map(d => d.n), [1]);
	flush(h);
	assert.deepEqual(h.sent.map(d => d.n), [1, 2, 3]);
});

test("retries a failed send before moving on", () => {
	const h = harness({ outcomes: ["fail", "ok"], retryDelayMs: 300 });
	h.queue.enqueue({ n: 1 });
	h.queue.enqueue({ n: 2 });

	assert.deepEqual(h.sent.map(d => d.n), [1]);
	assert.equal(h.scheduled[0].ms, 300);

	flush(h);
	assert.deepEqual(h.sent.map(d => d.n), [1, 1, 2]);
});

test("drops a message after maxTries", () => {
	const h = harness({ outcomes: ["fail", "fail", "fail", "ok"], maxTries: 2 });
	h.queue.enqueue({ n: 1 });
	h.queue.enqueue({ n: 2 });

	flush(h);

	assert.equal(h.sent.filter(d => d.n === 1).length, 3); // initial + 2 retries
	assert.equal(h.sent.filter(d => d.n === 2).length, 1);
});
