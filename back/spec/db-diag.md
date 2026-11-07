# db-diag — feature spec (SDD contract)

When to use: diagnosing "the database is unreachable" for a MySQL-backed server. Born from a
recurring Timeweb VPS failure where TWO different layers produce the same symptom (2026-10-13/20):
a FIREWALL dropping TCP (ETIMEDOUT, MySQL never speaks) vs an IP-pinned GRANT (MySQL answers
Access denied). Telling the layers apart is the entire point. Advice strings mention
`npm run db:check in back/` — plst's CLI ladder; other consumers adapt HOST_HINT when vendoring.

## `classifyDbError(err, host?)` → `{kind, headline, actions[]}` — pure over the error

`host` defaults to `process.env.DB_HOST` then `185.114.247.197`; it appears only inside advice.
`headline` embeds the first line (≤200 chars) of the error message.

| code(s) | kind | verdict essence |
|---|---|---|
| `ETIMEDOUT`, `PROTOCOL_SEQUENCE_TIMEOUT` | `timeout` | TCP dropped before MySQL answered → new-location firewall advice + `nc -z -v <host> 3306` |
| `ECONNREFUSED` | `refused` | host reachable, nothing listening → start MySQL / check DB_PORT |
| `ENOTFOUND`, `EAI_AGAIN` | `dns` | host no longer resolves → check VPS IP, DB_HOST |
| `ECONNRESET`, `EPIPE`, `PROTOCOL_CONNECTION_ERROR` | `reset` | connection cut mid-flight → firewall reset advice |
| `PROTOCOL_CONNECTION_LOST` | `reset` | server closed it: one-off after idle = wait_timeout (normal); concurrent query failures = VPS restart/firewall |
| `ER_ACCESS_DENIED_ERROR` | `access_denied` | MySQL answered and REJECTED the login — proves the firewall is open; two causes named: wrong DB_PASSWORD OR no grant for the address it reported; extracts `'user'@'host'` from the message (defaults account `cs99850_yaum`) and embeds `grantSqlForUser` SQL |
| `ER_DBACCESS_DENIED_ERROR` | `db_access_denied` | login accepted, no rights on DB_DATABASE → SHOW GRANTS |
| anything else | `unknown` | headline + the db:check hint |

## `grantSqlForUser(user, clientHost?)` — the grant-fix SQL
- `clientHost` = the address MySQL itself reported (from the Access-denied message); missing →
  `PUBLIC_IP` placeholder.
- Password is NEVER interpolated: always `<same-password-as-DB_PASSWORD>` — no real or empty
  password may appear in the output (contract-tested).
- Emits CREATE USER IF NOT EXISTS + GRANT on `${process.env.DB_DATABASE ?? 'cs99850_yaum'}` +
  FLUSH PRIVILEGES + commented ALTER USER alternative.

## `probeTcp(host, port, timeoutMs?, connect?)`
- Raw TCP reachability (the layer BELOW MySQL): resolves `{ok, latencyMs, error?}`.
- Timeout (default 5000ms) → synthetic `ETIMEDOUT` error, `latencyMs: null`.
- `connect` is injectable (default `net.createConnection`) so tests need no network.
- Settles exactly once; destroys the socket.

## `checkDatabase(cfg)` — full login probe
- **Requires `mysql2` in the consumer** — lazy-imported (`await import('mysql2/promise')`) at
  call time, so the module loads (and the classifier/probes work) without it; a missing package
  returns an `unknown` verdict naming the missing dep instead of a load error.
- Connects (mysql2, `connectTimeout` default 8000 — short on purpose: a dead DB must diagnose
  in seconds, not look like a hung test).
- On success: `{verdict: ok ('connected as <cu> on <host> (<version>)'), latencyMs, identity
  {user, host, version}, grants[] (SHOW GRANTS; denial tolerated → []), songCount (SELECT
  COUNT(*) FROM songs; missing table tolerated → null)}`.
- On failure: `{verdict: classifyDbError(err, cfg.host), latencyMs: null}`. Always ends the
  connection.

## `publicIp(fetchImpl?)`
- `https://ifconfig.me/ip` with a 5s abort; returns trimmed text or null on any failure
  (non-ok status, throw). The value the VPS firewall and grants actually see.

## Consumer contract
- js-node bundle: `dbDiag.js` + `dbDiag.d.ts` (`index.js` is the feat-router entry, not
  vendored). plst vendors both as `back/src/lib/dbDiag.js`. Requires `mysql2` in the consumer.
