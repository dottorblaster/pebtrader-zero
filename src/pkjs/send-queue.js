/*
 * Serialized AppMessage send queue.
 *
 * Two Pebble quirks force this:
 *   - AppMessage drops a message sent while a previous one is still in flight,
 *     so sends are serialized.
 *   - The watch defers onReadable by a tick and overwrites an unread message,
 *     so sends are paced.
 *
 * Pure: the actual send and the timer are injected, so it is unit-testable.
 * While a send is in flight, or waiting to be paced/retried, `pumping` stays
 * true so a new enqueue cannot jump the queue.
 */

function createSendQueue(options) {
	options = options || {};

	var send = options.send;
	var schedule = options.schedule;
	var paceMs = options.paceMs == null ? 80 : options.paceMs;
	var retryDelayMs = options.retryDelayMs == null ? 300 : options.retryDelayMs;
	var maxTries = options.maxTries == null ? 3 : options.maxTries;

	var queue = [];
	var pumping = false;

	function enqueue(dict) {
		queue.push({ dict: dict, tries: 0 });
		pump();
	}

	function resumeAfter(ms) {
		schedule(function () {
			pumping = false;
			pump();
		}, ms);
	}

	function pump() {
		if (pumping || queue.length === 0) return;
		pumping = true;
		var item = queue.shift();

		send(
			item.dict,
			function () {
				resumeAfter(paceMs);
			},
			function () {
				item.tries += 1;
				if (item.tries <= maxTries) queue.unshift(item);
				resumeAfter(retryDelayMs);
			}
		);
	}

	return { enqueue: enqueue };
}

module.exports = {
	createSendQueue: createSendQueue,
};
