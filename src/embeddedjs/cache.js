/*
 * Watch-side snapshot cache: persists the last orders list and CT0 box text in
 * localStorage so the app can show something useful offline.
 *
 * Best effort: a full or unavailable store must never break the app.
 */

import "shared-snapshot";

const snapshot = globalThis.PebTraderSnapshot;
const KEY = "pebtrader-snapshot";

export function save(value) {
	try {
		localStorage.setItem(KEY, snapshot.serialize(value));
	} catch (e) {
		// storage full or unavailable
	}
}

export function load() {
	try {
		return snapshot.parse(localStorage.getItem(KEY));
	} catch (e) {
		return null;
	}
}

export function clear() {
	try {
		localStorage.removeItem(KEY);
	} catch (e) {
		// ignore
	}
}
