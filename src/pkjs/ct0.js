/*
 * CardTrader Zero box normalization (PKJS).
 *
 * Turns the raw `GET /ct0_box_items` payload into a compact box summary for
 * the watch. Pure functions only - no Pebble globals, no network - so they are
 * unit-testable in Node.
 *
 * Per the spike (docs/spike-ct0.md) this is the primary source of live state:
 * what is on its way (`pending`), what has arrived (`ok`) and what was lost
 * (`missing`).
 */

var protocol = require("../common/protocol");
var format = require("./format");

var ITEM_STATES = ["ok", "pending", "missing"];

function formatMoney(cents, currency) {
	if (typeof cents !== "number" || !isFinite(cents)) return null;
	var amount = (cents / 100).toFixed(2);
	return currency ? amount + " " + currency : amount;
}

/** Units of an item per state, ignoring junk values. */
function stateCounts(quantity) {
	var counts = { ok: 0, pending: 0, missing: 0, other: 0 };
	if (quantity && typeof quantity === "object") {
		Object.keys(quantity).forEach(function (key) {
			var value = quantity[key];
			if (typeof value !== "number" || !isFinite(value) || value <= 0) return;
			if (ITEM_STATES.indexOf(key) !== -1) {
				counts[key] += value;
			} else {
				counts.other += value;
			}
		});
	}
	return counts;
}

/** The state holding the most units; ties prefer pending, then ok, then missing. */
function primaryState(counts) {
	var priority = ["pending", "ok", "missing", "other"];
	var best = "other";
	var bestCount = 0;
	priority.forEach(function (state) {
		if (counts[state] > bestCount) {
			best = state;
			bestCount = counts[state];
		}
	});
	return best;
}

function summarizeItem(item) {
	item = item || {};
	var counts = stateCounts(item.quantity);
	var price = item.buyer_price || {};
	var seller = item.seller || {};

	return {
		id: item.id != null ? item.id : null,
		name: item.name || "",
		expansion: item.expansion || null,
		state: primaryState(counts),
		states: counts,
		quantity: counts.ok + counts.pending + counts.missing + counts.other,
		unitPriceCents: typeof price.cents === "number" ? price.cents : null,
		currency: price.currency || null,
		price: item.formatted_price || null,
		eta: item.estimated_arrived_at || null,
		arrivedAt: item.arrived_at || null,
		seller: seller.username || null,
	};
}

function bySoonestEta(a, b) {
	if (!a.eta && !b.eta) return (a.id || 0) - (b.id || 0);
	if (!a.eta) return 1;
	if (!b.eta) return -1;
	if (a.eta !== b.eta) return a.eta < b.eta ? -1 : 1;
	return (a.id || 0) - (b.id || 0);
}

/**
 * Aggregate raw CT0 box items into counts, value and a capped item list.
 *
 * options.maxItems - cap the number of items in the summary (default 20)
 */
function summarizeCt0Items(items, options) {
	options = options || {};
	var maxItems = options.maxItems == null ? 20 : options.maxItems;
	var list = Array.isArray(items) ? items : [];

	var counts = { ok: 0, pending: 0, missing: 0, other: 0 };
	var valueByState = { ok: 0, pending: 0, missing: 0, other: 0 };
	var currency = null;
	var soonestEta = null;
	var latestArrival = null;
	var summaries = [];

	list.forEach(function (item) {
		var summary = summarizeItem(item);
		summaries.push(summary);

		var unitCents = summary.unitPriceCents || 0;
		Object.keys(counts).forEach(function (state) {
			var units = summary.states[state];
			counts[state] += units;
			valueByState[state] += unitCents * units;
		});

		if (!currency && summary.currency) {
			currency = summary.currency;
		}
		if (summary.states.pending > 0 && summary.eta) {
			if (!soonestEta || summary.eta < soonestEta) soonestEta = summary.eta;
		}
		if (summary.states.ok > 0 && summary.arrivedAt) {
			if (!latestArrival || summary.arrivedAt > latestArrival) latestArrival = summary.arrivedAt;
		}
	});

	var units = counts.ok + counts.pending + counts.missing + counts.other;
	var totalValueCents =
		valueByState.ok + valueByState.pending + valueByState.missing + valueByState.other;

	summaries.sort(bySoonestEta);

	return {
		itemCount: summaries.length,
		units: units,
		counts: counts,
		valueByState: valueByState,
		currency: currency,
		totalValueCents: totalValueCents,
		totalValue: formatMoney(totalValueCents, currency),
		soonestEta: soonestEta,
		latestArrival: latestArrival,
		items: summaries.slice(0, maxItems),
		itemsTruncated: summaries.length > maxItems,
	};
}

/**
 * Turn a normalized CT0 summary into display lines for the watch. PKJS does the
 * formatting so the watch only splits and draws a string.
 */
function boxLines(summary) {
	var lines = [];
	function head(t) {
		lines.push({ t: t, h: true });
	}
	function text(t) {
		if (t) lines.push({ t: t, h: false });
	}

	head("In the box");
	text(summary.counts.ok + " ready");
	text(summary.counts.pending + " on the way");
	if (summary.counts.missing) text(summary.counts.missing + " missing (refunded)");
	if (summary.totalValue) text("Total value: " + summary.totalValue);

	if (summary.soonestEta) {
		head("Next arrival");
		text(format.formatDate(summary.soonestEta));
	}

	var items = summary.items || [];
	if (items.length) {
		head("Items (" + summary.itemCount + ")");
		items.forEach(function (item) {
			text(item.quantity + "x " + item.name);

			var meta = [];
			if (item.state === "ok") meta.push("ready");
			else if (item.state === "pending") meta.push("on the way");
			else if (item.state === "missing") meta.push("missing");
			if (item.state === "pending" && item.eta) meta.push("ETA " + format.formatDate(item.eta));
			if (item.state === "ok" && item.arrivedAt) meta.push("arrived " + format.formatDate(item.arrivedAt));
			if (item.price) meta.push(item.price);
			if (meta.length) text(meta.join(" \u00b7 "));
		});
		if (summary.itemsTruncated) text("\u2026 and more");
	}

	return lines;
}

/**
 * Fetch the CT0 box through the API client and normalize it.
 * Resolves with { ok, status, data: summary, lines, payload } or the error.
 */
function fetchCt0Box(client, options) {
	return client.getCt0BoxItems().then(function (result) {
		if (!result.ok) return result;
		var summary = summarizeCt0Items(result.data, options);
		var lines = boxLines(summary);
		return {
			ok: true,
			status: result.status,
			data: summary,
			lines: lines,
			payload: protocol.packLines(lines),
		};
	});
}

module.exports = {
	stateCounts: stateCounts,
	summarizeItem: summarizeItem,
	summarizeCt0Items: summarizeCt0Items,
	boxLines: boxLines,
	fetchCt0Box: fetchCt0Box,
};
