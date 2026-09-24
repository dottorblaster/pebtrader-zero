/*
 * XMLHttpRequest transport for the CardTrader API client.
 *
 * PKJS does not provide fetch(); XMLHttpRequest is the documented API. This is
 * kept separate from api.js so the client can be unit-tested with a fake
 * transport in Node.
 *
 * Resolves with { status, text, headers } and rejects (a real Error) on
 * network failure or timeout.
 */

function parseHeaders(raw) {
	var headers = {};
	if (!raw) return headers;
	raw.split(/\r?\n/).forEach(function (line) {
		var index = line.indexOf(":");
		if (index <= 0) return;
		var name = line.slice(0, index).trim().toLowerCase();
		headers[name] = line.slice(index + 1).trim();
	});
	return headers;
}

function request(options) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open(options.method, options.url, true);
		if (options.timeoutMs) {
			xhr.timeout = options.timeoutMs;
		}

		var headers = options.headers || {};
		Object.keys(headers).forEach(function (name) {
			xhr.setRequestHeader(name, headers[name]);
		});

		xhr.onload = function () {
			resolve({
				status: xhr.status,
				text: xhr.responseText,
				headers: parseHeaders(xhr.getAllResponseHeaders()),
			});
		};
		xhr.onerror = function () {
			reject(new Error("Network request failed."));
		};
		xhr.ontimeout = function () {
			reject(new Error("Request timed out."));
		};

		xhr.send();
	});
}

module.exports = {
	request: request,
	parseHeaders: parseHeaders,
};
