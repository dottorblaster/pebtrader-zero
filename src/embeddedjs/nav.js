/*
 * Logical screen stack for the watch UI.
 *
 * Screens are plain descriptors ({ kind, title, items, ... }), NOT Piu
 * contents: the shell renders them into a fixed content tree so navigation
 * never allocates new UI objects (the watch heap cannot afford it).
 */

export function menuScreen(title, items, hint) {
	return {
		kind: "menu",
		title: title,
		items: items || [],
		hint: hint || "",
		index: 0,
		offset: 0,
	};
}

export function statusScreen(title, message, hint) {
	return {
		kind: "status",
		title: title,
		message: message || "",
		hint: hint || "",
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
