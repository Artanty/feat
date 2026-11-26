/**
 * backend-slots loader feature — named-slot feature mounting (js-node, v4).
 *
 * Contract: back/spec/backend-slots.md. WHO fills a slot is CONFIG (env); WHERE the
 * slot sits is HOST CODE; a feature declares its kind + defaults.
 *
 * Config rows (the SLOT row is the toggle — absent/empty = feature dormant):
 *
 *     FEAT_<ID>_SLOT=<slotName>     # required: which slot fills with <id>
 *     FEAT_<ID>_VERSION=vN|latest   # optional (v4): version pin; default latest
 *     FEAT_<ID>_MOUNT=<path|true>   # route slot, optional: path override; true =
 *                                    #   the feature's own defaultMount (canonical)
 *     FEAT_<ID>_<SETTING>           # feature settings, passed through verbatim
 *     FEAT_URL=<feat host>          # remote resolution for not-vendored features
 *
 * Feature module entries (a module exports ONE of these):
 *   kind='route'      + defaultMount + routes {'GET /': (req,res)=>…}  (rel-paths)
 *   kind='middleware' + middleware (req, res, next)
 *   legacy: attach(app, settings) — pre-v3 features (req v1)
 *
 * Host API:
 *     await mountBackendFeatures(app);          // simple hosts: fills route slot only
 *     const feat = createFeatLoader();          // hosts with middleware positions:
 *     app.use(feat.slot('pre-auth'));           // anchor placed by the HOST in its chain
 *     await feat.mount(app);                    // SLOT rows fill anchors + routes
 *
 * v4 — version pins + env validation, both from the feat host's /catalog.json (the
 * env-requirements source of truth, authored as feat.json beside each version):
 *   - FEAT_<ID>_VERSION pins the fetched module to that version (default latest);
 *   - before mounting, every env the feature's catalog entry marks required must be
 *     present and non-empty in the process env, else the feature is skipped with an
 *     error naming the missing rows. Catalog unreachable → mount proceeds unvalidated
 *     (warning logged — the module fetch needs the same host anyway).
 *
 * PLATFORM RULE: the namespace segment (js-node) is part of THIS loader's identity —
 * it always requests js-node bundles; a py consumer vendors a py loader. Never serf or
 * env knowledge (opts.namespace exists for tests only).
 *
 * Module resolution is LOCAL-FIRST (vendoredDir features/<id>/<id>.js — a deliberate
 * version pin); otherwise the module is fetched from the feat host and imported via a
 * data: URL — nothing is written to the repo. Failures are logged and skipped per
 * feature — a broken feature (or an unreachable feat host) never breaks the host boot.
 * Dependency-free ESM.
 */
import { access, constants } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SLOT_RE = /^FEAT_([A-Z0-9]+(?:_[A-Z0-9]+)*)_SLOT$/;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']);
const NAMESPACE = 'js-node'; // this loader's platform identity (see header)

/** GET_UPDATES → get-updates (vendored dir/file name); single-word IDs unchanged. */
const dirId = (idUpper) => idUpper.toLowerCase().replace(/_/g, '-');

const toDataUrl = (src) => `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;

function readRow(env, name) {
  const raw = (env[name] ?? '').trim();
  return raw === '' ? undefined : raw;
}

/** Mounted feature rows: {id, idUpper, slot, mount, version} in stable sorted order. */
function slotRows(env) {
  return Object.entries(env)
    .filter(([k, v]) => SLOT_RE.test(k) && typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => {
      const idUpper = k.match(SLOT_RE)[1];
      return {
        idUpper,
        id: dirId(idUpper),
        slot: v.trim().toLowerCase(),
        mount: readRow(env, `FEAT_${idUpper}_MOUNT`),
        version: readRow(env, `FEAT_${idUpper}_VERSION`),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function collectSettings(env, row) {
  const settings = {};
  const prefix = `FEAT_${row.idUpper}_`;
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith(prefix) || SLOT_RE.test(k)
      || k === `FEAT_${row.idUpper}_MOUNT` || k === `FEAT_${row.idUpper}_VERSION`) continue;
    settings[k.slice(prefix.length).toLowerCase()] = v;
  }
  return settings;
}

/** Route path: explicit override, `true` → feature defaultMount, else defaultMount. */
function routePath(row, mod) {
  if (row.mount !== undefined && row.mount.toLowerCase() !== 'true') return row.mount;
  if (typeof mod.defaultMount === 'string' && mod.defaultMount.trim() !== '') return mod.defaultMount;
  throw new Error(`no _MOUNT override and the feature declares no defaultMount`);
}

/** `GET /:name` at mount `/req` → app.get('/req/:name'). */
function registerRoutes(app, prefix, routes, id) {
  for (const [key, handler] of Object.entries(routes)) {
    const m = /^([A-Z]+)\s+(\/.*)$/.exec(key);
    if (!m || !HTTP_METHODS.has(m[1].toLowerCase()) || typeof handler !== 'function') {
      throw new Error(`bad routes key ${JSON.stringify(key)} (expected "<METHOD> <relative-path>")`);
    }
    const path = m[2] === '/' ? prefix : `${prefix.replace(/\/+$/, '')}${m[2]}`;
    app[m[1].toLowerCase()](path, handler);
  }
  if (Object.keys(routes).length === 0) throw new Error('routes map is empty');
}

/**
 * One shared /catalog.json fetch per mount (memoized promise). Returns
 * {catalog|null}: null = host unreachable/invalid — callers proceed unvalidated.
 */
function fetchCatalog(base, doFetch) {
  return doFetch(`${base}/catalog.json`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!body?.features || typeof body.features !== 'object') throw new Error('bad catalog shape');
      return body;
    })
    .catch(() => null);
}

/** Required-env rows of a feature version per the catalog; [] when unknown. */
function requiredEnvs(catalog, id, version) {
  const entry = catalog?.features?.[id]?.versions?.[version];
  if (!entry) return [];
  return (Array.isArray(entry.envs) ? entry.envs : [])
    .filter((e) => e && e.required === true && typeof e.name === 'string')
    .map((e) => e.name);
}

/**
 * Resolve a feature's module: local vendored file first, else the feat host
 * (catalog-pinned version → js-node main file <id>.js), imported via data: URL.
 * Also validates required envs against the process env when catalog data is at hand.
 */
async function resolveModule(row, { env, vendoredDir, fetchImpl, featUrl, namespace, getCatalog }) {
  // required-env validation (catalog is the source of truth; skip silently when the
  // host is unreachable — the module fetch below needs the same host anyway)
  const base = (featUrl ?? env.FEAT_URL ?? '').replace(/\/+$/, '');
  const doFetch = fetchImpl ?? ((url) => fetch(url));
  let catalog = null;
  let pinned = row.version ?? 'latest';

  if (base !== '') {
    catalog = await getCatalog(base, doFetch);
    if (catalog) {
      const feature = catalog.features[row.id];
      if (!feature) throw new Error(`feat host has no feature '${row.id}'`);
      if (pinned === 'latest') pinned = feature.latest;
      if (!feature.versions?.[pinned]) throw new Error(`unknown version '${pinned}' for '${row.id}'`);
      const missing = requiredEnvs(catalog, row.id, pinned)
        .filter((name) => readRow(env, name) === undefined);
      if (missing.length > 0) {
        throw new Error(`required env rows not set: ${missing.join(', ')}`);
      }
    } else if (pinned === 'latest') {
      console.warn('[backend-slots] catalog unreachable — skipping env validation and version resolution');
    }
  }

  const local = join(vendoredDir, row.id, `${row.id}.js`);
  try {
    await access(local, constants.R_OK);
    return local;
  } catch {
    // not vendored — remote resolution (needs the base even though validation did not)
  }
  if (base === '') throw new Error(`no vendored features/${row.id}/${row.id}.js and FEAT_URL is unset`);
  if (pinned === 'latest') {
    // no catalog data — fall back to the manifest for latest (v3 behavior)
    const manifestRes = await doFetch(`${base}/manifest.json`);
    if (!manifestRes.ok) throw new Error(`manifest fetch: HTTP ${manifestRes.status}`);
    pinned = (await manifestRes.json())?.features?.[row.id]?.latest;
    if (!pinned) throw new Error(`feat host has no feature '${row.id}'`);
  }

  const res = await doFetch(`${base}/${row.id}/${pinned}/${namespace}/${row.id}.js`);
  if (!res.ok) throw new Error(`fetch ${row.id}/${pinned}: HTTP ${res.status}`);
  return toDataUrl(await res.text());
}

/** Create a loader with middleware anchors. Simple hosts use mountBackendFeatures. */
export function createFeatLoader(opts = {}) {
  const anchors = new Map(); // slotName → [fns] (filled at mount, read at request)
  const placed = new Set();

  const self = {
    /** Anchor middleware the HOST places in its chain; SLOT rows fill it at mount. */
    slot(name) {
      const slotName = String(name).toLowerCase();
      placed.add(slotName);
      if (!anchors.has(slotName)) anchors.set(slotName, []);
      const chain = anchors.get(slotName);
      return (req, res, next) => {
        if (chain.length === 0) return next();
        let i = 0;
        const run = (err) => {
          if (err) return next(err);
          if (i >= chain.length) return next();
          chain[i++](req, res, run);
        };
        run();
      };
    },

    /** Resolve + register every SLOT-configured feature. Returns mounted ids. */
    async mount(app, mountOpts = {}) {
      const env = mountOpts.env ?? opts.env ?? process.env;
      const vendoredDir = mountOpts.vendoredDir ?? opts.vendoredDir
        ?? dirname(fileURLToPath(import.meta.url));
      const namespace = mountOpts.namespace ?? opts.namespace ?? NAMESPACE;
      const catalogPromises = new Map(); // base → promise (one catalog fetch per mount)
      const getCatalog = (base, doFetch) => {
        if (!catalogPromises.has(base)) catalogPromises.set(base, fetchCatalog(base, doFetch));
        return catalogPromises.get(base);
      };

      const rows = slotRows(env);
      const mounted = [];

      for (const row of rows) {
        try {
          const modulePath = await resolveModule(row, {
            env,
            vendoredDir,
            fetchImpl: mountOpts.fetchImpl ?? opts.fetchImpl,
            featUrl: mountOpts.featUrl ?? opts.featUrl,
            namespace,
            getCatalog,
          });
          const mod = await import(modulePath);
          const settings = collectSettings(env, row);

          if (typeof mod.attach === 'function') {
            // legacy entry (pre-v3): the feature registers itself
            const legacySettings = { ...settings, slot: row.slot };
            if (row.mount !== undefined) legacySettings.mount = row.mount;
            mod.attach(app, legacySettings);
          } else if (mod.kind === 'route') {
            if (row.slot !== 'route') throw new Error(`kind 'route' but SLOT=${row.slot}`);
            registerRoutes(app, routePath(row, mod), mod.routes ?? {}, row.id);
          } else if (mod.kind === 'middleware') {
            if (typeof mod.middleware !== 'function') throw new Error("kind 'middleware' exports no middleware(req,res,next)");
            if (!placed.has(row.slot)) throw new Error(`middleware SLOT=${row.slot} but the host placed no such anchor (feat.slot('${row.slot}'))`);
            anchors.get(row.slot).push(mod.middleware);
          } else {
            throw new Error('exports none of: attach() | kind route (routes) | kind middleware (middleware)');
          }
          mounted.push(row.id);
        } catch (e) {
          // silent-fail per feature (spec): log + skip, host boot continues
          console.error(`[backend-slots] feature '${row.id}' failed to mount:`, e?.message ?? e);
        }
      }
      return mounted;
    },
  };
  return self;
}

/** Simple hosts: mount route-slot + legacy features in one call (no anchors needed). */
export async function mountBackendFeatures(app, opts = {}) {
  return createFeatLoader(opts).mount(app, opts);
}
