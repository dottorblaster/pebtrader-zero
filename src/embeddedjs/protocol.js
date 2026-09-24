/*
 * Watch-side view of the shared protocol.
 *
 * The definitions and codec live in src/common/protocol.js, shared with PKJS.
 * Moddable (ESM) cannot import a CommonJS module, so the shared file installs
 * itself on globalThis and this module re-exports it as proper ESM.
 */

import "shared-protocol";

const protocol = globalThis.PebTraderProtocol;

export default protocol;

export const COMMANDS = protocol.COMMANDS;
export const TYPES = protocol.TYPES;
export const STATUS = protocol.STATUS;
export const ERROR_CODES = protocol.ERROR_CODES;
export const ORDER_STATES = protocol.ORDER_STATES;
export const CT0_STATES = protocol.CT0_STATES;
export const LIMITS = protocol.LIMITS;
export const CHUNK_SIZE = protocol.CHUNK_SIZE;
export const orderStateLabel = protocol.orderStateLabel;
export const orderStateGroup = protocol.orderStateGroup;
export const ct0StateLabel = protocol.ct0StateLabel;
export const errorCodeFromApi = protocol.errorCodeFromApi;
export const decodePayload = protocol.decodePayload;
export const createReassembler = protocol.createReassembler;
