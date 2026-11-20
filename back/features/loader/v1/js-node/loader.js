/**
 * backend-slots loader feature — config-driven feature mounting (js-node).
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOUNT_RE = /^FEAT_([A-Z0-9]+)_MOUNT$/;

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
    .map(([k, v]) => ({ idUpper: k.match(MOUNT_RE)[1], id: k.match(MOUNT_RE)[1].toLowerCase(), mount: v.trim() }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const mounted = [];
  for (const { id, idUpper, mount } of rows) {
    const modulePath = join(vendoredDir, id, `${id}.js`);
    try {
      const mod = await import(modulePath);
      if (typeof mod.attach !== 'function') throw new Error(`${modulePath} exports no attach(app, settings)`);
      mod.attach(app, { ...collectSettings(env, idUpper), mount });
      mounted.push(id);
    } catch (e) {
      // silent-fail per feature (spec): log + skip, host boot continues
      console.error(`[backend-slots] feature '${id}' failed to mount:`, e?.message ?? e);
    }
  }
  return mounted;
}
