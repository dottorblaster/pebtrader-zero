/*
 * Order normalization (PKJS).
 *
 * Turns the raw `GET /orders` payload into the compact shapes the watch can
 * afford to receive. Pure functions only - no Pebble globals, no network - so
 * they are unit-testable in Node.
 *
 * The full order payload is large (a single order can carry hundreds of items
 * and weigh >100 KB), so the watch never sees it raw.
 */

// Documented order states, plus the spelling seen in the wild.
var ORDER_STATES = [
	"hub_pending",
	"paid",
	"sent",
	"arrived",
	"done",
	"request_for_cancel",
	"canceled",
	"cancelled",
	"lost",
];

function isKnownState(state) {
	return ORDER_STATES.indexOf(state) !== -1;
}

function normalizeState(state) {
	return typeof state === "string" && state.length ? state : "unknown";
}

function formatMoney(money) {
	if (!money || typeof money.cents !== "number") return null;
	var amount = (money.cents / 100).toFixed(2);
	return money.currency ? amount + " " + money.currency : amount;
}

function totalOf(order) {
	var money = order.buyer_total || order.seller_total || order.buyer_subtotal || order.seller_subtotal;
	return order.formatted_total || order.formatted_subtotal || formatMoney(money);
}

function counterpartyOf(order) {
	var other = order.order_as === "buyer" ? order.seller : order.buyer;
	return other && other.username ? other.username : null;
}

function roleOf(order) {
	if (order.order_as === "buyer" || order.order_as === "seller") return order.order_as;
	return null;
}

function sizeOf(order) {
	if (typeof order.size === "number") return order.size;
	return Array.isArray(order.order_items) ? order.order_items.length : 0;
}

function previewOf(items, max) {
	if (!Array.isArray(items)) return [];
	return items.slice(0, max).map(function (item) {
		return {
			name: item && item.name ? item.name : "",
			quantity: item && item.quantity ? item.quantity : 1,
		};
	});
}

function shippingOf(order) {
	var shipping = order.order_shipping_method;
	if (!shipping) return null;
	return {
		name: shipping.name || null,
		tracked: !!shipping.tracked,
		trackingCode: shipping.tracking_code || null,
	};
}

/** Compact per-order summary, sized for a list row. */
function summarizeOrder(order) {
	order = order || {};
	var state = normalizeState(order.state);
	return {
		id: order.id != null ? order.id : null,
		code: order.code || null,
		state: state,
		stateKnown: isKnownState(state),
		role: roleOf(order),
		ct0: !!order.via_cardtrader_zero,
		size: sizeOf(order),
		total: totalOf(order),
		paidAt: order.paid_at || null,
		sentAt: order.sent_at || null,
		cancelledAt: order.cancelled_at || null,
		presale: !!order.presale,
		counterparty: counterpartyOf(order),
		shipping: shippingOf(order),
		preview: previewOf(order.order_items, 2),
	};
}

/** Summary plus a capped item list, for the detail screen. */
function summarizeOrderDetail(order, options) {
	options = options || {};
	var maxItems = options.maxItems == null ? 20 : options.maxItems;
	var items = order && Array.isArray(order.order_items) ? order.order_items : [];
	var detail = summarizeOrder(order);

	detail.items = items.slice(0, maxItems).map(function (item) {
		item = item || {};
		var properties = item.properties || {};
		return {
			name: item.name || "",
			expansion: item.expansion || null,
			quantity: item.quantity || 1,
			price: item.formatted_price || null,
			condition: properties.condition || null,
		};
	});
	detail.itemsTruncated = items.length > maxItems;
	detail.itemCount = items.length;

	return detail;
}

function newestFirst(a, b) {
	var aDate = a.paidAt || "";
	var bDate = b.paidAt || "";
	if (aDate !== bDate) return aDate < bDate ? 1 : -1;
	return (b.id || 0) - (a.id || 0);
}

/**
 * Filter, sort and cap raw orders into summaries.
 *
 * options.ct0Only  - keep only CardTrader Zero orders
 * options.maxOrders - cap the number of summaries returned
 */
function normalizeOrders(orders, options) {
	options = options || {};
	var list = Array.isArray(orders) ? orders : [];

	if (options.ct0Only) {
		list = list.filter(function (order) {
			return !!(order && order.via_cardtrader_zero);
		});
	}

	var summaries = list.map(summarizeOrder);
	summaries.sort(newestFirst);

	if (options.maxOrders != null && options.maxOrders >= 0) {
		summaries = summaries.slice(0, options.maxOrders);
	}

	return summaries;
}

/**
 * Fetch orders through the API client and normalize the result.
 * Resolves with the same structured envelope as the client:
 *   { ok: true, status, data: [summary...], rawCount }
 *   { ok: false, status, error }
 */
function fetchOrders(client, options) {
	options = options || {};
	var params = {
		sort: options.sort || "date.desc",
		limit: options.limit || 100,
	};
	if (options.role && options.role !== "both") params.order_as = options.role;
	if (options.state) params.state = options.state;
	if (options.page) params.page = options.page;

	return client.getOrders(params).then(function (result) {
		if (!result.ok) return result;
		var raw = Array.isArray(result.data) ? result.data : [];
		return {
			ok: true,
			status: result.status,
			rawCount: raw.length,
			data: normalizeOrders(raw, { ct0Only: options.ct0Only, maxOrders: options.maxOrders }),
		};
	});
}

module.exports = {
	ORDER_STATES: ORDER_STATES,
	isKnownState: isKnownState,
	normalizeState: normalizeState,
	summarizeOrder: summarizeOrder,
	summarizeOrderDetail: summarizeOrderDetail,
	normalizeOrders: normalizeOrders,
	fetchOrders: fetchOrders,
};
