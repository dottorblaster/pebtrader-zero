/*
 * PebTrader Zero - watch-side app shell.
 *
 * Uses Poco (a single imperative renderer) rather than Piu: the Moddable
 * watch heap is tiny, and a Piu content tree of text labels exhausts it. The
 * logical screen stack lives in nav.js; draw() renders the current screen.
 *
 * Concrete list/detail/box screens plug in later. Until the data layer is
 * wired up, long-press select cycles the global states (see DEBUG_STATES).
 */

import Poco from "commodetto/Poco";
import Button from "pebble/button";
import { CHUNK_SIZE } from "./protocol";
import { Navigator, menuScreen, statusScreen } from "./nav";

const render = new Poco(screen);

const fontHeader = new render.Font("Gothic-Bold", 18);
const fontRow = new render.Font("Gothic-Bold", 14);
const fontBody = new render.Font("Gothic-Regular", 14);
const fontHint = new render.Font("Gothic-Bold", 14);

const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);
const gray = render.makeColor(120, 120, 120);

const HEADER_H = screen.width === screen.height ? 34 : 30;
const ROW_H = 28;
const HINT_H = 18;
// Round displays (gabbro) clip the corners, so keep content inset.
const ROUND = screen.width === screen.height;
const SIDE_PAD = ROUND ? 24 : 6;
const VISIBLE_ROWS = ROUND ? 3 : 4;
const LOADING_DELAY = 800;
const CONNECTION_CHECK_DELAY = 1500;
const DEBUG_STATES = true;

const STATE_VIEWS = {
	loading: {
		title: "PebTrader Zero",
		message: "Loading your orders\u2026",
		hint: "Please wait",
	},
	empty: {
		title: "PebTrader Zero",
		message: "No data yet.\nAdd your CardTrader token in the phone app settings.",
		hint: DEBUG_STATES ? "Hold select to cycle states" : "",
	},
	error: {
		title: "Something went wrong",
		message: "We couldn't reach CardTrader.",
		hint: "Please try again",
	},
	stale: {
		title: "Offline",
		message: "Waiting for your phone\u2026",
		hint: "",
	},
};
const STATE_ORDER = ["loading", "empty", "error", "stale"];

/** Greedy word-wrap into lines that fit maxWidth. */
function wrapText(text, font, maxWidth) {
	const paragraphs = String(text).split("\n");
	const lines = [];

	paragraphs.forEach(paragraph => {
		const words = paragraph.split(" ");
		let line = "";
		words.forEach(word => {
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

class Shell {
	constructor() {
		this.nav = new Navigator();
		this.statusName = null;
		this.beforeOffline = null;
		this.debugIndex = 0;

		this.button = new Button({
			types: ["select", "up", "down", "back"],
			onPush: (down, type) => this.onButton(down, type),
		});

		watch.addEventListener("connected", () => this.onConnectionChanged());
		this.connectionTimer = setTimeout(() => this.onConnectionChanged(), CONNECTION_CHECK_DELAY);
		this.loadingTimer = setTimeout(() => this.finishLoading(), LOADING_DELAY);

		this.showState("loading");
		console.log("PebTrader Zero shell started (chunk=" + CHUNK_SIZE + ")");
	}

	draw() {
		render.begin();
		render.fillRectangle(white, 0, 0, render.width, render.height);

		const screen = this.nav.current;
		if (screen) {
			render.fillRectangle(black, 0, 0, render.width, HEADER_H);
			const titleWidth = render.getTextWidth(screen.title, fontHeader);
			render.drawText(screen.title, fontHeader, white, (render.width - titleWidth) / 2, (HEADER_H - fontHeader.height) / 2);

			if (screen.kind === "menu") this.drawMenu(screen);
			else this.drawStatus(screen);

			if (screen.hint) {
				const width = render.getTextWidth(screen.hint, fontHint);
				render.drawText(screen.hint, fontHint, gray, (render.width - width) / 2, render.height - HINT_H + 3);
			}
		}

		render.end();
	}

	drawMenu(screen) {
		if (screen.index < screen.offset) screen.offset = screen.index;
		else if (screen.index >= screen.offset + VISIBLE_ROWS) screen.offset = screen.index - VISIBLE_ROWS + 1;

		for (let i = 0; i < VISIBLE_ROWS; i++) {
			const item = screen.items[screen.offset + i];
			if (!item) break;
			const y = HEADER_H + 2 + i * ROW_H;
			const selected = screen.offset + i === screen.index;
			if (selected) {
				render.fillRectangle(black, SIDE_PAD - 4, y, render.width - 2 * (SIDE_PAD - 4), ROW_H);
			}
			render.drawText(item.label, fontRow, selected ? white : black, SIDE_PAD, y + (ROW_H - fontRow.height) / 2);
		}
	}

	drawStatus(screen) {
		const lines = wrapText(screen.message, fontBody, render.width - SIDE_PAD * 2);
		const top = HEADER_H + 4;
		const bottom = render.height - HINT_H;
		const lineHeight = fontBody.height + 2;
		let y = top + Math.max(0, (bottom - top - lines.length * lineHeight) / 2);

		lines.forEach(line => {
			const width = render.getTextWidth(line, fontBody);
			render.drawText(line, fontBody, black, (render.width - width) / 2, y);
			y += lineHeight;
		});
	}

	finishLoading() {
		this.loadingTimer = null;
		if (this.statusName === "loading") this.showHome();
	}

	showState(name) {
		const view = STATE_VIEWS[name] || STATE_VIEWS.empty;
		this.statusName = name;
		this.nav.reset(statusScreen(view.title, view.message, view.hint));
		this.draw();
	}

	showHome() {
		this.statusName = "home";
		this.nav.reset(
			menuScreen("PebTrader Zero", [
				{ label: "Orders", action: () => this.openPlaceholder("Orders", "Order list lands in a later issue.") },
				{ label: "CardTrader Zero box", action: () => this.openPlaceholder("CardTrader Zero box", "Box status lands in a later issue.") },
			])
		);
		this.draw();
	}

	openPlaceholder(title, message) {
		this.nav.push(statusScreen(title, message, "Back to return"));
		this.draw();
	}

	onButton(down, type) {
		if (type === "select") {
			if (down) {
				this.longPressTimer = setTimeout(() => {
					this.longPressTimer = null;
					if (DEBUG_STATES) this.cycleState();
				}, 700);
				return;
			}
			if (this.longPressTimer) {
				clearTimeout(this.longPressTimer);
				this.longPressTimer = null;
				this.onSelect();
			}
			return;
		}

		if (!down) return;
		const screen = this.nav.current;

		if (type === "back") {
			this.statusName = null;
			if (this.nav.pop()) this.draw();
			return;
		}
		if (!screen || screen.kind !== "menu") return;

		if (type === "up" && screen.index > 0) {
			screen.index -= 1;
			this.draw();
		} else if (type === "down" && screen.index < screen.items.length - 1) {
			screen.index += 1;
			this.draw();
		}
	}

	onSelect() {
		const screen = this.nav.current;
		if (screen && screen.kind === "menu") {
			const item = screen.items[screen.index];
			if (item && item.action) item.action();
		}
	}

	cycleState() {
		this.debugIndex = (this.debugIndex + 1) % STATE_ORDER.length;
		this.showState(STATE_ORDER[this.debugIndex]);
	}

	onConnectionChanged() {
		const connected = !!(watch.connected && watch.connected.pebblekit);
		const offline = this.statusName === "offline";

		if (!connected && !offline) {
			this.beforeOffline = this.nav.current;
			this.statusName = "offline";
			this.nav.reset(statusScreen(STATE_VIEWS.stale.title, STATE_VIEWS.stale.message, STATE_VIEWS.stale.hint));
			this.draw();
		} else if (connected && offline) {
			this.statusName = null;
			if (this.beforeOffline) this.nav.reset(this.beforeOffline);
			this.draw();
		}
	}
}

export default new Shell();
