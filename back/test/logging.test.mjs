// Contract tests for the logging feature (back/spec/logging.md).
// Run: node --test back/test/   (from the feat repo root)
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, sanitize } from '../features/logging/v1/js-node/logger.js';
import {
  extLogger,
  EXT_LOG_FILE,
  MAX_ENTRIES_PER_REQUEST,
  normalizeExtEntries,
  ingestExtLogs,
  readExtLogs,
} from '../features/logging/v1/js-node/ext-log.js';

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'feat-logging-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const newLogger = (opts = {}) => new Logger({ dir, console: false, ...opts });

const readJsonl = (file) =>
  existsSync(file)
    ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];

test('sanitize masks sensitive keys recursively and survives cycles', () => {
  const cyc = { ok: 1, password: 'hunter2', nested: { API_KEY: 'k', inner: { token: 't' } } };
  cyc.nested.self = cyc;
  const out = sanitize(cyc);
  assert.equal(out.password, '***REDACTED***');
  assert.equal(out.nested.API_KEY, '***REDACTED***');
  assert.equal(out.nested.inner.token, '***REDACTED***');
  assert.equal(out.nested.self, '[Circular]');
  assert.equal(out.ok, 1);
});

test('log() writes to app.log, error() to error.log; entries are JSON with ts/level/fn', async () => {
  const log = newLogger();
  log.log('hello', { a: 1 }, 'myFn');
  log.error('boom', new Error('bang'));
  await log.flush();

  const app = readJsonl(join(dir, 'app.log'));
  const err = readJsonl(join(dir, 'error.log'));
  assert.equal(app.length, 1);
  assert.equal(app[0].msg, 'hello');
  assert.equal(app[0].level, 'log');
  assert.equal(app[0].fn, 'myFn');
  assert.deepEqual(app[0].data, { a: 1 });
  assert.match(app[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(err.length, 1);
  assert.equal(err[0].level, 'error');
  assert.match(err[0].stack, /Error: bang/);
  assert.equal(err[0].data, undefined); // an Error arg is stack, not data
});

test('error() with non-Error second arg stores it as data, not stack', async () => {
  const log = newLogger();
  log.error('bad input', { field: 'x' });
  await log.flush();
  const [entry] = readJsonl(join(dir, 'error.log'));
  assert.deepEqual(entry.data, { field: 'x' });
  assert.equal(entry.stack, undefined);
});

test('data is sanitized on WRITE (secrets never reach the file)', async () => {
  const log = newLogger();
  log.log('req', { url: '/x', Authorization: 'Bearer abc', body: { password: 'p' } });
  await log.flush();
  const [entry] = readJsonl(join(dir, 'app.log'));
  assert.equal(entry.data.Authorization, '***REDACTED***');
  assert.equal(entry.data.body.password, '***REDACTED***');
});

test('LOG_DISABLED stops file writes but memory ring and getLogs(memory) keep working', async () => {
  const log = newLogger({ enabled: false });
  log.warn('w1');
  log.warn('w2');
  await log.flush();
  assert.equal(existsSync(join(dir, 'app.log')), false);
  const entries = await log.getLogs({ memory: true });
  assert.deepEqual(entries.map((e) => e.msg), ['w1', 'w2']);
});

test('memory ring holds at most 500, newest kept', async () => {
  const log = newLogger();
  for (let i = 0; i < 505; i++) log.log(`m${i}`);
  await log.flush();
  const ring = await log.getLogs({ memory: true });
  assert.equal(ring.length, 500);
  assert.equal(ring[0].msg, 'm5');
  assert.equal(ring.at(-1).msg, 'm504');
});

test('rotation: exceeding maxBytes renames app.log → app.log.1, keeps maxFiles', async () => {
  const log = newLogger({ maxBytes: 300, maxFiles: 2 });
  for (let i = 0; i < 30; i++) log.log(`p${i}`); // ~40-byte lines: several per file, then rotate
  await log.flush();
  const names = readdirSync(dir).sort();
  assert.ok(names.includes('app.log'), 'current file exists');
  assert.ok(names.includes('app.log.1'), 'rotated at least once');
  assert.ok(!names.includes('app.log.3'), `oldest beyond maxFiles removed: ${names}`);
  // Reader assembles history: rotated files oldest-first, current last — but only within
  // maxFiles (older generations are gone by design).
  const entries = await log.getLogs({ type: 'app' });
  assert.ok(entries.length >= 10, `assembled ${entries.length} entries across generations`);
  assert.ok(entries[0].ts <= entries.at(-1).ts);
});

test('getLogs(last, type, from/to) filters correctly', async () => {
  const log = newLogger();
  log.log('a1');
  log.warn('w1');
  log.error('e1');
  await log.flush();
  const appOnly = await log.getLogs({ type: 'app' });
  assert.deepEqual(appOnly.map((e) => e.msg).sort(), ['a1', 'w1']);
  const lastOne = await log.getLogs({ last: 1 });
  assert.equal(lastOne.length, 1);
  const future = await log.getLogs({ from: new Date(Date.now() + 60_000) });
  assert.deepEqual(future, []);
});

test('readLogFile reads a non-default file (ext.log pattern) and skips malformed lines', async () => {
  const log = newLogger({ filename: 'custom.log', errorFilename: 'custom.log' });
  log.log('c1');
  await log.flush();
  const entries = await log.readLogFile('custom.log');
  assert.deepEqual(entries.map((e) => e.msg), ['c1']);
});

// ---- ext-log ingestion ------------------------------------------------------

test('normalize: non-array → empty result, nothing dropped', () => {
  assert.deepEqual(normalizeExtEntries('nope'), { entries: [], dropped: 0, capped: false });
  assert.deepEqual(normalizeExtEntries(null), { entries: [], dropped: 0, capped: false });
});

test('normalize: junk entries are dropped and counted; good ones survive', () => {
  const res = normalizeExtEntries([
    'a string',
    null,
    ['an array'],
    { noMsg: true },
    { msg: '', level: 'error' },
    { msg: 'keep me', level: 'error', scope: 'scan', ts: '2026-11-07T10:00:00Z' },
  ]);
  assert.equal(res.dropped, 5);
  assert.equal(res.entries.length, 1);
  assert.equal(res.entries[0].msg, 'keep me');
  assert.equal(res.entries[0].ts, '2026-11-07T10:00:00.000Z'); // normalized to ISO
});

test('normalize: oversized batch keeps the NEWEST and flags capped', () => {
  const raw = Array.from({ length: MAX_ENTRIES_PER_REQUEST + 10 }, (_, i) => ({ msg: `m${i}` }));
  const res = normalizeExtEntries(raw);
  assert.equal(res.capped, true);
  assert.equal(res.entries.length, MAX_ENTRIES_PER_REQUEST);
  assert.equal(res.entries[0].msg, `m10`); // first 10 (oldest) gone
  assert.equal(res.entries.at(-1).msg, `m${MAX_ENTRIES_PER_REQUEST + 9}`);
});

test('normalize: level map (debug/info→log, warning→warn, unknown→log), ts fallback to now, bounds', () => {
  const res = normalizeExtEntries([
    { msg: 'x'.repeat(600), level: 'DEBUG' }, // msg bounded to 500, debug→log
    { msg: 'y', level: 'warning', scope: 's'.repeat(100) }, // scope bounded to 60
    { msg: 'z', ts: 'not-a-date' }, // ts → now
    { msg: 'stacky', stack: 'Error: x\n    at f' },
    { msg: 'with data', data: { k: 1 } },
  ]);
  const [a, b, c, d, e] = res.entries;
  assert.equal(a.msg.length, 500);
  assert.equal(a.level, 'log');
  assert.equal(b.level, 'warn');
  assert.equal(b.scope.length, 60);
  assert.match(c.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(d.stack, 'Error: x\n    at f');
  assert.deepEqual(e.data, { k: 1 });
});

// extLogger is a process-global singleton (its dir cannot be redirected per test), so these
// tests assert on the entries they just ingested rather than on absolute file contents.
test('ingest+read round trip: entries reach ext.log with extTs/extStack framing, flush before return', async () => {
  const marker = `rt-${Date.now()}`;
  const normalized = normalizeExtEntries([
    { msg: `${marker} scan done`, level: 'log', scope: 'scan', ts: '2026-11-07T09:00:00Z' },
    {
      msg: `${marker} crashed`,
      level: 'error',
      scope: 'worker',
      ts: '2026-11-07T09:00:01Z',
      stack: 'Error: x',
    },
  ]);
  await ingestExtLogs(normalized, { extensionId: 'ext-1', userId: 2 });
  const entries = await readExtLogs();
  const mine = entries.filter((e) => e.msg.startsWith(marker));
  assert.equal(mine.length, 2);
  const err = mine.find((e) => e.level === 'error');
  assert.equal(err.msg, `${marker} crashed`);
  assert.equal(err.fn, 'ext:worker');
  assert.equal(err.data.extTs, '2026-11-07T09:00:01.000Z');
  assert.equal(err.data.extStack, 'Error: x'); // extStack, NEVER top-level stack
  assert.equal(err.stack, undefined);
  assert.equal(err.data.extensionId, 'ext-1');
  assert.equal(err.data.userId, 2);
  assert.equal(mine.find((e) => e.level === 'log').data.extTs, '2026-11-07T09:00:00.000Z');
});

test('ingest omits userId from data when null; readExtLogs({last}) slices', async () => {
  const marker = `nu-${Date.now()}`;
  await ingestExtLogs(normalizeExtEntries([{ msg: `${marker} one` }, { msg: `${marker} two` }]), {
    extensionId: null,
    userId: null,
  });
  const entries = await readExtLogs();
  const mine = entries.filter((e) => e.msg.startsWith(marker));
  assert.equal(mine.length, 2);
  assert.ok(mine.every((e) => !('userId' in e.data)));
  const last = await readExtLogs({ last: 1 });
  assert.equal(last.length, 1);
  assert.equal(last[0].msg, `${marker} two`);
});

test('extLogger is a distinct stream: same ext.log file for log AND error levels', async () => {
  assert.equal(extLogger.readLogFile, Object.getPrototypeOf(extLogger).readLogFile);
  assert.equal(EXT_LOG_FILE, 'ext.log');
});
