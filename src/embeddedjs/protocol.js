/*
 * Watch-side view of the shared protocol.
 *
 * The definitions and codec live in src/common/protocol.js, shared with PKJS.
 * Moddable (ESM) cannot import a CommonJS module, so the shared file installs
 * itself on globalThis and this module re-exports it as proper ESM.
 *
 * Only cheap bindings are re-exported eagerly. The data tables (COMMANDS,
 * TYPES, ORDER_STATES, ...) are lazy getters on the default export, so they are
 * not allocated until the UI actually needs them - the watch's JS heap is tiny.
 */

import "shared-protocol";

const protocol = globalThis.PebTraderProtocol;

export default protocol;

export const CHUNK_SIZE = protocol.CHUNK_SIZE;
export const orderStateLabel = protocol.orderStateLabel;
export const orderStateGroup = protocol.orderStateGroup;
export const ct0StateLabel = protocol.ct0StateLabel;
export const errorCodeFromApi = protocol.errorCodeFromApi;
export const decodePayload = protocol.decodePayload;
export const createReassembler = protocol.createReassembler;
