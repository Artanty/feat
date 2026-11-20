/**
 * req feature — feat-router entry (js-node).
 *
 * This file exists only so feat's router has its required `index.*` entry. Consumers
 * VENDOR req.js (+ req.d.ts) directly (see back/spec/req.md, Consumer contract) — this
 * entry is not part of the vendored set.
 */
export { attach, attachReq, buildRequest, createReqHandler, mergeParams } from './req.js';
