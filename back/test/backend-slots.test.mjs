// Contract tests for the backend-slots loader feature (back/spec/backend-slots.md).
// Run: node --test back/test/backend-slots.test.mjs   (from the feat repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountBackendFeatures } from '../features/loader/v1/js-node/loader.js';

const fakeFeatureDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'feat-slots-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
};

const featureModule = (body) => `
export function attach(app, settings) {
  app.attached = app.attached || [];
  app.attached.push({ id: settings.mount, settings });
${body ?? ''}
}`;

test('mount row → vendored module attached with mount path + extra settings', async () => {
  const dir = fakeFeatureDir({ 'demo/demo.js': featureModule() });
  const app = { attached: [] };
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_DEMO_MOUNT: '/api/demo', FEAT_DEMO_LABEL: 'x' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['demo']);
  assert.deepEqual(app.attached, [{ id: '/api/demo', settings: { label: 'x', mount: '/api/demo' } }]);
  rmSync(dir, { recursive: true, force: true });
});

test('absent/empty mount row → feature stays dormant', async () => {
  const dir = fakeFeatureDir({ 'demo/demo.js': featureModule('throw new Error("must not run")') });
  const app = { attached: [] };
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO_MOUNT: '' }, vendoredDir: dir }), []);
  assert.deepEqual(await mountBackendFeatures(app, { env: {}, vendoredDir: dir }), []);
  assert.deepEqual(app.attached, []);
  rmSync(dir, { recursive: true, force: true });
});

test('broken feature is skipped, others still mount (silent-fail)', async () => {
  const dir = fakeFeatureDir({
    'bad/bad.js': featureModule('throw new Error("boom");'),
    'good/good.js': featureModule(),
  });
  const app = { attached: [] };
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_BAD_MOUNT: '/bad', FEAT_GOOD_MOUNT: '/good' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['good']); // bad skipped, host boot continues
  assert.ok(app.attached.some((a) => a.id === '/good')); // good mounted despite bad's partial effects
  rmSync(dir, { recursive: true, force: true });
});

test('module without attach() export is skipped', async () => {
  const dir = fakeFeatureDir({ 'demo/demo.js': 'export const x = 1;' });
  const app = { attached: [] };
  assert.deepEqual(await mountBackendFeatures(app, { env: { FEAT_DEMO_MOUNT: '/d' }, vendoredDir: dir }), []);
  rmSync(dir, { recursive: true, force: true });
});

test('mounts in stable sorted order regardless of env insertion order', async () => {
  const dir = fakeFeatureDir({ 'b/b.js': featureModule(), 'a/a.js': featureModule() });
  const app = { attached: [] };
  const mounted = await mountBackendFeatures(app, {
    env: { FEAT_B_MOUNT: '/b', FEAT_A_MOUNT: '/a' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['a', 'b']);
  rmSync(dir, { recursive: true, force: true });
});

test('req feature satisfies the standard entry (attach honors settings.mount)', async () => {
  const { attach } = await import('../features/req/v1/js-node/req.js');
  const routes = [];
  const app = { get: (p) => routes.push(p), post: (p) => routes.push(p) };
  attach(app, { mount: '/api/req' });
  assert.deepEqual(routes, ['/api/req/:name', '/api/req/:name']);
});

// v2 loader (back/spec/backend-slots.md Versions): underscore IDs → hyphenated dirs.
import { mountBackendFeatures as mountV2 } from '../features/loader/v2/js-node/loader.js';

test('v2: underscore ID mounts hyphenated dir + collects settings; single-word back-compat', async () => {
  const dir = fakeFeatureDir({
    'get-updates/get-updates.js': featureModule(),
    'demo/demo.js': featureModule(),
  });
  const app = { attached: [] };
  const mounted = await mountV2(app, {
    env: {
      FEAT_GET_UPDATES_MOUNT: '/get-updates', FEAT_GET_UPDATES_LABEL: 'x',
      FEAT_DEMO_MOUNT: '/demo',
    },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['demo', 'get-updates']); // sorted by dir id
  assert.ok(app.attached.some((a) => a.id === '/get-updates' && a.settings.label === 'x'));
  assert.ok(app.attached.some((a) => a.id === '/demo')); // v1-style id unchanged
  rmSync(dir, { recursive: true, force: true });
});

test('v2: get-updates feature satisfies the standard entry via the v2 loader', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'feat-slots-'));
  mkdirSync(join(dir, 'get-updates'), { recursive: true });
  const src = readFileSync('back/features/get-updates/v1/js-node/get-updates.js');
  writeFileSync(join(dir, 'get-updates', 'get-updates.js'), src);
  const app = { routes: [], get(p, h) { this.routes.push([p, h]); } };
  const mounted = await mountV2(app, {
    env: { FEAT_GET_UPDATES_MOUNT: '/api/get-updates' },
    vendoredDir: dir,
  });
  assert.deepEqual(mounted, ['get-updates']);
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0][0], '/api/get-updates');
  rmSync(dir, { recursive: true, force: true });
});
