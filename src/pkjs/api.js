/*
 * CardTrader API client (PKJS).
 *
 * Deliberately free of Pebble globals: the HTTP transport and the token source
 * are injected, so the whole client can be unit-tested in Node and reused
 * anywhere.
 *
 * Every method resolves - it never rejects - with a structured result:
 *   { ok: true,  status, data }
 *   { ok: false, status, retryable, error: { code, message } }
 *
 * API docs: https://www.cardtrader.com/en/docs/api
 */

var DEFAULT_BASE_URL = "https://api.cardtrader.com/api/v2";
var DEFAULT_TIMEOUT_MS = 20000;
var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_RETRY_BASE_MS = 500;
// Documented global limit is 200 requests / 10 s -> one every 50 ms.
var DEFAULT_MIN_INTERVAL_MS = 50;

function defaultSleep(ms) {
	return new Promise(function (resolve) {
		setTimeout(resolve, ms);
	});
}

function buildUrl(baseUrl, path, query) {
	var url = baseUrl + path;
	var parts = [];
	Object.keys(query || {}).forEach(function (key) {
		var value = query[key];
		if (value === undefined || value === null || value === "") return;
		parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
	});
	if (parts.length) {
		url += "?" + parts.join("&");
	}
	return url;
}

/** Pull a human-readable message out of a CardTrader error body. */
function messageFrom(data) {
	if (!data) return null;
	if (typeof data === "string") return data;
	if (data.extra && data.extra.message) return data.extra.message;
	if (typeof data.error === "string") return data.error;
	if (Array.isArray(data.errors)) return data.errors.join("; ") || null;
	if (data.errors && typeof data.errors === "object") {
		var messages = Object.keys(data.errors).map(function (key) {
			var value = data.errors[key];
			return Array.isArray(value) ? value.join(", ") : value;
		});
		return messages.join("; ") || null;
	}
	return null;
}

function codeForStatus(status) {
	if (status === 401) return "unauthorized";
	if (status === 404) return "not_found";
	if (status === 422) return "validation_error";
	if (status === 429) return "rate_limited";
	if (status >= 500) return "server_error";
	return "http_error";
}

function isRetryable(status) {
	return status === 429 || status >= 500;
}

function retryAfterMs(response) {
	var value = (response.headers || {})["retry-after"];
	if (value === undefined || value === null) return null;
	var seconds = Number(value);
	return isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * The bearer token must only ever go to an HTTPS endpoint. Plain HTTP is
 * allowed only for loopback, so the local mock server
 * (tools/mock-cardtrader) can be used during development.
 */
function isAllowedBaseUrl(url) {
	if (typeof url !== "string") return false;
	var lower = url.trim().toLowerCase();
	if (lower.indexOf("https://") === 0) return true;
	return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(lower);
}

function createClient(options) {
	options = options || {};
	if (typeof options.transport !== "function") {
		throw new Error("createClient requires a transport function");
	}

	var transport = options.transport;
	var getBaseUrl = options.getBaseUrl || function () {
		return options.baseUrl || DEFAULT_BASE_URL;
	};
	var getToken = options.getToken || function () { return ""; };
	var timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
	var maxRetries = options.maxRetries == null ? DEFAULT_MAX_RETRIES : options.maxRetries;
	var retryBaseMs = options.retryBaseMs == null ? DEFAULT_RETRY_BASE_MS : options.retryBaseMs;
	var minIntervalMs = options.minIntervalMs == null ? DEFAULT_MIN_INTERVAL_MS : options.minIntervalMs;
	var sleep = options.sleep || defaultSleep;
	var now = options.now || function () { return Date.now(); };

	var lastRequestAt = -Infinity;

	// Simple client-side rate limiter: never start two requests closer than
	// minIntervalMs apart. Safe for concurrent callers without a queue because
	// lastRequestAt is advanced synchronously.
	function throttle() {
		if (!minIntervalMs) return Promise.resolve();
		var t = now();
		var wait = minIntervalMs - (t - lastRequestAt);
		lastRequestAt = wait > 0 ? t + wait : t;
		return wait > 0 ? sleep(wait) : Promise.resolve();
	}

	function once(method, path, query) {
		var token = getToken();
		if (!token) {
			return Promise.resolve({
				ok: false,
				status: 0,
				retryable: false,
				error: { code: "no_token", message: "No CardTrader API token configured." },
			});
		}

		var baseUrl = getBaseUrl();
		if (!isAllowedBaseUrl(baseUrl)) {
			return Promise.resolve({
				ok: false,
				status: 0,
				retryable: false,
				error: {
					code: "insecure_base_url",
					message: "Refusing to send the token to a non-HTTPS API endpoint.",
				},
			});
		}

		var requestOptions = {
			method: method,
			url: buildUrl(baseUrl, path, query),
			headers: {
				Authorization: "Bearer " + token,
				Accept: "application/json",
			},
			timeoutMs: timeoutMs,
		};

		return throttle()
			.then(function () {
				return transport(requestOptions);
			})
			.then(function (response) {
				var data = null;
				var failedParse = false;
				if (response.text) {
					try {
						data = JSON.parse(response.text);
					} catch (e) {
						failedParse = true;
					}
				}

				if (response.status >= 200 && response.status < 300) {
					if (failedParse) {
						return {
							ok: false,
							status: response.status,
							retryable: false,
							error: { code: "parse_error", message: "Invalid JSON response." },
						};
					}
					return { ok: true, status: response.status, data: data };
				}

				return {
					ok: false,
					status: response.status,
					retryable: isRetryable(response.status),
					retryAfterMs: retryAfterMs(response),
					error: {
						code: codeForStatus(response.status),
						message:
							messageFrom(data) ||
							"CardTrader returned HTTP " + response.status + ".",
					},
				};
			})
			.then(null, function (err) {
				return {
					ok: false,
					status: 0,
					retryable: true,
					error: {
						code: "network_error",
						message: (err && err.message) || "Network request failed.",
					},
				};
			});
	}

	function backoffMs(attempt, result) {
		if (result.retryAfterMs != null) return result.retryAfterMs;
		return retryBaseMs * Math.pow(2, attempt);
	}

	function attemptWithRetry(method, path, query, attempt) {
		return once(method, path, query).then(function (result) {
			if (result.ok || !result.retryable || attempt >= maxRetries) {
				return result;
			}
			return sleep(backoffMs(attempt, result)).then(function () {
				return attemptWithRetry(method, path, query, attempt + 1);
			});
		});
	}

	function get(path, query) {
		return attemptWithRetry("GET", path, query, 0);
	}

	return {
		getInfo: function () {
			return get("/info");
		},
		getOrders: function (params) {
			return get("/orders", params);
		},
		getOrder: function (id) {
			return get("/orders/" + encodeURIComponent(id));
		},
		getCt0BoxItems: function () {
			return get("/ct0_box_items");
		},
	};
}

module.exports = {
	createClient: createClient,
	isAllowedBaseUrl: isAllowedBaseUrl,
	DEFAULT_BASE_URL: DEFAULT_BASE_URL,
};
