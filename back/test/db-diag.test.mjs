// Contract tests for the db-diag feature (back/spec/db-diag.md).
// Run: node --test back/test/   (from the feat repo root)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDbError,
  grantSqlForUser,
  probeTcp,
  publicIp,
} from '../features/db-diag/v1/js-node/dbDiag.js';

const err = (code, message = 'something went wrong') => {
  const e = new Error(message);
  e.code = code;
  return e;
};

afterEach(() => {
  delete process.env.DB_DATABASE;
});

test('classification table: each error code maps to its verdict kind', () => {
  const cases = [
    ['ETIMEDOUT', 'timeout'],
    ['PROTOCOL_SEQUENCE_TIMEOUT', 'timeout'],
    ['ECONNREFUSED', 'refused'],
    ['ENOTFOUND', 'dns'],
    ['EAI_AGAIN', 'dns'],
    ['ECONNRESET', 'reset'],
    ['EPIPE', 'reset'],
    ['PROTOCOL_CONNECTION_ERROR', 'reset'],
    ['PROTOCOL_CONNECTION_LOST', 'reset'],
    ['ER_ACCESS_DENIED_ERROR', 'access_denied'],
    ['ER_DBACCESS_DENIED_ERROR', 'db_access_denied'],
  ];
  for (const [code, kind] of cases) {
    assert.equal(classifyDbError(err(code)).kind, kind, code);
  }
  assert.equal(classifyDbError(err('WHATEVER')).kind, 'unknown');
  assert.equal(classifyDbError(new Error('plain')).kind, 'unknown');
});

test('timeout verdict: headline names the drop, advice carries the host + nc command', () => {
  const v = classifyDbError(err('ETIMEDOUT', 'connect ETIMEDOUT 1.2.3.4:3306'), '10.0.0.1');
  assert.match(v.headline, /packets were dropped before MySQL answered/);
  assert.match(v.headline, /connect ETIMEDOUT 1\.2\.3\.4:3306/);
  const nc = v.actions.find((a) => a.code)?.code;
  assert.equal(nc, 'nc -z -v 10.0.0.1 3306');
  assert.ok(v.actions.some((a) => a.text.includes('NEW network/location')));
});

test('PROTOCOL_CONNECTION_LOST gets the wait_timeout advice; plain resets get the firewall one', () => {
  const lost = classifyDbError(err('PROTOCOL_CONNECTION_LOST', 'Connection lost: The server closed the connection.'));
  assert.ok(lost.actions.some((a) => a.text.includes('wait_timeout')));
  const reset = classifyDbError(err('ECONNRESET'));
  assert.ok(!reset.actions.some((a) => a.text.includes('wait_timeout')));
  assert.ok(reset.actions.some((a) => a.text.includes('handshake reset')));
});

test('access_denied: extracts account@host from the message and embeds the grant SQL', () => {
  const v = classifyDbError(
    err('ER_ACCESS_DENIED_ERROR', "Access denied for user 'bob'@'93.100.74.64' (using password: YES)"),
  );
  assert.match(v.headline, /REJECTED the login from 93\.100\.74\.64/);
  assert.ok(v.actions.some((a) => a.text.includes("'bob'@'93.100.74.64'")));
  const sql = v.actions.find((a) => a.code)?.code;
  assert.match(sql, /CREATE USER IF NOT EXISTS 'bob'@'93\.100\.74\.64'/);
});

test('grantSqlForUser: PUBLIC_IP placeholder when host unknown; DB_DATABASE respected', () => {
  process.env.DB_DATABASE = 'mydb';
  const sql = grantSqlForUser('u1');
  assert.match(sql, /'u1'@'PUBLIC_IP'/);
  assert.match(sql, /ON `mydb`\.\*/);
  assert.match(sql, /FLUSH PRIVILEGES;/);
  assert.match(sql, /-- ALTER USER/);
});

test('grantSqlForUser: NO real or empty password may ever appear (placeholder only)', () => {
  const sql = grantSqlForUser('cs99850_yaum', '1.2.3.4');
  assert.ok(sql.includes('<same-password-as-DB_PASSWORD>'));
  assert.ok(!sql.includes("IDENTIFIED BY '';"));
  assert.ok(!/\bIDENTIFIED BY '[^<]/.test(sql), 'no literal password after IDENTIFIED BY');
  assert.equal(sql.split('<same-password-as-DB_PASSWORD>').length - 1, 2); // CREATE + commented ALTER
});

test('access_denied with defaults: unknown account falls back to cs99850_yaum', () => {
  const v = classifyDbError(err('ER_ACCESS_DENIED_ERROR', 'Access denied for user'));
  assert.ok(v.actions.some((a) => a.text.includes("'cs99850_yaum'@'<address-from-error>'")));
});

test('probeTcp: success resolves ok + latency and settles once (injected connect)', async () => {
  let destroyed = 0;
  const handlers = {};
  const fakeSocket = {
    once(ev, fn) {
      handlers[ev] = fn;
    },
    destroy() {
      destroyed += 1;
    },
  };
  const fakeConnect = () => {
    queueMicrotask(() => handlers['connect']());
    return fakeSocket;
  };
  const res = await probeTcp('h', 1, 1000, fakeConnect);
  assert.equal(res.ok, true);
  assert.equal(typeof res.latencyMs, 'number');
  assert.equal(destroyed, 1);
});

test('probeTcp: error path (ECONNREFUSED-shaped) and timeout path (synthetic ETIMEDOUT)', async () => {
  const refused = new Error('refused');
  refused.code = 'ECONNREFUSED';
  const handlers = {};
  const mkSocket = () => ({
    once(ev, fn) {
      handlers[ev] = fn;
    },
    destroy() {},
  });
  const errRes = await probeTcp('h', 1, 1000, () => {
    const s = mkSocket();
    queueMicrotask(() => handlers['error'](refused));
    return s;
  });
  assert.equal(errRes.ok, false);
  assert.equal(errRes.error.code, 'ECONNREFUSED');
  assert.equal(errRes.latencyMs, null);

  const neverSocket = () => ({
    once() {},
    destroy() {},
  });
  const timeoutRes = await probeTcp('h', 1, 30, neverSocket);
  assert.equal(timeoutRes.ok, false);
  assert.equal(timeoutRes.error.code, 'ETIMEDOUT');
  assert.match(timeoutRes.error.message, /after 30ms/);
});

test('publicIp: trims the body; null on non-ok, null on throw (injected fetch)', async () => {
  assert.equal(await publicIp(async () => ({ ok: true, text: async () => '  1.2.3.4\n' })), '1.2.3.4');
  assert.equal(await publicIp(async () => ({ ok: false })), null);
  assert.equal(await publicIp(async () => { throw new Error('down'); }), null);
});
