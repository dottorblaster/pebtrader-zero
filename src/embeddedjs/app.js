/*
 * PebTrader Zero - watch-side app shell and order list.
 *
 * Uses Poco (a single imperative renderer): the Moddable watch heap is tiny,
 * and a Piu content tree of text labels exhausts it. The logical screen stack
 * lives in nav.js; draw() renders the current screen.
 */

import Poco from "commodetto/Poco";
import Button from "pebble/button";
import protocol from "./protocol";
import { createMessenger } from "./messenger";
import { Navigator, listScreen, statusScreen, detailScreen } from "./nav";

const render = new Poco(screen);

const fontHeader = new render.Font("Gothic-Bold", 18);
const fontBold = new render.Font("Gothic-Bold", 14);
const fontRegular = new render.Font("Gothic-Regular", 14);

const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);
const gray = render.makeColor(120, 120, 120);
const dark = render.makeColor(50, 50, 50);

const ROUND = screen.width === screen.height;
const HEADER_H = ROUND ? 34 : 30;
const ROW_H = 34;
const HINT_H = 18;
const SIDE_PAD = ROUND ? 24 : 6;
const VISIBLE_ROWS = ROUND ? 3 : 4;
const REFRESH_HOLD_MS = 700;
const REFRESH_HINT = "Hold select to refresh";
const LIST_HINT = "hold: down box, select refresh";

function formatTime(date) {
	const h = date.getHours();
	const m = date.getMinutes();
	return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
}

/** Greedy word-wrap into lines that fit maxWidth. */
function wrapText(text, font, maxWidth) {
	const lines = [];
	String(text)
		.split("\n")
		.forEach(paragraph => {
			let line = "";
			paragraph.split(" ").forEach(word => {
				const candidate = line ? line + " " + word : word;
				if (line && render.getTextWidth(candidate, font) > maxWidth) {
					lines.push(line);
					line = word;
				} else {
					line = candidate;
				}
			});
			lines.push(line);
		});
	return lines;
}

/** Trim text with an ellipsis so it fits maxWidth. */
function fitText(text, font, maxWidth) {
	text = String(text);
	if (render.getTextWidth(text, font) <= maxWidth) return text;
	let trimmed = text;
	while (trimmed.length > 1 && render.getTextWidth(trimmed + "\u2026", font) > maxWidth) {
		trimmed = trimmed.slice(0, -1);
	}
	return trimmed + "\u2026";
}

class Shell {
	constructor() {
		this.nav = new Navigator();
		this.items = [];
		this.updatedAt = null;
		this.ready = false;
		this.pendingDetail = false;
		this.pendingBox = false;

		this.button = new Button({
			types: ["select", "up", "down", "back"],
			onPush: (down, type) => this.onButton(down, type),
		});

		// The Message channel and its key table are not free on the tiny watch
		// heap, so create them after the first frame has been drawn.
		this.messenger = null;
		this.showLoading();
		this.startTimer = setTimeout(() => this.startMessaging(), 50);
		console.log("PebTrader Zero shell started");
	}

	startMessaging() {
		this.startTimer = null;
		this.messenger = createMessenger({
			onReady: () => {
				if (this.ready) return;
				this.ready = true;
				this.refresh();
			},
			onStatus: (status, code, message) => this.onStatus(status, code, message),
			onOrders: payload => this.onOrders(payload),
			onDetail: payload => this.onDetail(payload),
			onBox: payload => this.onBox(payload),
		});
	}

	refresh() {
		if (!this.ready || !this.messenger) return;
		if (this.items.length === 0) this.showLoading();
		this.messenger.requestRefresh();
	}

	draw() {
		render.begin();
		render.fillRectangle(white, 0, 0, render.width, render.height);

		const screen = this.nav.current;
		if (screen) {
			render.fillRectangle(black, 0, 0, render.width, HEADER_H);
			const titleWidth = render.getTextWidth(screen.title, fontHeader);
			render.drawText(screen.title, fontHeader, white, (render.width - titleWidth) / 2, (HEADER_H - fontHeader.height) / 2);

			if (screen.kind === "list") this.drawList(screen);
			else if (screen.kind === "detail") this.drawDetail(screen);
			else this.drawStatus(screen);

			if (screen.hint) {
				// Round displays are narrow near the bottom, so lift the hint and trim it.
				const hint = fitText(screen.hint, fontBold, render.width - SIDE_PAD * 2);
				const hintWidth = render.getTextWidth(hint, fontBold);
				const hintY = render.height - HINT_H - (ROUND ? 22 : 0);
				render.drawText(hint, fontBold, gray, (render.width - hintWidth) / 2, hintY);
			}
		}

		render.end();
	}

	drawList(screen) {
		if (screen.index < screen.offset) screen.offset = screen.index;
		else if (screen.index >= screen.offset + VISIBLE_ROWS) screen.offset = screen.index - VISIBLE_ROWS + 1;

		const maxTextWidth = render.width - SIDE_PAD * 2;

		for (let i = 0; i < VISIBLE_ROWS; i++) {
			const item = screen.items[screen.offset + i];
			if (!item) break;
			const y = HEADER_H + 2 + i * ROW_H;
			const selected = screen.offset + i === screen.index;
			if (selected) render.fillRectangle(black, SIDE_PAD - 4, y, render.width - 2 * (SIDE_PAD - 4), ROW_H);

			const color = selected ? white : black;
			const valueWidth = item.value ? render.getTextWidth(item.value, fontBold) : 0;
			render.drawText(fitText(item.primary, fontBold, maxTextWidth - valueWidth - 6), fontBold, color, SIDE_PAD, y + 2);
			if (item.value) render.drawText(item.value, fontBold, color, render.width - SIDE_PAD - valueWidth, y + 2);
			if (item.secondary) {
				render.drawText(fitText(item.secondary, fontRegular, maxTextWidth), fontRegular, selected ? white : gray, SIDE_PAD, y + 2 + fontBold.height);
			}
		}
	}

	drawStatus(screen) {
		const lines = wrapText(screen.message, fontRegular, render.width - SIDE_PAD * 2);
		const top = HEADER_H + 4;
		const bottom = render.height - HINT_H;
		const lineHeight = fontRegular.height + 2;
		let y = top + Math.max(0, (bottom - top - lines.length * lineHeight) / 2);

		lines.forEach(line => {
			const width = render.getTextWidth(line, fontRegular);
			render.drawText(line, fontRegular, black, (render.width - width) / 2, y);
			y += lineHeight;
		});
	}

	showLoading() {
		this.nav.reset(statusScreen("PebTrader Zero", "Loading your orders\u2026", REFRESH_HINT));
		this.draw();
	}

	showError(code, message) {
		let title = "Something went wrong";
		let body = message || "Please try again.";

		if (code === protocol.ERROR_CODES.NO_TOKEN) {
			title = "Setup needed";
			body = "No CardTrader token.\nOpen the app settings on your phone to add it.";
		} else if (code === protocol.ERROR_CODES.UNAUTHORIZED) {
			title = "Token invalid";
			body = "Your CardTrader token was rejected.\nCheck it in the app settings.";
		} else if (code === protocol.ERROR_CODES.NETWORK) {
			title = "Offline";
			body = "Could not reach CardTrader.\nCheck your phone connection.";
		} else if (code === protocol.ERROR_CODES.RATE_LIMITED) {
			title = "CardTrader is busy";
			body = "Too many requests.\nTry again in a moment.";
		}

		this.nav.reset(statusScreen(title, body, REFRESH_HINT));
		this.draw();
	}

	showEmpty() {
		this.nav.reset(
			statusScreen("Orders", "No orders found.\nCheck the filters in the app settings.", REFRESH_HINT)
		);
		this.draw();
	}

	onStatus(status, code, message) {
		if (status === protocol.STATUS.ERROR) {
			if (this.pendingDetail) {
				this.pendingDetail = false;
		this.pendingBox = false;
				this.nav.replaceTop(statusScreen("Order", message || "Could not load this order.", "Back to return"));
				this.draw();
			} else {
				this.showError(code, message);
			}
		} else if (status === protocol.STATUS.OK && this.items.length === 0) {
			this.showEmpty();
		}
	}

	onOrders(payload) {
		// Build the display rows and drop the raw order objects: the watch heap
		// is tiny and keeping them leaves no room to open the detail screen.
		const list = (payload && payload.orders) || [];
		this.items = list.map(order => ({
			id: order.id,
			primary: protocol.orderStateLabel(order.state),
			secondary: this.secondaryFor(order),
			value: order.total || "",
			detail: this.detailFor(order),
		}));
		this.updatedAt = new Date();

		if (this.items.length === 0) this.showEmpty();
		else this.showOrders();
	}

	showOrders() {
		this.nav.reset(listScreen("Orders \u00b7 " + formatTime(this.updatedAt), this.items, REFRESH_HINT));
		this.draw();
	}

	secondaryFor(order) {
		let text = order.size + (order.size === 1 ? " item" : " items");
		if (order.who) text += " \u00b7 " + order.who;
		if (order.ct0) text += " \u00b7 CT0";
		return text;
	}

	detailFor(order) {
		const lines = [
			protocol.orderStateLabel(order.state),
			order.size + (order.size === 1 ? " item" : " items") + (order.ct0 ? " \u00b7 CardTrader Zero" : ""),
		];
		if (order.total) lines.push("Total: " + order.total);
		if (order.who) lines.push("Counterparty: " + order.who);
		return lines.join("\n");
	}

	openDetail(orderId) {
		if (!orderId) return;
		this.pendingDetail = true;
		this.nav.push(statusScreen("Order", "Loading\u2026", "Back to return"));
		this.draw();
		if (this.messenger) this.messenger.requestDetail(orderId);
	}

	onDetail(payload) {
		this.pendingDetail = false;
		this.pendingBox = false;
		const text = (payload && payload.text) || "";
		const lines = text.length ? text.split("\n") : [];
		this.nav.replaceTop(detailScreen("Order", lines, "Back to return"));
		this.draw();
	}

	openBox() {
		this.pendingBox = true;
		this.nav.push(statusScreen("CT0 box", "Loading\u2026", "Back to return"));
		this.draw();
		if (this.messenger) this.messenger.requestBox();
	}

	onBox(payload) {
		this.pendingBox = false;
		const text = (payload && payload.text) || "";
		const lines = text.length ? text.split("\n") : [];
		this.nav.replaceTop(detailScreen("CT0 box", lines, "Back to return"));
		this.draw();
	}

	detailVisibleLines() {
		const lineHeight = fontRegular.height + 2;
		const top = HEADER_H + 2;
		const bottom = render.height - HINT_H - (ROUND ? 22 : 0) - 2;
		return Math.max(1, Math.floor((bottom - top) / lineHeight));
	}

	drawDetail(screen) {
		const lineHeight = fontRegular.height + 2;
		const top = HEADER_H + 2;
		const visible = this.detailVisibleLines();
		const maxOffset = Math.max(0, screen.lines.length - visible);
		if (screen.offset > maxOffset) screen.offset = maxOffset;
		if (screen.offset < 0) screen.offset = 0;

		for (let i = 0; i < visible; i++) {
			const line = screen.lines[screen.offset + i];
			if (line === undefined) break;
			const y = top + i * lineHeight;
			const heading = line.charCodeAt(0) === protocol.HEADING_MARK.charCodeAt(0);
			const value = heading ? line.slice(1) : line;
			const font = heading ? fontBold : fontRegular;
			render.drawText(fitText(value, font, render.width - SIDE_PAD * 2), font, heading ? black : dark, SIDE_PAD, y);
		}
	}

	onButton(down, type) {
		if (type === "select") {
			if (down) {
				this.selectTimer = setTimeout(() => {
					this.selectTimer = null;
					this.refresh();
				}, REFRESH_HOLD_MS);
				return;
			}
			if (this.selectTimer) {
				clearTimeout(this.selectTimer);
				this.selectTimer = null;
				this.onSelect();
			}
			return;
		}

		if (type === "down") {
			if (down) {
				this.downTimer = setTimeout(() => {
					this.downTimer = null;
					this.openBox();
				}, REFRESH_HOLD_MS);
				return;
			}
			if (this.downTimer) {
				clearTimeout(this.downTimer);
				this.downTimer = null;
				this.scroll(1);
			}
			return;
		}

		if (!down) return;
		if (type === "back") {
			if (this.nav.pop()) this.draw();
			return;
		}
		if (type === "up") this.scroll(-1);
	}

	scroll(delta) {
		const screen = this.nav.current;
		if (!screen) return;

		if (screen.kind === "list") {
			const next = screen.index + delta;
			if (next >= 0 && next < screen.items.length) {
				screen.index = next;
				this.draw();
			}
		} else if (screen.kind === "detail") {
			const maxOffset = Math.max(0, screen.lines.length - this.detailVisibleLines());
			const next = screen.offset + delta;
			if (next >= 0 && next <= maxOffset) {
				screen.offset = next;
				this.draw();
			}
		}
	}

	onSelect() {
		const screen = this.nav.current;
		if (screen && screen.kind === "list") {
			const item = screen.items[screen.index];
			if (item) this.openDetail(item.id);
		}
	}
}

export default new Shell();
