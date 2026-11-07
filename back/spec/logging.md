# logging — feature spec (SDD contract)

When to use: any server project needs file+memory+console logging and/or ingest of extension
logs. Canonical source; consumers vendor the js-node build (see Consumer contract below).
Implementations: `features/logging/v1/js-node/` today; `py/` arrives with plst's back-py.

Spec-driven rule: **this file is the contract**. The tests (`back/test/logging.test.mjs`) pin
it; an implementation in any language passes when it satisfies both. Never edit a published
version dir in place — new contract = new spec section + new `v<n>/`.

## Logger (`index.js` exports: `Logger`, `logger`, `sanitize`)

### Construction & config
- `new Logger(opts)`; opts override env, env overrides defaults:
  - dir: `opts.dir` > `LOG_DIR` > `<cwd>/logs`; created recursively at construction.
  - filenames: `app.log` / `error.log` (overridable `filename`/`errorFilename`).
  - `LOG_MAX_BYTES` default 1,000,000; `LOG_MAX_FILES` default 5.
  - `LOG_DISABLED=true` → no file writes; console mirror and memory ring MUST keep working.
  - `LOG_CONSOLE=off` → no console mirror.
- A shared singleton `logger` is exported; projects may instantiate their own.

### Writing
- `log(msg, data?, fn?)`, `warn(...)`, `error(msg, errOrData?, fn?)`:
  - `error` treats an Error-like second arg (has `.stack`) as an error: its stack goes to the
    entry's `stack` field and it is NOT stored as `data`.
  - `data` is sanitized on write: values of sensitive keys → `***REDACTED***`
    (password/passwd/pass/pwd/token/secret/authorization/auth/cookie/captcha/otp/credit/card/
    email_pass/api-key/apikey/x-api-key/pat/bearer/private_key, case-insensitive, word-boundary);
    recursion is circular-safe (`[Circular]`).
- Entry shape (one JSON object per line): `{ts: ISO, level, fn, msg, stack?, data?}`.
  `fn` = explicit arg or captured first non-logger stack frame (function name, or `file:line`
  for anonymous frames); `'unknown'` as last resort.
- Destination: `error` → error.log, everything else → app.log.
- Rotation on write, when a file exceeds maxBytes: `name` → `name.1` → … → oldest removed
  (keep `maxFiles`). Appends and rotations are serialized through an internal queue — a rename
  never races an append. **`flush()` awaits that queue** — anything logged just before process
  exit MUST be flushed or it reaches the console but not the file (the SIGTERM lesson).
- Console mirror: one compact line `HH:MM:SS.mmm LEVEL msg (fn) {json data}`; errors also print
  the stack. Unserializable data prints `[unserializable data]`, never throws.
- Memory ring: last 500 entries held in memory, independent of file writing.

### Reading
- `getLogs({from?, to?, last?, type?, hideSensitive?, memory?})`:
  - `memory` → the ring; otherwise files (rotated `.N` read oldest-first, current file last;
    malformed lines skipped).
  - `type`: `app` | `error` | `all` (default all).
  - from/to inclusive epoch filter on entry `ts`; result sorted by `ts` ascending.
  - `last: N` → the N most recent.
  - `hideSensitive` re-applies sanitize to `data` on read.
  - Always flushes before reading (a just-logged entry is visible).
- `readLogFile(filename)` — parsed entries of any file in the log dir; flushes first.

## Extension-log ingestion (`ext-log.js` exports: `extLogger`, `EXT_LOG_FILE`,
`MAX_ENTRIES_PER_REQUEST`, `normalizeExtEntries`, `ingestExtLogs`, `readExtLogs`)

- `extLogger` is a second Logger instance: both filenames `ext.log`, console mirror OFF
  (a 200-entry batch must not print 200 terminal lines).
- `normalizeExtEntries(raw)` — public endpoint, sender assumed sloppy or hostile:
  - non-array → `{entries: [], dropped: 0, capped: false}`.
  - >200 entries: keep the NEWEST 200 (extension ships oldest-first; the explaining entries
    are at the end), `capped: true`.
  - dropped (counted, never thrown): non-object entries; entries whose msg is empty after
    stringification.
  - entry fields: `msg` ≤500 chars; `scope` ≤60 chars, default `'ext'`; `level` mapped
    debug/info→log, warn/warning→warn, error→error, unknown→log; `ts` ≤40 chars — parsed to
    ISO, unparseable/missing → now (order is already correct; losing a real error over a bad
    date is worse); `stack` ≤4000 kept only if non-empty; `data` passed through.
- `ingestExtLogs(normalized, {extensionId, userId})` — writes each entry through the Logger
  with data `{extensionId, scope, extTs (client clock — arrival stamps collide across
  browsers), userId?, ext?: client data, extStack?: client stack}` and `fn = 'ext:<scope>'`.
  **`extStack`, never `stack`**: a top-level stack makes Logger treat the payload as an Error
  and discard it. Awaits flush before returning (the response must not lie about "stored").
- `readExtLogs({last?})` — reads ext.log back, newest last.

## Consumer contract (vendoring)
- js-node bundle = `logger.js`, `ext-log.js`, `logger.d.ts`, `ext-log.d.ts` (`index.js` is only
  the feat-router entry that re-exports both and is NOT vendored).
- plst sync: `npm run features:sync` in plst/back copies these into `plst/back/src/lib/`.
- Edit HERE, re-sync there; never edit vendored copies in place.
