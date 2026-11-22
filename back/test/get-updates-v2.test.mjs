// Contract tests for the get-updates feature (back/spec/get-updates.md).
// Run: node --test back/test/get-updates.test.mjs   (from the feat repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collectInfo, createGetUpdatesHandler, defaultMount, envPresence, kind, mountedFeatures, readPackages, routes,
} from '../features/get-updates/v2/js-node/get-updates.js';

const fixtureDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'feat-get-updates-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
};

const expressPkg = JSON.stringify({
  name: 'consumer', version: '1.4.0',
  dependencies: { express: '^4.21.2', prisma: '^6.0.0' },
  devDependencies: { typescript: '^5.6.0' },
});

test('empty env + no package.json → null identity, unknown framework, {} packages, stable shape', () => {
  const dir = fixtureDir({});
  const info = collectInfo({ env: {}, cwd: dir });
  assert.deepEqual(info, {
    version: null, framework: 'unknown', commit_id: null, commit_message: null,
    project_id: null, slave_repo: null, namespace: null,
    packages: {}, features: [], envs: {},
  });
  assert.deepEqual(Object.keys(info), [
    'version', 'framework', 'commit_id', 'commit_message', 'project_id', 'slave_repo',
    'namespace', 'packages', 'features', 'envs',
  ]);
  rmSync(dir, { recursive: true, force: true });
});

test('deploy identity from env rows; TAG_VERSION wins over package.json version', () => {
  const dir = fixtureDir({ 'package.json': expressPkg });
  const info = collectInfo({
    env: {
      TAG_VERSION: 'v1.2.3', COMMIT_ID: 'abc1234', COMMIT: 'fix: thing -d;',
      PROJECT_ID: '123', SLAVE_REPO: 'user/safe', NAMESPACE: 'prod',
    },
    cwd: dir,
  });
  assert.equal(info.version, 'v1.2.3');
  assert.equal(info.commit_id, 'abc1234');
  assert.equal(info.commit_message, 'fix: thing -d;');
  assert.equal(info.project_id, '123');
  assert.equal(info.slave_repo, 'user/safe');
  assert.equal(info.namespace, 'prod');
  rmSync(dir, { recursive: true, force: true });
});

test('version falls back to package.json version when TAG_VERSION unset', () => {
  const dir = fixtureDir({ 'package.json': expressPkg });
  assert.equal(collectInfo({ env: { TAG_VERSION: '' }, cwd: dir }).version, '1.4.0'); // empty = unset
  rmSync(dir, { recursive: true, force: true });
});

test('packages = dependencies + devDependencies verbatim; bad JSON → {}', () => {
  const dir = fixtureDir({ 'package.json': expressPkg });
  assert.deepEqual(collectInfo({ env: {}, cwd: dir }).packages, {
    express: '^4.21.2', prisma: '^6.0.0', typescript: '^5.6.0',
  });
  const bad = fixtureDir({ 'package.json': '{oops' });
  assert.deepEqual(readPackages(bad), {});
  rmSync(dir, { recursive: true, force: true });
  rmSync(bad, { recursive: true, force: true });
});

test('framework detection: nest > express > fastify > koa > hapi priority', () => {
  const mk = (deps) => fixtureDir({ 'package.json': JSON.stringify({ dependencies: deps }) });
  const nest = mk({ '@nestjs/core': '^10.0.0', express: '^4.21.2' });
  assert.equal(collectInfo({ env: {}, cwd: nest }).framework, 'nest@^10.0.0');
  const fastify = mk({ express: '^4.21.2', fastify: '^4.28.0' });
  assert.equal(collectInfo({ env: {}, cwd: fastify }).framework, 'express@^4.21.2');
  rmSync(nest, { recursive: true, force: true });
  rmSync(fastify, { recursive: true, force: true });
});

test('features: FEAT_*_SLOT rows → sorted lowercase ids; empty rows dormant', () => {
  assert.deepEqual(mountedFeatures({
    FEAT_REQ_SLOT: 'route', FEAT_GET_UPDATES_SLOT: 'route',
    FEAT_THRU_SLOT: '', FEAT_REQ_LABEL: 'x',
  }), ['get-updates', 'req']);
  assert.deepEqual(mountedFeatures({ FEAT_REQ_LABEL: 'no-slot-row' }), []);
});

test('FEAT_GET_UPDATES_FEATURES overrides the derived features list verbatim', () => {
  const dir = fixtureDir({});
  const info = collectInfo({ env: { FEAT_GET_UPDATES_FEATURES: ' req , thru ,' }, cwd: dir });
  assert.deepEqual(info.features, ['req', 'thru']);
  rmSync(dir, { recursive: true, force: true });
});

test('envs presence map: set keys true, values NEVER reported', () => {
  const env = { TAG_VERSION: 'v9', EMPTY: '', SECRET_TOKEN: 'hunter2', UNDEF: undefined };
  assert.deepEqual(envPresence(env), { TAG_VERSION: true, SECRET_TOKEN: true });
  const dir = fixtureDir({});
  assert.equal(JSON.stringify(collectInfo({ env, cwd: dir })).includes('hunter2'), false);
  rmSync(dir, { recursive: true, force: true });
});

test('handler: 200 + CORS * + JSON body', () => {
  const dir = fixtureDir({ 'package.json': expressPkg });
  const handler = createGetUpdatesHandler({ env: { TAG_VERSION: 'v1' }, cwd: dir });
  const res = {
    statusCode: undefined, headers: {}, body: undefined,
    status(c) { this.statusCode = c; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    json(o) { this.body = o; return this; },
  };
  handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.body.version, 'v1');
  assert.equal(res.body.framework, 'express@^4.21.2');
  rmSync(dir, { recursive: true, force: true });
});

test('v3 module entry: kind route, defaultMount, routes map with GET / handler', () => {
  assert.equal(kind, 'route');
  assert.equal(defaultMount, '/get-updates');
  assert.deepEqual(Object.keys(routes), ['GET /']);
  assert.equal(typeof routes['GET /'], 'function');
});
