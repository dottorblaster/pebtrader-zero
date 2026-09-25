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

// Display order and labels for the CT0 purchases groups (see groupSummary).
var GROUP_ORDER = ["ok", "pending", "missing"];
var GROUP_LABELS = {
	ok: "Ready to ship",
	pending: "On the way",
	missing: "Missing",
};

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

/** Meta line for the box summary: state, the date that matters, the price. */
function itemMeta(item) {
	var state = item.state;
	var meta = [];

	if (state === "ok") meta.push("ready");
	else if (state === "pending") meta.push("on the way");
	else if (state === "missing") meta.push("missing");
	if (state === "pending" && item.eta) meta.push("ETA " + format.formatDate(item.eta));
	if (state === "ok" && item.arrivedAt) meta.push("arrived " + format.formatDate(item.arrivedAt));
	if (item.price) meta.push(item.price);

	return meta.join(" \u00b7 ");
}

/** The two display lines for one box item in the box summary. */
function itemLines(item) {
	var lines = [{ t: item.quantity + "x " + item.name, h: false }];
	var meta = itemMeta(item);
	if (meta) lines.push({ t: meta, h: false });
	return lines;
}

/**
 * One line per purchase for the drill-down screens: quantity, name, price and
 * the date that matters for its state. A group can hold dozens of items and
 * the watch heap is tiny, so the group screens get one line each.
 */
function groupItemLine(item) {
	var parts = [item.quantity + "x " + item.name];
	if (item.price) parts.push(item.price);

	var day = format.formatDay(item.state === "ok" ? item.arrivedAt : item.eta);
	if (day) parts.push(item.state === "pending" ? "ETA " + day : day);
	else if (item.state === "missing") parts.push("missing");

	return parts.join(" \u00b7 ");
}

/**
 * Display order inside one group: pending by soonest ETA, arrived by newest
 * arrival, missing by ETA - ties broken by id so the order is stable.
 */
function byStateDate(state) {
	return function (a, b) {
		var aDate = state === "ok" ? a.arrivedAt : a.eta;
		var bDate = state === "ok" ? b.arrivedAt : b.eta;

		if (aDate !== bDate) {
			if (!aDate) return 1;
			if (!bDate) return -1;
			if (state === "ok") return bDate < aDate ? -1 : 1;
			return aDate < bDate ? -1 : 1;
		}
		return (a.id || 0) - (b.id || 0);
	};
}

/** The summarized items holding units in `state`, in display order. */
function itemsInState(items, state) {
	return (items || [])
		.filter(function (item) {
			return (item.states[state] || 0) > 0;
		})
		.sort(byStateDate(state));
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
			itemLines(item).forEach(function (line) {
				text(line.t);
			});
		});
		if (summary.itemsTruncated) text("\u2026 and more");
	}

	return lines;
}

/**
 * Bucket the box into one row per state that holds units: what is ready to be
 * shipped, what is still traveling and (rarely) what went missing.
 *
 * Returns { summary, groups }, each group carrying its own display metadata and
 * the summarized items in display order.
 */
function groupSummary(items, options) {
	var summary = summarizeCt0Items(items, options);
	var all = (Array.isArray(items) ? items : []).map(summarizeItem);
	var groups = [];

	GROUP_ORDER.forEach(function (state) {
		var units = summary.counts[state] || 0;
		if (units <= 0) return;

		var groupItems = itemsInState(all, state);
		groups.push({
			key: state,
			label: GROUP_LABELS[state],
			units: units,
			itemCount: groupItems.length,
			value: formatMoney(summary.valueByState[state] || 0, summary.currency),
			secondary: units + (units === 1 ? " card" : " cards"),
			items: groupItems,
		});
	});

	return { summary: summary, groups: groups };
}

/** Minimal per-group rows for the watch list screen. */
function groupRows(groups) {
	return (groups || []).map(function (group) {
		return {
			key: group.key,
			label: group.label,
			secondary: group.secondary,
			value: group.value || "",
		};
	});
}

/** Display lines for one group: heading, totals, then every item. */
function groupLines(group, options) {
	options = options || {};
	var maxItems = options.maxItems == null ? 40 : options.maxItems;
	var lines = [];

	function text(value) {
		if (value) lines.push({ t: value, h: false });
	}

	lines.push({ t: group.label || group.key, h: true });

	var meta = [group.itemCount + (group.itemCount === 1 ? " purchase" : " purchases")];
	meta.push(group.units + (group.units === 1 ? " card" : " cards"));
	if (group.value) meta.push(group.value);
	text(meta.join(" \u00b7 "));

	var items = group.items || [];
	if (!items.length) {
		text("Nothing here right now.");
		return lines;
	}

	items.slice(0, maxItems).forEach(function (item) {
		lines.push({ t: groupItemLine(item), h: false });
	});
	if (items.length > maxItems) text("\u2026 and " + (items.length - maxItems) + " more");

	return lines;
}

function findGroup(groups, key) {
	for (var i = 0; i < (groups || []).length; i++) {
		if (groups[i].key === key) return groups[i];
	}
	return null;
}

/**
 * Fetch the box and build the CT0 purchases group rows.
 * Resolves with { ok, status, data: { summary, groups }, rows, payload }.
 */
function fetchCt0Groups(client, options) {
	return client.getCt0BoxItems().then(function (result) {
		if (!result.ok) return result;
		var grouped = groupSummary(result.data, options);
		var rows = groupRows(grouped.groups);
		return {
			ok: true,
			status: result.status,
			data: grouped,
			rows: rows,
			payload: { groups: rows },
		};
	});
}

/**
 * Fetch the box and build the display lines for one state's group.
 * Resolves with { ok, status, data, lines, payload } or the client's error.
 */
function fetchCt0Group(client, state, options) {
	options = options || {};
	return client.getCt0BoxItems().then(function (result) {
		if (!result.ok) return result;

		var grouped = groupSummary(result.data, options);
		var group = findGroup(grouped.groups, state);
		var lines = group
			? groupLines(group, { maxItems: options.maxItems })
			: [
					{ t: GROUP_LABELS[state] || "CT0 box", h: true },
					{ t: "Nothing here right now.", h: false },
			  ];

		return {
			ok: true,
			status: result.status,
			data: grouped,
			lines: lines,
			payload: protocol.packLines(lines),
		};
	});
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
	GROUP_ORDER: GROUP_ORDER,
	GROUP_LABELS: GROUP_LABELS,
	stateCounts: stateCounts,
	summarizeItem: summarizeItem,
	summarizeCt0Items: summarizeCt0Items,
	itemMeta: itemMeta,
	itemLines: itemLines,
	groupItemLine: groupItemLine,
	itemsInState: itemsInState,
	groupSummary: groupSummary,
	groupRows: groupRows,
	groupLines: groupLines,
	boxLines: boxLines,
	fetchCt0Box: fetchCt0Box,
	fetchCt0Groups: fetchCt0Groups,
	fetchCt0Group: fetchCt0Group,
};
