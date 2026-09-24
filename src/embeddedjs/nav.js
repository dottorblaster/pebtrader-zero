/*
 * Logical screen stack for the watch UI.
 *
 * Screens are plain descriptors, NOT UI objects: the shell renders them with
 * Poco into a fixed screen, so navigation never allocates new UI (the watch
 * heap cannot afford it).
 *
 * List item shape: { primary, secondary, value, action }.
 */

export function listScreen(title, items, hint) {
	return {
		kind: "list",
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
