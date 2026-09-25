/*
 * Snapshot codec for the watch's offline cache: the last orders list and CT0
 * box text. Pure serialize/parse so it can be unit-tested in Node.
 *
 * Loaded by the watch the same way as the shared protocol.
 */

(function (root, factory) {
	var value = factory();
	if (typeof module !== "undefined" && module.exports) module.exports = value;
	if (typeof globalThis !== "undefined") globalThis.PebTraderSnapshot = value;
	else if (root) root.PebTraderSnapshot = value;
})(this, function () {
	"use strict";

	var VERSION = 1;

	function serialize(snapshot) {
		return JSON.stringify({
			v: VERSION,
			at: snapshot.at || null,
			items: snapshot.items || [],
			box: snapshot.box || null,
		});
	}

	/** Returns the snapshot, or null for a missing/corrupt/old cache. */
	function parse(text) {
		if (!text) return null;

		var snapshot;
		try {
			snapshot = JSON.parse(text);
		} catch (e) {
			return null;
		}

		if (!snapshot || snapshot.v !== VERSION || !Array.isArray(snapshot.items)) return null;
		return snapshot;
	}

	return {
		VERSION: VERSION,
		serialize: serialize,
		parse: parse,
	};
});
