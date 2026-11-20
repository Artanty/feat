/**
 * get-updates feature — feat-router entry (js-node).
 *
 * This file exists only so feat's router has its required `index.*` entry. Consumers
 * VENDOR get-updates.js (+ get-updates.d.ts) directly (see back/spec/get-updates.md, Consumer
 * contract) — this entry is not part of the vendored set.
 */
export { attach, attachGetUpdates, collectInfo, createGetUpdatesHandler, envPresence, mountedFeatures, readPackages } from './get-updates.js';
