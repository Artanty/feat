/**
 * get-updates feature — feat-router entry (js-node, v2).
 *
 * This file exists only so feat's router has its required `index.*` entry. The feature
 * is loaded REMOTELY by the backend-slots loader (FEAT_GET_UPDATES_SLOT=route) —
 * consumers carry no copy of it.
 */
export { kind, defaultMount, routes, collectInfo, createGetUpdatesHandler, envPresence, mountedFeatures, readPackages } from './get-updates.js';
