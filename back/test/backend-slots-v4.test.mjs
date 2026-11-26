// Contract tests for the backend-slots loader v4 (back/spec/backend-slots.md):
// v3 named-slot contract + _VERSION pins + catalog required-env validation.
// Run: node --test back/test/backend-slots-v4.test.mjs   (from the feat repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeatLoader, mountBackendFeatures } from '../features/loader/v4/js-node/loader.js';

const featureDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'feat-slots-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
};

const routeFeature = (mount = '/demo') => `
export const kind = 'route';
export const defaultMount = '${mount}';
export const routes = { 'GET /': (req, res) => res.json({ ok: true }) };
`;

const fakeApp = () => {
  const calls = [];
  return {
    calls,
    use() {},
    get(p, h) { calls.push(['get', p, h]); },
    post(p, h) { calls.push(['post', p, h]); },
  };
};

// fake feat host: catalog + manifest + versioned js-node bundles
const fakeHost = (files) => (url) => {
  const body = files[url.replace('https://feat.test', '')];
  if (body === undefined) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body });
};

const hostWith = (extra = {}) => fakeHost({
  '/catalog.json': JSON.stringify({
    features: {
      demo: { latest: 'v2', versions: {
        v1: { kind: 'route', defaultMount: '/demo', envs: [{ name: 'DEMO_KEY', required: true }] },
        v2: { kind: 'route', defaultMount: '/demo', envs: [] },
      } },
    },
  }),
  '/manifest.json': JSON.stringify({ features: { demo: { latest: 'v2' } } }),
  '/demo/v1/js-node/demo.js': routeFeature('/demo-v1'),
  '/demo/v2/js-node/demo.js': routeFeature('/demo-v2'),
  ...extra,
});

// --- v3 contract re-pinned against v4 ---

test('SLOT row mounts a route feature at its defaultMount (remote, catalog latest)', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route' },
    vendoredDir: dir, fetchImpl: hostWith(),
  });
  assert.deepEqual(mounted, ['demo']);
  assert.equal(app.calls[0][1], '/demo-v2'); // latest per catalog
  rmSync(dir, { recursive: true, force: true });
});

test('absent/empty SLOT row → dormant', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  assert.deepEqual(await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_VERSION: 'v1' },
    vendoredDir: dir, fetchImpl: hostWith(),
  }), []);
  rmSync(dir, { recursive: true, force: true });
});

test('local vendored pin wins over the remote host (mounted without FEAT_URL)', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature('/local') });
  const app = fakeApp();
  await mountBackendFeatures(app, { env: { FEAT_DEMO_SLOT: 'route' }, vendoredDir: dir });
  assert.equal(app.calls[0][1], '/local');
  rmSync(dir, { recursive: true, force: true });
});

test('legacy attach() features still mount; middleware anchors still fill', async () => {
  const dir = featureDir({
    'legacy/legacy.js': `export function attach(app, s) { app.attached = s; }`,
    'mid/mid.js': `export const kind='middleware';
export const middleware = (req, res, next) => { req.order = ['mid']; next(); };`,
  });
  const app = fakeApp();
  const feat = createFeatLoader();
  const anchor = feat.slot('pre-auth');
  const mounted = await feat.mount(app, {
    env: { FEAT_LEGACY_SLOT: 'route', FEAT_MID_SLOT: 'pre-auth' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['legacy', 'mid']);
  assert.equal(app.attached.slot, 'route');
  const req = {};
  await new Promise((done) => anchor(req, {}, done));
  assert.deepEqual(req.order, ['mid']);
  rmSync(dir, { recursive: true, force: true });
});

// --- v4: version pins ---

test('_VERSION=v1 pins the fetched module to v1 (not catalog latest)', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route', FEAT_DEMO_VERSION: 'v1', DEMO_KEY: 'x' },
    vendoredDir: dir, fetchImpl: hostWith(),
  });
  assert.equal(app.calls[0][1], '/demo-v1');
  rmSync(dir, { recursive: true, force: true });
});

test('_VERSION=unknown → silent-fail skip naming the version', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route', FEAT_DEMO_VERSION: 'v99' },
    vendoredDir: dir, fetchImpl: hostWith(),
  });
  assert.deepEqual(mounted, []);
  assert.deepEqual(app.calls, []);
  rmSync(dir, { recursive: true, force: true });
});

// --- v4: required-env validation ---

test('catalog required env missing → skip with error naming the row', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route', FEAT_DEMO_VERSION: 'v1' }, // no DEMO_KEY
    vendoredDir: dir, fetchImpl: hostWith(),
  });
  assert.deepEqual(mounted, []);
  const dir2 = featureDir({});
  const app2 = fakeApp();
  const ok = await mountBackendFeatures(app2, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route', FEAT_DEMO_VERSION: 'v1', DEMO_KEY: 'x' },
    vendoredDir: dir2, fetchImpl: hostWith(),
  });
  assert.deepEqual(ok, ['demo']); // same version mounts once the row is set
  assert.equal(app2.calls[0][1], '/demo-v1');
  rmSync(dir, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
});

test('catalog unreachable → mount proceeds unvalidated (manifest fallback for latest)', async () => {
  const dir = featureDir({});
  const app = fakeApp();
  const fetchImpl = fakeHost({
    '/manifest.json': JSON.stringify({ features: { demo: { latest: 'v2' } } }),
    '/demo/v2/js-node/demo.js': routeFeature('/demo-v2'),
  });
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route' }, // would fail validation if catalog existed
    vendoredDir: dir, fetchImpl,
  });
  assert.deepEqual(mounted, ['demo']); // no catalog → no validation → fetched latest via manifest
  assert.equal(app.calls[0][1], '/demo-v2');
  rmSync(dir, { recursive: true, force: true });
});

test('one catalog fetch is shared across features of the same mount', async () => {
  const dir = featureDir({});
  let catalogHits = 0;
  const fetchImpl = (url) => {
    if (url.endsWith('/catalog.json')) catalogHits++;
    return hostWith()(url);
  };
  const fetchImplTwoFeatures = fakeHost({
    '/catalog.json': JSON.stringify({
      features: {
        demo: { latest: 'v2', versions: { v2: { kind: 'route', defaultMount: '/demo', envs: [] } } },
        demo2: { latest: 'v1', versions: { v1: { kind: 'route', defaultMount: '/demo2', envs: [] } } },
      },
    }),
  });
  const fetchCounting = (url) => {
    if (url.endsWith('/catalog.json')) catalogHits++;
    return fetchImplTwoFeatures(url);
  };
  await mountBackendFeatures(fakeApp(), {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route', FEAT_DEMO2_SLOT: 'route' },
    vendoredDir: dir, fetchImpl: fetchCounting,
  });
  assert.equal(catalogHits, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('namespace: loader identity js-node by default; opts.namespace overrides (tests)', async () => {
  const dir = featureDir({});
  const seen = [];
  const fetchImpl = (url) => {
    seen.push(url);
    return hostWith({
      '/demo/v2/py/demo.js': routeFeature('/demo-py'),
    })(url);
  };
  const app = fakeApp();
  await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route' },
    vendoredDir: dir, fetchImpl, namespace: 'py',
  });
  assert.ok(seen.includes('https://feat.test/demo/v2/py/demo.js'), 'py bundle requested');
  assert.equal(app.calls[0][1], '/demo-py');
  rmSync(dir, { recursive: true, force: true });
});

test('real get-updates v2 mounts through v4 from the real catalog data shape', async () => {
  const dir = featureDir({});
  const src = readFileSync('back/features/get-updates/v2/js-node/get-updates.js', 'utf8');
  const featJson = JSON.parse(readFileSync('back/features/get-updates/v2/feat.json', 'utf8'));
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_GET_UPDATES_SLOT: 'route', FEAT_GET_UPDATES_VERSION: 'v2' },
    vendoredDir: dir,
    fetchImpl: fakeHost({
      '/catalog.json': JSON.stringify({ features: { 'get-updates': { latest: 'v2', versions: { v2: featJson } } } }),
      '/get-updates/v2/js-node/get-updates.js': src,
    }),
  });
  assert.deepEqual(mounted, ['get-updates']);
  assert.equal(app.calls[0][1], '/get-updates'); // defaultMount from the module
  rmSync(dir, { recursive: true, force: true });
});
