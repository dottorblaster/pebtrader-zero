/*
 * Clay "custom function" - runs inside the generated config page (webview),
 * not in PKJS.
 *
 * IMPORTANT: Clay injects this function with Function.prototype.toString(),
 * so it must be completely self-contained: no closures over outer variables
 * and no require(). Everything it needs is defined inside.
 *
 * It validates the CardTrader API token against GET /info (CORS is allowed by
 * the API) and disables "Save" while the token is missing or invalid.
 */

module.exports = function (minified) {
	var clayConfig = this;
	var INFO_URL = "https://api.cardtrader.com/api/v2/info";
	var COLOR = { ok: "#0a8f3c", error: "#c0392b", muted: "#666666" };

	clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function () {
		var tokenItem = clayConfig.getItemByMessageKey("API_TOKEN");
		var statusItem = clayConfig.getItemById("token-status");
		var submitItem = clayConfig.getItemById("submit");

		function status(text, color) {
			statusItem.set('<span style="color:' + color + '">' + text + "</span>");
		}

		function validate() {
			var token = (tokenItem.get() || "").trim();

			if (!token) {
				status("Enter your CardTrader API token.", COLOR.error);
				submitItem.disable();
				return;
			}

			status("Checking token\u2026", COLOR.muted);
			submitItem.disable();

			var xhr = new XMLHttpRequest();
			xhr.open("GET", INFO_URL, true);
			xhr.setRequestHeader("Authorization", "Bearer " + token);
			xhr.timeout = 15000;

			xhr.onload = function () {
				if (xhr.status === 200) {
					status("Token OK.", COLOR.ok);
					submitItem.enable();
				} else if (xhr.status === 401) {
					status("Invalid token (401 Unauthorized).", COLOR.error);
				} else {
					status("CardTrader returned " + xhr.status + ".", COLOR.error);
				}
			};

			// Offline or blocked: warn, but still allow saving so the user can
			// configure without a connection.
			xhr.onerror = function () {
				status("Could not reach CardTrader. Check your connection.", COLOR.error);
				submitItem.enable();
			};
			xhr.ontimeout = xhr.onerror;

			xhr.send();
		}

		tokenItem.on("change", validate);
		validate();
	});
};
