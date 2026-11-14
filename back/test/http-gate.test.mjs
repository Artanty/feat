// http-gate contract tests — pin spec/http-gate.md against the shipped bundle
// (the same index.js a browser loads; it evals in node: adapter block skips without
// a document, core lands on globalThis.featGate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(
  new URL('../features/http-gate/v2/js-web/index.js', import.meta.url),
  'utf8',
);
(0, eval)(bundle);
const { createGate } = globalThis.featGate;

const RESP_503 = { ok: false, status: 503 };
const RESP_200 = { ok: true, status: 200 };
const CFG = {
  rules: [{ on: 'ERROR', trigger: 503 }],
  recovery: { event: 'wake-up', payload: { target: 'https://x' } },
};

// flush the gate's promise chains (send -> transport -> park -> recovery -> retry)
const tick = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
  let res, rej;
  const p = new Promise((r, j) => { res = r; rej = j; });
  return { promise: p, resolve: res, reject: rej };
}

// transport script: 503s until wakeUp() flips, then 200; records every send
function fakeTransport() {
  const sends = [];
  let awake = false;
  return {
    sends,
    wakeUp: () => { awake = true; },
    sleep: () => { awake = false; },
    request: (url) => {
      sends.push(url);
      return Promise.resolve(awake ? RESP_200 : RESP_503);
    },
  };
}

// a gate whose recovery we resolve/reject manually from the test; signals recorded
function manualGate(transport, cfg = CFG) {
  const recoveries = [];
  const signals = [];
  let pending = deferred();
  const gate = createGate(cfg, {
    request: transport.request,
    recover: () => { recoveries.push(1); return pending.promise; },
    signal: (name) => signals.push(name),
  });
  return {
    gate, recoveries, signals,
    resolveRecovery: (v) => { pending.resolve(v); pending = deferred(); },
    rejectRecovery: (e) => { pending.reject(e); pending = deferred(); },
  };
}

test('loading signals: start on episode begin, end on finish (resume or fail)', async () => {
  const t = fakeTransport();
  const { gate, signals, resolveRecovery, rejectRecovery } = manualGate(t);

  const p1 = gate.request('/api/a');
  await tick();
  assert.equal(signals.length, 1);
  assert.equal(signals[0], 'global-loading-start');
  resolveRecovery();
  await p1;
  assert.equal(signals[1], 'global-loading-end');

  const p2 = gate.request('/api/b'); // second episode, fails
  await tick();
  assert.equal(signals[2], 'global-loading-start');
  rejectRecovery(new Error('nope'));
  await p2;
  assert.equal(signals[3], 'global-loading-end'); // end fires on failure too
});

test('misconfigured gate = pure passthrough (no rules / no recovery event)', async () => {
  const t = fakeTransport();
  let recovered = false;
  for (const cfg of [
    {},
    { rules: [{ on: 'ERROR', trigger: 503 }] }, // rules but no recovery
    { recovery: CFG.recovery },                 // recovery but no rules
  ]) {
    const gate = createGate(cfg, {
      request: t.request,
      recover: () => { recovered = true; return Promise.resolve(); },
    });
    const res = await gate.request('/api/a');
    assert.equal(res.status, 503);
  }
  assert.equal(recovered, false);
  assert.equal(t.sends.length, 3);
});

test('non-matching failure (404) passes through, no recovery', async () => {
  const recoveries = [];
  const gate = createGate(CFG, {
    request: () => Promise.resolve({ ok: false, status: 404 }),
    recover: () => { recoveries.push(1); return deferred().promise; },
  });
  assert.equal((await gate.request('/api/a')).status, 404);
  assert.equal(recoveries.length, 0);
});

test('url_pattern limits the rule', async () => {
  const recoveries = [];
  const gate = createGate(
    { rules: [{ on: 'ERROR', trigger: 503, url_pattern: '^/api/' }], recovery: CFG.recovery },
    {
      request: () => Promise.resolve(RESP_503),
      recover: () => { recoveries.push(1); return deferred().promise; },
    },
  );
  assert.equal((await gate.request('/static/x')).status, 503);
  assert.equal(recoveries.length, 0);
});

test('single-flight: concurrent 503s = one recovery, all retry to 200 after resolve', async () => {
  const t = fakeTransport();
  const { gate, recoveries, resolveRecovery } = manualGate(t);

  const [a, b] = [gate.request('/api/a'), gate.request('/api/b')];
  await tick(); // both 503s land
  assert.equal(gate.state(), 'recovering');
  assert.equal(recoveries.length, 1);

  t.wakeUp(); // backend is fixed now
  resolveRecovery({ awake: true, attempts: 2, elapsedMs: 5, strategy: 'snapdeploy' }); // payload uninspected
  assert.equal((await a).status, 200);
  assert.equal((await b).status, 200);
  assert.equal(gate.state(), 'resumed');
  // each url sent exactly twice: initial 503 + one retry
  assert.deepEqual(t.sends.sort(), ['/api/a', '/api/a', '/api/b', '/api/b']);
});

test('resolve value is irrelevant: undefined resumes traffic too', async () => {
  const t = fakeTransport();
  const { gate, resolveRecovery } = manualGate(t);
  const p = gate.request('/api/a');
  await tick();
  t.wakeUp();
  resolveRecovery(undefined);
  assert.equal((await p).status, 200);
});

test('hold before send: request issued while recovering is sent only after resolve', async () => {
  const t = fakeTransport();
  const { gate, resolveRecovery } = manualGate(t);

  const first = gate.request('/api/first'); // 503 -> starts the episode
  await tick();
  assert.equal(t.sends.length, 1);

  const late = gate.request('/api/late'); // arrives mid-episode: must NOT be sent
  await tick();
  assert.equal(t.sends.length, 1);
  assert.equal(gate.state(), 'recovering');

  t.wakeUp();
  resolveRecovery();
  assert.equal((await first).status, 200);
  assert.equal((await late).status, 200);
  assert.deepEqual(t.sends, ['/api/first', '/api/first', '/api/late']); // parked first, held after
});

test('no loops: retried request failing again resolves its 503, no second recovery', async () => {
  const t = fakeTransport(); // never flips fixed
  const { gate, recoveries, resolveRecovery } = manualGate(t);

  const p = gate.request('/api/a');
  await tick();
  assert.equal(recoveries.length, 1);

  resolveRecovery(); // recovery LIED — backend still broken
  assert.equal((await p).status, 503); // retried failure passes through
  assert.equal(recoveries.length, 1); // and did NOT start a new recovery
});

test('new episode after a completed cycle: fresh matching failure recovers again', async () => {
  const t = fakeTransport();
  const { gate, recoveries, resolveRecovery } = manualGate(t);

  const first = gate.request('/api/a');
  await tick();
  assert.equal(recoveries.length, 1);

  t.wakeUp();
  resolveRecovery();
  assert.equal((await first).status, 200); // cycle completed cleanly

  t.sleep(); // backend breaks again
  const again = gate.request('/api/b');
  await tick();
  assert.equal(recoveries.length, 2); // a NEW episode started
  resolveRecovery(); // give up this one
  assert.equal((await again).status, 503); // parked got its original response back
});

test('recovery reject: parked resolve original response, held reject FEAT_GATE_RECOVERY_FAILED', async () => {
  const t = fakeTransport();
  const { gate, rejectRecovery } = manualGate(t);

  const parkedP = gate.request('/api/parked');
  await tick(); // 503 -> episode starts
  const heldP = gate.request('/api/held'); // held before send

  rejectRecovery(new Error('give up'));
  assert.equal((await parkedP).status, 503);
  await assert.rejects(heldP, (err) => err.code === 'FEAT_GATE_RECOVERY_FAILED');
  assert.equal(gate.state(), 'failed');
});

test('recovery rejection (bus error) fails the episode like a reject', async () => {
  const t = fakeTransport();
  const { gate, rejectRecovery } = manualGate(t);
  const p = gate.request('/api/a');
  await tick();
  rejectRecovery(new Error('bus down'));
  assert.equal((await p).status, 503);
  assert.equal(gate.state(), 'failed');
});

// ---- v2: NETWORK rules ---------------------------------------------------------------

const NET_CFG = {
  rules: [{ on: 'NETWORK' }],
  recovery: { event: 'wake-up', payload: { target: 'https://x' } },
};

test('v2: NETWORK rule — transport rejection parks and recovers (the snapdeploy preflight case)', async () => {
  let fail = true;
  const sends = [];
  const recoveries = [];
  let pending = deferred();
  const gate = createGate(NET_CFG, {
    request: (url) => {
      sends.push(url);
      return fail ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(RESP_200);
    },
    recover: () => { recoveries.push(1); return pending.promise; },
  });

  const p = gate.request('/api/library/users');
  await tick();
  assert.equal(recoveries.length, 1); // the network error WAS the sleep signal
  assert.equal(gate.state(), 'recovering');

  fail = false; // backend awake now
  pending.resolve();
  assert.equal((await p).status, 200); // the rejected request retried successfully
  assert.deepEqual(sends, ['/api/library/users', '/api/library/users']);
});

test('v2: NETWORK + failed recovery — parked reject with their ORIGINAL error', async () => {
  let pending = deferred();
  const gate = createGate(NET_CFG, {
    request: () => Promise.reject(new TypeError('Failed to fetch')),
    recover: () => pending.promise,
  });
  const parkedP = gate.request('/api/a');
  await tick();
  const heldP = gate.request('/api/held');
  pending.reject(new Error('give up'));
  await assert.rejects(parkedP, (err) => err instanceof TypeError);
  await assert.rejects(heldP, (err) => err.code === 'FEAT_GATE_RECOVERY_FAILED');
});

test('v2: no NETWORK rule — transport rejection still passes through (v1 behavior)', async () => {
  const recoveries = [];
  const gate = createGate(CFG, { // 503-only rules
    request: () => Promise.reject(new TypeError('Failed to fetch')),
    recover: () => { recoveries.push(1); return deferred().promise; },
  });
  await assert.rejects(gate.request('/api/a'), (err) => err instanceof TypeError);
  assert.equal(recoveries.length, 0);
});

test('v2: NETWORK url_pattern limits the rule', async () => {
  const recoveries = [];
  const gate = createGate(
    { rules: [{ on: 'NETWORK', url_pattern: '^/api/' }], recovery: CFG.recovery },
    {
      request: () => Promise.reject(new TypeError('offline')),
      recover: () => { recoveries.push(1); return deferred().promise; },
    },
  );
  await assert.rejects(gate.request('/static/x'), (err) => err instanceof TypeError);
  assert.equal(recoveries.length, 0);
});
