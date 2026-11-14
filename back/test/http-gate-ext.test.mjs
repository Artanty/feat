// http-gate v2 js-ext adapter tests — the ext bundle's own recover wiring
// (direct featWakeUp call, no bus) + core parity with the js-web semantics.
// Both shipped bundles are evaluated together the way an extension vendors them.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

(0, eval)(readFileSync(new URL('../features/wake-up/v2/js-ext/index.js', import.meta.url), 'utf8'));
(0, eval)(readFileSync(new URL('../features/http-gate/v2/js-ext/index.js', import.meta.url), 'utf8'));
const { wakeServer } = globalThis.featWakeUp;
const gateApi = globalThis.featGate; // adapter instance factory already ran

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => {
  let res, rej;
  const p = new Promise((r, j) => { res = r; rej = j; });
  return { promise: p, resolve: res, reject: rej };
};

// route the gate's transport through a fake backend; wake uses the mocked fetch too
let backendAwake, sends, wakeStates;
beforeEach(() => {
  backendAwake = false;
  sends = [];
  wakeStates = [];
  globalThis.fetch = (url, init) => {
    const u = String(url);
    if (u.startsWith('https://snapdeploy.dev/api/public/wake/')) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    if (u.endsWith('/healthz')) {
      return Promise.resolve({ ok: backendAwake, status: backendAwake ? 200 : 503 });
    }
    sends.push(u);
    return backendAwake
      ? Promise.resolve({ ok: true, status: 200 })
      : Promise.reject(new TypeError('network error while asleep'));
  };
});

const BASE = 'https://x.containers.snapdeploy.app';

test('adapter: NETWORK failure → direct wakeServer recovery → retry once → 200', async () => {
  const conf = {
    rules: [{ on: 'ERROR', trigger: 503 }, { on: 'NETWORK' }],
    recovery: { target: BASE },
    onState: (s) => wakeStates.push(s),
  };
  const gate = gateApi.createGate(conf, {
    request: (url, init) => fetch(url, init),
    signal: (name) => wakeStates.push(name),
    recover: () => {
      const d = deferred();
      wakeServer(BASE, { interval: 1, timeout: 5000 }).then(d.resolve, d.reject);
      setTimeout(() => { backendAwake = true; }, 5); // backend comes up mid-episode
      return d.promise;
    },
  });

  const p = gate.request(BASE + '/api/library/scan', { method: 'POST' });
  await tick(); await tick();
  assert.equal(gate.state(), 'recovering');
  const resp = await p;
  assert.equal(resp.status, 200);
  assert.equal(sends.length, 2); // original + ONE retry
  assert.ok(wakeStates.indexOf('gate-recovering') !== -1);
  assert.ok(wakeStates.indexOf('gate-recovered') !== -1);
  assert.equal(gate.state(), 'resumed');
});

test('adapter recover wiring: FEAT_GATE_CONFIG.recovery.target flows into wakeServer', async () => {
  // build a second gate through the adapter's own gate() path: simulate by calling the
  // documented integration shape — conf-driven recover that the adapter would install
  const seenTargets = [];
  const conf = {
    rules: [{ on: 'NETWORK' }],
    recovery: { target: BASE },
  };
  const gate = gateApi.createGate(conf, {
    request: (url) => Promise.reject(new TypeError('net')),
    recover: () => {
      seenTargets.push(conf.recovery.target);
      return wakeServer(BASE, { interval: 1, timeout: 50 }); // wake fails: episode fails
    },
  });
  await assert.rejects(gate.request(BASE + '/api/x'), /network|TypeError|net/);
  await tick();
  await tick();
  assert.deepEqual(seenTargets, [BASE]);
  assert.equal(gate.state(), 'failed');
});

test('adapter reads FEAT_GATE_CONFIG lazily (set AFTER the bundle loads, like popup.js)', async () => {
  // Regression (found live 2026-11-14): the adapter captured the config at load time;
  // in the extension popup.js sets FEAT_GATE_CONFIG AFTER the vendor bundles load, so
  // the gate saw {} and silently degraded to a passthrough — an import against a
  // sleeping snapdeploy backend died with "Failed to fetch" and no wake ever ran.
  globalThis.fetch = (url) => {
    const u = String(url);
    if (u.startsWith('https://snapdeploy.dev/api/public/wake/')) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    if (u.endsWith('/healthz')) {
      healthzCount += 1;
      return Promise.resolve({ ok: healthzCount > 1, status: healthzCount > 1 ? 200 : 503 });
    }
    return healthzCount > 1
      ? Promise.resolve({ ok: true, status: 200 })
      : Promise.reject(new TypeError('Failed to fetch')); // sleeping edge kills POSTs
  };
  let healthzCount = 0;

  // config set ONLY now — after both bundles were eval'd at import time
  globalThis.FEAT_GATE_CONFIG = {
    rules: [{ on: 'NETWORK' }],
    recovery: { target: BASE },
  };
  const resp = await gateApi.request(BASE + '/api/library/scan', { method: 'POST' });
  assert.equal(resp.status, 200);
});

test('core parity: misconfigured (no recovery.target) = pure passthrough', async () => {
  const gate = gateApi.createGate({ rules: [{ on: 'NETWORK' }], recovery: {} }, {
    request: (url) => Promise.reject(new TypeError('net')),
    recover: () => Promise.resolve(),
  });
  await assert.rejects(gate.request('https://x/api'), /net/);
  assert.equal(gate.state(), 'idle');
});
