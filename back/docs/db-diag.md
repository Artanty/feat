# db-diag

`features/db-diag/v1` — database-connectivity diagnostics: classify a failed MySQL
connection (firewall drop vs auth vs unreachable) into a human verdict with suggested
actions. Ships in two namespaces: `py` and `js-node`.

## How it works

Given a connection error (or a live connect attempt), `classify_db_error` maps the error
class (timeout = firewall signature, access denied = grant problem, …) to a verdict
dict `{headline, actions, …}`. Boot paths call it to fail loudly with advice instead of a
bare traceback. Contract details in `back/spec/db-diag.md`.

## Environments

None — the consumer passes its DB settings; it does not connect on its own.

## Inputs

A DB config dict (host/port/user/password/database/connectTimeoutMs) or a caught exception.

## Outputs & triggers

Verdict dict `{headline, actions}`; in plst also surfaced through boot logs and
`npm run db:check` / `GET /api/db-test` style probes.

## Lifecycle slot

None — server-side library, not a web component.

## Consumers

| project | language | notes |
|---|---|---|
| plst | py | `back/lib/db_diag.py` (vendored), used at boot + by `/api/db-test` |
| plst | js-node | back-node-js (frozen reference) |

## Versions

- **v1** — classifier + py/js-node namespaces; py port gained dict-verdict shape during
  the plst Flask SDD (app.py `verdict['headline']` fix, 2026-11-10).
