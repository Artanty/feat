/**
 * get-updates feature — /get-updates runtime info endpoint (js-node).
 *
 * Contract: back/spec/get-updates.md. Consumers VENDOR this file (+ get-updates.d.ts):
 *
 *     import { attach } from './features/get-updates/get-updates.js';
 *     attach(app);                        // or via mountBackendFeatures + FEAT_GET_UPDATES_MOUNT
 *
 * GET <mount> reports deploy identity (env rows: TAG_VERSION/COMMIT_ID/COMMIT/
 * PROJECT_ID/SLAVE_REPO/NAMESPACE), framework + package versions (consumer's
 * package.json), mounted feat features (FEAT_*_MOUNT rows) and which envs are set
 * (presence map — VALUES are never reported, secret-safe).
 *
 * No dependencies: get-updates.js is pure logic + a (req, res) handler; the consumer's
 * Express app provides routing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOUNT_RE = /^FEAT_([A-Z0-9]+(?:_[A-Z0-9]+)*)_MOUNT$/;
const FRAMEWORK_PRIORITY = [
  ['@nestjs/core', 'nest'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['koa', 'koa'],
  ['hapi', 'hapi'],
];

function readEnv(env, name) {
  const raw = (env[name] ?? '').trim();
  return raw === '' ? undefined : raw;
}

/** Presence map { KEY: true } for every set env var — values never leave the process. */
export function envPresence(env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = true;
  }
  return out;
}

/** Mounted feat feature ids from FEAT_<ID>_MOUNT rows (the loader's discovery rule:
 * ID lowercased, underscores → hyphens — GET_UPDATES mounts features/get-updates/). */
export function mountedFeatures(env) {
  const ids = [];
  for (const [key, value] of Object.entries(env)) {
    const m = MOUNT_RE.exec(key);
    if (m && typeof value === 'string' && value.trim() !== '') {
      ids.push(m[1].toLowerCase().replace(/_/g, '-'));
    }
  }
  return [...new Set(ids)].sort();
}

/** Parsed <cwd>/package.json, or null on any fault. */
function readPackageJson(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** dependencies + devDependencies of <cwd>/package.json; {} on any fault. */
export function readPackages(cwd) {
  const pkg = readPackageJson(cwd);
  if (!pkg) return {};
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

function detectFramework(packages) {
  for (const [dep, name] of FRAMEWORK_PRIORITY) {
    if (packages[dep] !== undefined) return `${name}@${packages[dep]}`;
  }
  return 'unknown';
}

/** Build the response object. Pure read — never throws. */
export function collectInfo(opts = {}) {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();

  const pkg = readPackageJson(cwd);
  const packages = pkg ? { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } : {};
  let version = readEnv(env, 'TAG_VERSION');
  if (version === undefined && typeof pkg?.version === 'string' && pkg.version.trim() !== '') {
    version = pkg.version;
  }

  const featuresEnv = readEnv(env, 'FEAT_GET_UPDATES_FEATURES');
  const features = featuresEnv !== undefined
    ? featuresEnv.split(',').map((s) => s.trim()).filter((s) => s !== '')
    : mountedFeatures(env);

  return {
    version: version ?? null,
    framework: detectFramework(packages),
    commit_id: readEnv(env, 'COMMIT_ID') ?? null,
    commit_message: readEnv(env, 'COMMIT') ?? null,
    project_id: readEnv(env, 'PROJECT_ID') ?? null,
    slave_repo: readEnv(env, 'SLAVE_REPO') ?? null,
    namespace: readEnv(env, 'NAMESPACE') ?? null,
    packages,
    features,
    envs: envPresence(env),
  };
}

/** Core (req, res) handler — Express-shaped but dependency-free. Always 200. */
export function createGetUpdatesHandler(opts = {}) {
  const collect = () => collectInfo(opts);
  return (req, res) => {
    res.status(200);
    res.set('access-control-allow-origin', '*');
    res.json(collect());
  };
}

/** Register GET <prefix> on the consumer's Express app. */
export function attachGetUpdates(app, opts = {}) {
  const handler = createGetUpdatesHandler(opts);
  app.get(opts.prefix ?? '/get-updates', handler);
  return handler;
}

/** Standard backend-feature entry (back/spec/backend-slots.md): mount path from settings. */
export function attach(app, settings = {}) {
  const { mount, ...rest } = settings;
  return attachGetUpdates(app, { ...rest, prefix: mount ?? '/get-updates' });
}
