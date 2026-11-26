/**
 * backend-slots loader feature — feat-router entry (js-node).
 *
 * This file exists only so feat's router has its required `index.*` entry. Consumers
 * VENDOR loader.js (+ loader.d.ts) directly (see back/spec/backend-slots.md) — this entry
 * is not part of the vendored set.
 */
export { createFeatLoader, mountBackendFeatures } from './loader.js';
