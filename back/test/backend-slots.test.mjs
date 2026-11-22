// Contract tests for the backend-slots loader feature, v3 named slots
// (back/spec/backend-slots.md). Run: node --test back/test/backend-slots.test.mjs
// (from the feat repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFeatLoader, mountBackendFeatures } from '../features/loader/v3/js-node/loader.js';

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

const legacyFeature = (body = '') => `
export function attach(app, settings) {
  app.attached = app.attached || [];
  app.attached.push({ id: settings.mount, settings });
${body}
}`;

const fakeApp = () => {
  const calls = [];
  const app = {
    calls,
    use() {},
    get(p, h) { calls.push(['get', p, h]); },
    post(p, h) { calls.push(['post', p, h]); },
  };
  return app;
};

test('SLOT row mounts a route feature at its defaultMount; settings pass through', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature() });
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_DEMO_SLOT: 'route', FEAT_DEMO_LABEL: 'x' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['demo']);
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][0], 'get');
  assert.equal(app.calls[0][1], '/demo');
  rmSync(dir, { recursive: true, force: true });
});

test('absent/empty SLOT row → feature dormant', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature() });
  const app = fakeApp();
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO_MOUNT: '/d' }, vendoredDir: dir }), []);
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO_SLOT: '' }, vendoredDir: dir }), []);
  assert.deepEqual(app.calls, []);
  rmSync(dir, { recursive: true, force: true });
});

test('_MOUNT value overrides the path; `true` = defaultMount', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature('/canonical') });
  const app = fakeApp();
  await mountBackendFeatures(app, {
    env: { FEAT_DEMO_SLOT: 'route', FEAT_DEMO_MOUNT: '/api/demo' },
    vendoredDir: dir,
  });
  await mountBackendFeatures(app, {
    env: { FEAT_DEMO_SLOT: 'route', FEAT_DEMO_MOUNT: 'true' },
    vendoredDir: dir,
  });
  assert.equal(app.calls[0][1], '/api/demo');
  assert.equal(app.calls[1][1], '/canonical');
  rmSync(dir, { recursive: true, force: true });
});

test('relative route paths join under the mount (GET /:name)', async () => {
  const dir = featureDir({
    'demo/demo.js': `export const kind = 'route';
export const defaultMount = '/demo';
export const routes = { 'GET /': () => {}, 'POST /:name': () => {} };`,
  });
  const app = fakeApp();
  await mountBackendFeatures(app, { env: { FEAT_DEMO_SLOT: 'route' }, vendoredDir: dir });
  assert.deepEqual(app.calls.map((c) => [c[0], c[1]]), [['get', '/demo'], ['post', '/demo/:name']]);
  rmSync(dir, { recursive: true, force: true });
});

test('legacy attach() features still mount (mount + slot passed as settings)', async () => {
  const dir = featureDir({ 'demo/demo.js': legacyFeature() });
  const app = { attached: [] };
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_DEMO_SLOT: 'route', FEAT_DEMO_LABEL: 'x' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['demo']);
  assert.deepEqual(app.attached, [{ id: undefined, settings: { label: 'x', slot: 'route' } }]);
  rmSync(dir, { recursive: true, force: true });
});

test('middleware features fill a host anchor in sorted-id order', async () => {
  const dir = featureDir({
    'beta/beta.js': `export const kind='middleware';
export const middleware = (req, res, next) => { req.order.push('beta'); next(); };`,
    'alpha/alpha.js': `export const kind='middleware';
export const middleware = (req, res, next) => { req.order.push('alpha'); next(); };`,
  });
  const feat = createFeatLoader();
  const anchor = feat.slot('pre-auth');
  const app = fakeApp();
  const mounted = await feat.mount(app, {
    env: { FEAT_ALPHA_SLOT: 'pre-auth', FEAT_BETA_SLOT: 'pre-auth' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['alpha', 'beta']);
  const req = { order: [] };
  await new Promise((done) => anchor(req, {}, done));
  assert.deepEqual(req.order, ['alpha', 'beta']); // sorted-id, not env order
  rmSync(dir, { recursive: true, force: true });
});

test('middleware SLOT naming an anchor the host never placed → silent-fail', async () => {
  const dir = featureDir({
    'demo/demo.js': `export const kind='middleware';
export const middleware = () => {};`,
  });
  const feat = createFeatLoader();
  const app = fakeApp();
  const mounted = await feat.mount(app, { env: { FEAT_DEMO_SLOT: 'nope' }, vendoredDir: dir });
  assert.deepEqual(mounted, []);
  rmSync(dir, { recursive: true, force: true });
});

test('route feature with a non-route SLOT → silent-fail; bad routes key → silent-fail', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature() });
  const app = fakeApp();
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO_SLOT: 'pre-auth' }, vendoredDir: dir }), []);
  const bad = featureDir({
    'demo2/demo2.js': `export const kind='route';
export const defaultMount='/demo2';
export const routes = { 'FETCH /': () => {} };`,
  });
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO2_SLOT: 'route' }, vendoredDir: bad }), []);
  rmSync(dir, { recursive: true, force: true });
  rmSync(bad, { recursive: true, force: true });
});

test('route feature with neither _MOUNT nor defaultMount → silent-fail', async () => {
  const dir = featureDir({
    'demo/demo.js': `export const kind='route';
export const routes = { 'GET /': () => {} };`,
  });
  assert.deepEqual(await mountBackendFeatures(fakeApp(), { env: { FEAT_DEMO_SLOT: 'route' }, vendoredDir: dir }), []);
  rmSync(dir, { recursive: true, force: true });
});

// remote resolution (v2.1 semantics, re-pinned against v3)
const fakeHost = (files) => (url) => {
  const body = files[url.replace('https://feat.test', '')];
  if (body === undefined) return Promise.resolve({ ok: false, status: 404 });
  return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body });
};

test('not-vendored feature is fetched from the feat host and mounted at defaultMount', async () => {
  const dir = featureDir({}); // no feature files at all
  const fetchImpl = fakeHost({
    '/manifest.json': JSON.stringify({ features: { 'get-updates': { latest: 'v2' } } }),
    '/get-updates/v2/js-node/get-updates.js': readFileSync('back/features/get-updates/v2/js-node/get-updates.js', 'utf8'),
  });
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_GET_UPDATES_SLOT: 'route' },
    vendoredDir: dir, fetchImpl,
  });
  assert.deepEqual(mounted, ['get-updates']);
  assert.equal(app.calls[0][1], '/get-updates'); // path from the feature's defaultMount
  rmSync(dir, { recursive: true, force: true });
});

test('local vendored pin wins over the remote host', async () => {
  const dir = featureDir({ 'demo/demo.js': routeFeature('/local') });
  const fetchImpl = fakeHost({
    '/manifest.json': JSON.stringify({ features: { demo: { latest: 'v9' } } }),
    '/demo/v9/js-node/demo.js': routeFeature('/remote-must-not-win'),
  });
  const app = fakeApp();
  await mountBackendFeatures(app, {
    env: { FEAT_URL: 'https://feat.test', FEAT_DEMO_SLOT: 'route' },
    vendoredDir: dir, fetchImpl,
  });
  assert.equal(app.calls[0][1], '/local');
  rmSync(dir, { recursive: true, force: true });
});

test('req v1 (legacy attach) mounts via v3 with SLOT row', async () => {
  const dir = featureDir({
    'req/req.js': readFileSync('back/features/req/v1/js-node/req.js', 'utf8'),
  });
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_REQ_SLOT: 'route', FEAT_REQ_MOUNT: '/api/req' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['req']);
  assert.deepEqual(app.calls.map((c) => [c[0], c[1]]), [['get', '/api/req/:name'], ['post', '/api/req/:name']]);
  rmSync(dir, { recursive: true, force: true });
});

test('real get-updates v2 module mounts GET /get-updates via SLOT row (vendored copy)', async () => {
  const dir = featureDir({
    'get-updates/get-updates.js': readFileSync('back/features/get-updates/v2/js-node/get-updates.js', 'utf8'),
  });
  const app = fakeApp();
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_GET_UPDATES_SLOT: 'route' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['get-updates']);
  assert.deepEqual(app.calls.map((c) => [c[0], c[1]]), [['get', '/get-updates']]);
  rmSync(dir, { recursive: true, force: true });
});
