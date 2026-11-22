/**
 * backend-slots loader feature — config-driven feature mounting (js-node, v2).
 *
 * v2: IDs may contain underscores — FEAT_GET_UPDATES_MOUNT mounts the feature vendored
 * as features/get-updates/get-updates.js (ID lowercased, underscores → hyphens).
 * Single-word IDs (FEAT_REQ_MOUNT → features/req/req.js) behave exactly as v1.
 * v2.1: REMOTE RESOLUTION — consumers carry no feature files. Each mounted id resolves
 * LOCAL-FIRST (vendoredDir features/<id>/<id>.js — pinned/offline installs); otherwise
 * the loader fetches it from the feat host: FEAT_URL env row (or opts.featUrl) →
 * GET <base>/manifest.json → latest version → GET <base>/<id>/<v>/js-node/<id>.js →
 * import via data: URL (nothing written to the repo).
 *
 * Contract: back/spec/backend-slots.md. Consumers VENDOR this file (+ .d.ts) once as
 * features/loader.js; feature dirs sit beside it:
 *
 *     import { mountBackendFeatures } from './features/loader.js';
 *     await mountBackendFeatures(app);
 *
 * Env rows FEAT_<ID>_MOUNT=<path> decide which vendored features/<id>/<id>.js modules are
 * attached (absent = dormant). Each feature exports attach(app, settings). Failures are
 * logged and skipped — a broken feature must never break the host boot.
 *
 * Dependency-free; settings are passed through verbatim, the loader never interprets them.
 */
import { access, constants } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOUNT_RE = /^FEAT_([A-Z0-9]+(?:_[A-Z0-9]+)*)_MOUNT$/;

/** GET_UPDATES → get-updates (vendored dir/file name); single-word IDs unchanged. */
const dirId = (idUpper) => idUpper.toLowerCase().replace(/_/g, '-');

const toDataUrl = (src) => `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;

/**
 * Resolve a feature's module URL: local vendored file first, else the feat host
 * (manifest latest → js-node main file <id>.js), imported via data: URL.
 * Throws on any miss — the caller's silent-fail handles it.
 */
async function resolveModule(id, { env, vendoredDir, fetchImpl, featUrl }) {
  const local = join(vendoredDir, id, `${id}.js`);
  try {
    await access(local, constants.R_OK);
    return local;
  } catch {
    // not vendored — remote resolution
  }
  const base = (featUrl ?? env.FEAT_URL ?? '').replace(/\/+$/, '');
  if (base === '') throw new Error(`no vendored features/${id}/${id}.js and FEAT_URL is unset`);
  const doFetch = fetchImpl ?? ((url) => fetch(url));

  const manifestRes = await doFetch(`${base}/manifest.json`);
  if (!manifestRes.ok) throw new Error(`manifest fetch: HTTP ${manifestRes.status}`);
  const latest = (await manifestRes.json())?.features?.[id]?.latest;
  if (!latest) throw new Error(`feat host has no feature '${id}'`);

  const res = await doFetch(`${base}/${id}/${latest}/js-node/${id}.js`);
  if (!res.ok) throw new Error(`fetch ${id}/${latest}: HTTP ${res.status}`);
  return toDataUrl(await res.text());
}

function collectSettings(env, idUpper) {
  const settings = {};
  const prefix = `FEAT_${idUpper}_`;
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith(prefix) || MOUNT_RE.test(k)) continue;
    const key = k.slice(prefix.length).toLowerCase();
    settings[key] = v;
  }
  return settings;
}

/**
 * Mount vendored backend features per config. opts.env overrides process.env (tests);
 * opts.vendoredDir overrides the feature-dir root (tests).
 * Returns the mounted feature ids in mount order.
 */
export async function mountBackendFeatures(app, opts = {}) {
  const env = opts.env ?? process.env;
  const vendoredDir = opts.vendoredDir
    ?? dirname(fileURLToPath(import.meta.url)); // consumers vendor loader into features/

  const rows = Object.entries(env)
    .filter(([k, v]) => MOUNT_RE.test(k) && typeof v === 'string' && v.trim() !== '')
    .map(([k, v]) => ({ idUpper: k.match(MOUNT_RE)[1], id: dirId(k.match(MOUNT_RE)[1]), mount: v.trim() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const mounted = [];
  for (const { id, idUpper, mount } of rows) {
    try {
      const modulePath = await resolveModule(id, { env, vendoredDir, fetchImpl: opts.fetchImpl, featUrl: opts.featUrl });
      const mod = await import(modulePath);
      if (typeof mod.attach !== 'function') throw new Error(`feature '${id}' exports no attach(app, settings)`);
      mod.attach(app, { ...collectSettings(env, idUpper), mount });
      mounted.push(id);
    } catch (e) {
      // silent-fail per feature (spec): log + skip, host boot continues
      console.error(`[backend-slots] feature '${id}' failed to mount:`, e?.message ?? e);
    }
  }
  return mounted;
}
