// wake-up v2 js-ext contract tests — pin the vendored-by-MV3-consumers bundle.
// Same style as http-gate.test.mjs: eval the SHIPPED features/ copy; node has fetch
// (mocked per-test) and globalThis, so the module attaches featWakeUp.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(
  new URL('../features/wake-up/v2/js-ext/index.js', import.meta.url),
  'utf8',
);
(0, eval)(bundle);
const { wakeServer } = globalThis.featWakeUp;

const SNAP = 'https://sub-1.containers.snapdeploy.app';
const RENDer = 'https://evidence-qulg.onrender.com';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// fetch mock: wakeApi records snapdeploy wake POSTs; health answers per script
let wakeApi, healthScript, fetchLog;
function mockFetch() {
  wakeApi = [];
  fetchLog = [];
  let i = 0;
  healthScript = [];
  globalThis.fetch = (url, init) => {
    fetchLog.push({ url: String(url), method: init && init.method });
    if (String(url).startsWith('https://snapdeploy.dev/api/public/wake/')) {
      wakeApi.push(String(url));
      return Promise.resolve({ ok: true, status: 200 });
    }
    const step = healthScript[Math.min(i, healthScript.length - 1)];
    i += 1;
    if (step === 'NET') return Promise.reject(new TypeError('network'));
    return Promise.resolve({ ok: step === 200, status: step });
  };
}

beforeEach(mockFetch);

test('snapdeploy target: wake POST fires, then HEAD /healthz until awake', async () => {
  healthScript = [503, 503, 200];
  const states = [];
  const res = await wakeServer(SNAP, { interval: 1, timeout: 5000, onState: (s, d) => states.push(s) });
  assert.equal(res.awake, true);
  assert.equal(res.attempts, 3);
  assert.equal(res.strategy, 'snapdeploy');
  assert.deepEqual(states, ['waking', 'awake']);
  assert.equal(wakeApi.length, 1);
  assert.equal(wakeApi[0], 'https://snapdeploy.dev/api/public/wake/sub-1');
  const heads = fetchLog.filter((c) => c.method === 'HEAD');
  assert.equal(heads.length, 3);
  assert.equal(heads[0].url, SNAP + '/healthz');
});

test('non-snapdeploy target: no wake POST, plain polling only', async () => {
  healthScript = [200];
  const res = await wakeServer(RENDer, { interval: 1, timeout: 5000 });
  assert.equal(res.awake, true);
  assert.equal(wakeApi.length, 0);
});

test('network errors while asleep keep polling until the budget ends, then timeout', async () => {
  healthScript = ['NET'];
  const states = [];
  await assert.rejects(
    wakeServer(SNAP, { interval: 1, timeout: 20, onState: (s) => states.push(s) }),
    /timeout/,
  );
  assert.ok(states.indexOf('timeout') !== -1);
  assert.equal(wakeApi.length, 1); // ping still fired (swallowed)
});

test('single-flight: concurrent calls for the same target join one wake', async () => {
  healthScript = [503, 200];
  const a = wakeServer(SNAP, { interval: 1, timeout: 5000 });
  const b = wakeServer(SNAP, { interval: 1, timeout: 5000 });
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.awake, true);
  assert.equal(rb.awake, true);
  assert.equal(wakeApi.length, 1);
  const heads = fetchLog.filter((c) => c.method === 'HEAD');
  assert.equal(heads.length, 2); // ONE poll loop, not two
});

test('different target while a wake runs: rejects immediately', async () => {
  healthScript = [503]; // stays asleep until we append a good status below
  const a = wakeServer(SNAP, { interval: 5, timeout: 5000 });
  await assert.rejects(wakeServer('https://other.containers.snapdeploy.app', {}), /another target/);
  healthScript.push(200);
  assert.equal((await a).awake, true);
});

test('validation: no target / bad mode / noy without proxy reject before any fetch', async () => {
  await assert.rejects(wakeServer('', {}), /no target/);
  await assert.rejects(wakeServer(SNAP, { mode: 'bogus' }), /direct\|noy/);
  await assert.rejects(wakeServer(SNAP, { mode: 'noy' }), /proxy/);
  assert.equal(fetchLog.length, 0);
});

test('noy mode: completed+awake resolves with noy strategy', async () => {
  globalThis.fetch = (url) => {
    assert.match(String(url), /\/make-wake-request\?target=/);
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ request: 'completed', wake: { awake: true, strategy: 'poll' } }),
    });
  };
  const res = await wakeServer(SNAP, { mode: 'noy', proxy: 'https://noy.example' });
  assert.equal(res.awake, true);
  assert.equal(res.strategy, 'poll');
});

test('noy failure rejects with the wake detail', async () => {
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ request: 'timeout', wake: { awake: false } }),
  });
  await assert.rejects(
    wakeServer(SNAP, { mode: 'noy', proxy: 'https://noy.example' }),
    /noy failed/,
  );
});
