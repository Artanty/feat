// Contract tests for the req feature (back/spec/req.md).
// Run: node --test back/test/req.test.mjs   (from the feat repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, createReqHandler, mergeParams } from '../features/req/v1/js-node/req.js';

// ---- pure helpers -----------------------------------------------------------

test('buildRequest: missing _TARGET env → 404 unknown recipe', () => {
  assert.throws(() => buildRequest({}, 'redeploy', {}), (e) => e.status === 404 && /unknown recipe/.test(e.message));
});

test('buildRequest: defaults — method get, no headers/body, timeout 30', () => {
  const out = buildRequest({ FEAT_REQ_REDEPLOY_TARGET: 'https://x.dev/a' }, 'redeploy', {});
  assert.deepEqual(out, { url: 'https://x.dev/a', method: 'get', headers: {}, body: undefined, timeoutS: 30 });
});

test('buildRequest: kebab recipe name maps to upper-snake env prefix', () => {
  const out = buildRequest({ FEAT_REQ_PURGE_CACHE_TARGET: 'https://x.dev/purge' }, 'purge-cache', {});
  assert.equal(out.url, 'https://x.dev/purge');
});

test('buildRequest: {{param}} substitution in target/headers/body', () => {
  const env = {
    FEAT_REQ_REDEPLOY_TARGET: 'https://x.dev/{{project}}',
    FEAT_REQ_REDEPLOY_METHOD: 'post',
    FEAT_REQ_REDEPLOY_HEADERS: '{"Authorization": "Bearer {{token}}"}',
    FEAT_REQ_REDEPLOY_BODY: '{"project": "{{project}}"}',
  };
  const out = buildRequest(env, 'redeploy', { project: 'safe', token: 't0p' });
  assert.equal(out.url, 'https://x.dev/safe');
  assert.equal(out.headers.Authorization, 'Bearer t0p');
  assert.deepEqual(JSON.parse(out.body), { project: 'safe' });
  assert.equal(out.headers['content-type'], 'application/json'); // auto when body sent
});

test('buildRequest: unknown placeholder → 400 naming it', () => {
  const env = { FEAT_REQ_R_TARGET: 'https://x.dev/', FEAT_REQ_R_BODY: '{"a": "{{nope}}"}', FEAT_REQ_R_METHOD: 'post' };
  assert.throws(() => buildRequest(env, 'r', {}), (e) => e.status === 400 && /nope/.test(e.message));
});

test('buildRequest: hop-by-hop headers never sent', () => {
  const env = {
    FEAT_REQ_R_TARGET: 'https://x.dev/',
    FEAT_REQ_R_METHOD: 'post',
    FEAT_REQ_R_HEADERS: '{"Host": "evil", "Content-Length": "5", "Authorization": "Bearer ok"}',
    FEAT_REQ_R_BODY: '{}',
  };
  const out = buildRequest(env, 'r', {});
  assert.equal(out.headers.Host, undefined);
  assert.equal(out.headers['Content-Length'], undefined);
  assert.equal(out.headers.Authorization, 'Bearer ok');
});

test('buildRequest: recipe env misconfigurations → 500', () => {
  assert.throws(() => buildRequest({ FEAT_REQ_R_TARGET: 'https://x.dev/', FEAT_REQ_R_METHOD: 'head' }, 'r', {}),
    (e) => e.status === 500);
  assert.throws(() => buildRequest({ FEAT_REQ_R_TARGET: 'https://x.dev/', FEAT_REQ_R_HEADERS: 'notjson' }, 'r', {}),
    (e) => e.status === 500 && /headers/.test(e.message));
  assert.throws(() => buildRequest({ FEAT_REQ_R_TARGET: 'https://x.dev/', FEAT_REQ_R_TIMEOUT_S: 'x' }, 'r', {}),
    (e) => e.status === 500 && /timeout/.test(e.message));
  assert.throws(() => buildRequest({ FEAT_REQ_R_TARGET: 'file:///etc/passwd' }, 'r', {}),
    (e) => e.status === 500 && /http/.test(e.message));
});

test('buildRequest: string body template forwarded verbatim', () => {
  const env = { FEAT_REQ_R_TARGET: 'https://x.dev/', FEAT_REQ_R_METHOD: 'post', FEAT_REQ_R_BODY: 'raw-{{id}}' };
  const out = buildRequest(env, 'r', { id: 7 });
  assert.equal(out.body, 'raw-7');
});

test('buildRequest: ${ENV} references resolve from the recipe env first', () => {
  const env = {
    FLOW_BACK_DOMAIN: 'https://flow.dev',
    FEAT_REQ_R_TARGET: '${FLOW_BACK_DOMAIN}/retrigger',
    FEAT_REQ_R_METHOD: 'post',
    FEAT_REQ_R_HEADERS: '{"Authorization": "Bearer ${R_TOKEN}"}',
    FEAT_REQ_R_BODY: '{"project": "{{project}}"}',
    R_TOKEN: 't0p',
  };
  const out = buildRequest(env, 'r', { project: 'safe' });
  assert.equal(out.url, 'https://flow.dev/retrigger');
  assert.equal(out.headers.Authorization, 'Bearer t0p');
  assert.deepEqual(JSON.parse(out.body), { project: 'safe' });
});

test('buildRequest: ${ENV} reference to unset env → 500 misconfigured', () => {
  assert.throws(() => buildRequest({ FEAT_REQ_R_TARGET: '${NOT_SET_ANYWHERE}/x' }, 'r', {}),
    (e) => e.status === 500 && /NOT_SET_ANYWHERE/.test(e.message));
});

test('mergeParams: query wins over body', () => {
  assert.deepEqual(mergeParams({ a: 'body', b: 'body' }, { b: 'query', c: 'query' }),
    { a: 'body', b: 'query', c: 'query' });
});

// ---- handler (mocked fetch, fake req/res) -----------------------------------

const fakeRes = () => {
  const r = { statusCode: 200, headers: {}, sent: null,
    status(c) { this.statusCode = c; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    json(p) { this.sent = JSON.stringify(p); return this; },
    send(p) { this.sent = p; return this; } };
  return r;
};

const fakeUpstream = (status, body, contentType = 'application/json') => ({
  status,
  headers: { get: (k) => (k === 'content-type' ? contentType : null) },
  arrayBuffer: async () => (typeof body === 'string' ? Buffer.from(body) : body),
});

test('handler: mirrors upstream status/content-type/body + CORS', async () => {
  const calls = [];
  const handler = createReqHandler({
    env: { FEAT_REQ_REDEPLOY_TARGET: 'https://flow/retrigger', FEAT_REQ_REDEPLOY_METHOD: 'post',
      FEAT_REQ_REDEPLOY_HEADERS: '{"Authorization": "Bearer sec"}', FEAT_REQ_REDEPLOY_BODY: '{"project":"{{project}}"}' },
    fetchImpl: async (url, init) => { calls.push({ url, init }); return fakeUpstream(409, '{"error":"in progress"}'); },
  });
  const res = fakeRes();
  await handler({ params: { name: 'redeploy' }, body: { project: 'safe' }, query: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.sent.toString(), '{"error":"in progress"}');
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sec');
  assert.equal(calls[0].init.body, '{"project":"safe"}');
});

test('handler: connect failure → 502 envelope', async () => {
  const handler = createReqHandler({
    env: { FEAT_REQ_R_TARGET: 'https://down.dev/' },
    fetchImpl: async () => { throw new Error('timed out'); },
  });
  const res = fakeRes();
  await handler({ params: { name: 'r' }, body: {}, query: {} }, res);
  assert.equal(res.statusCode, 502);
  assert.ok(JSON.parse(res.sent).error.includes('timed out'));
});

test('handler: unknown recipe → 404, no fetch', async () => {
  let fetched = 0;
  const handler = createReqHandler({ env: {}, fetchImpl: async () => { fetched++; } });
  const res = fakeRes();
  await handler({ params: { name: 'nope' }, body: {}, query: {} }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(fetched, 0);
});
