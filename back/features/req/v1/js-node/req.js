/**
 * req feature — env-recipe request executor (js-node).
 *
 * Contract: back/spec/req.md. Consumers VENDOR this file (+ req.d.ts) and attach:
 *
 *     import { attachReq } from './req.js';
 *     attachReq(app);                    // or attachReq(app, { env, fetchImpl })
 *
 * A recipe is a set of env rows FEAT_REQ_<NAME>_*; presence of _TARGET enables it.
 * Params come from the JSON body + query (query wins) and fill {{placeholder}} holes in
 * the TARGET/HEADERS/BODY templates. The upstream response is mirrored verbatim.
 * Params are PUBLIC by contract — secrets live in the recipe's _HEADERS/_BODY env rows.
 *
 * No dependencies: req.js is pure logic + (req, res) handlers; the consumer's Express
 * app provides routing (attachReq registers GET|POST <prefix>/:name).
 */
const HOP_HEADERS = new Set(['connection', 'content-length', 'transfer-encoding', 'host', 'accept-encoding']);
const ALLOWED_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const DEFAULT_TIMEOUT_S = 30;

const envName = (recipe, suffix) => `FEAT_REQ_${recipe.toUpperCase().replace(/-/g, '_')}${suffix}`;

function readEnv(env, name) {
  const raw = (env[name] ?? '').trim();
  return raw === '' ? undefined : raw;
}

/**
 * Resolve `${NAME}` references against the process env BEFORE param substitution, so
 * shared values (e.g. FLOW_BACK_DOMAIN) live in ONE env row instead of being copied into
 * every recipe: FEAT_REQ_X_TARGET = ${FLOW_BACK_DOMAIN}/retrigger.
 * Unset referenced env → recipe misconfigured (500).
 */
function expandEnvRefs(template, env) {
  return template.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => {
    const value = env[name];
    if (typeof value !== 'string' || value.trim() === '') {
      throw misconfigured(`target references unset env ${name}`);
    }
    return value.trim();
  });
}

function substitute(template, params) {
  const missing = new Set();
  const out = template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) return String(params[key]);
    missing.add(key);
    return '';
  });
  if (missing.size > 0) {
    const err = new Error(`unknown param ${[...missing].sort().join(', ')}`);
    err.status = 400;
    throw err;
  }
  return out;
}

function misconfigured(detail) {
  const err = new Error(`recipe misconfigured: ${detail}`);
  err.status = 500;
  return err;
}

/** Build { url, method, headers, body, timeoutS } from the recipe envs + caller params. Pure. */
export function buildRequest(recipeEnv, recipe, params) {
  const targetEnv = readEnv(recipeEnv, envName(recipe, '_TARGET'));
  if (targetEnv === undefined) {
    const err = new Error('unknown recipe');
    err.status = 404;
    throw err;
  }

  const method = (readEnv(recipeEnv, envName(recipe, '_METHOD')) || 'get').toLowerCase();
  if (!ALLOWED_METHODS.includes(method)) throw misconfigured(`method must be ${ALLOWED_METHODS.join('|')}`);

  const url = substitute(expandEnvRefs(targetEnv, recipeEnv), params);
  if (!/^https?:\/\//i.test(url)) throw misconfigured('target must be http(s)');

  let headers = {};
  const headersEnv = readEnv(recipeEnv, envName(recipe, '_HEADERS'));
  if (headersEnv !== undefined) {
    try {
      headers = JSON.parse(substitute(expandEnvRefs(headersEnv, recipeEnv), params));
    } catch (e) {
      if (e.status) throw e;
      throw misconfigured(`headers is not valid JSON (${e.message})`);
    }
    if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
      throw misconfigured('headers must be a JSON object');
    }
  }
  headers = Object.fromEntries(
    Object.entries(headers).filter(([k]) => !HOP_HEADERS.has(String(k).toLowerCase()))
  );

  let body;
  const bodyEnv = readEnv(recipeEnv, envName(recipe, '_BODY'));
  if (bodyEnv !== undefined && method !== 'get') {
    const substituted = substitute(expandEnvRefs(bodyEnv, recipeEnv), params);
    try {
      const parsed = JSON.parse(substituted);
      body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      body = substituted; // non-JSON string template forwarded verbatim
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['content-type'] = 'application/json';
    }
  }

  let timeoutS = DEFAULT_TIMEOUT_S;
  const timeoutEnv = readEnv(recipeEnv, envName(recipe, '_TIMEOUT_S'));
  if (timeoutEnv !== undefined) {
    const n = Number(timeoutEnv);
    if (!Number.isInteger(n) || n <= 0) throw misconfigured('timeout_s must be a positive integer');
    timeoutS = n;
  }

  return { url, method, headers, body, timeoutS };
}

/** Merge caller params: JSON body object first, query wins. Pure. */
export function mergeParams(body, query) {
  const params = {};
  if (body && typeof body === 'object' && !Array.isArray(body)) Object.assign(params, body);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) params[k] = Array.isArray(v) ? v[0] : v;
  }
  return params;
}

/**
 * Core (req, res) handler — Express-shaped but dependency-free, so tests drive it with
 * plain objects. Responds: 404 unknown recipe / 400 unknown param / 500 misconfigured /
 * 502 connect-level failure / else mirrors the upstream (status, content-type, body).
 */
export function createReqHandler(opts = {}) {
  const env = opts.env ?? process.env;
  const doFetch = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  return async (req, res) => {
    const params = mergeParams(req.body, req.query);
    let outbound;
    try {
      outbound = buildRequest(env, req.params.name, params);
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), outbound.timeoutS * 1000);
    try {
      const upstream = await doFetch(outbound.url, {
        method: outbound.method,
        headers: outbound.headers,
        body: outbound.body,
        signal: controller.signal,
      });
      const payload = Buffer.from(await upstream.arrayBuffer());
      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.set('content-type', contentType);
      res.set('access-control-allow-origin', '*');
      res.send(payload);
    } catch (e) {
      // connect/timeout/TLS — no upstream response to mirror
      res.status(502).json({ error: e.message });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Register GET|POST <prefix>/:name on the consumer's Express app. */
export function attachReq(app, opts = {}) {
  const handler = createReqHandler(opts);
  app.get(`${opts.prefix ?? '/req'}/:name`, handler);
  app.post(`${opts.prefix ?? '/req'}/:name`, handler);
  return handler;
}

/** Standard backend-feature entry (back/spec/backend-slots.md): mount path from settings. */
export function attach(app, settings = {}) {
  const { mount, ...rest } = settings;
  return attachReq(app, { ...rest, prefix: mount ?? '/req' });
}
