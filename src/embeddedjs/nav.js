/*
 * Logical screen stack for the watch UI.
 *
 * Screens are plain descriptors, NOT UI objects: the shell renders them with
 * Poco into a fixed screen, so navigation never allocates new UI (the watch
 * heap cannot afford it).
 *
 * List item shape: { primary, secondary, value, action }.
 * `accent` optionally overrides the header colour (defaults to black).
 */

export function listScreen(title, items, hint, accent) {
	return {
		kind: "list",
		title: title,
		items: items || [],
		hint: hint || "",
		index: 0,
		offset: 0,
		accent: accent || null,
	};
}

export function statusScreen(title, message, hint, action, accent) {
	return {
		kind: "status",
		title: title,
		message: message || "",
		hint: hint || "",
		action: action || null,
		accent: accent || null,
	};
}

/** Scrollable list of display lines ({ t: text, h: heading }). */
export function detailScreen(title, lines, hint, accent) {
	return {
		kind: "detail",
		title: title,
		lines: lines || [],
		hint: hint || "",
		offset: 0,
		accent: accent || null,
	};
}

export class Navigator {
	constructor() {
		this.stack = [];
	}

	get current() {
		return this.stack.length ? this.stack[this.stack.length - 1] : null;
	}

	get depth() {
		return this.stack.length;
	}

	reset(screen) {
		this.stack = [screen];
		return screen;
	}

	replaceTop(screen) {
		if (this.stack.length) this.stack[this.stack.length - 1] = screen;
		else this.stack = [screen];
		return screen;
	}

	push(screen) {
		this.stack.push(screen);
		return screen;
	}

	/** Returns true if a screen was popped, false at the root. */
	pop() {
		if (this.stack.length <= 1) return false;
		this.stack.pop();
		return true;
	}
}
