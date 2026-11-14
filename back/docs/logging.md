# logging

`features/logging/v1/js-node` — the structured logger used by the server-side projects,
vendored from feat into consumers (plst syncs it via `back/scripts/sync_features.py`).

## How it works

Node module: queued async file appends (`app.log` / `error.log`), one JSON object per
line, `logger.flush()` must be awaited on shutdown or the last queued lines are lost.
Also carries the extension-log ingestion helpers (`ext-log.js`).

## Environments

None — the consuming project configures the log directory.

## Inputs

`logger.log(message, fields, type)` / `logger.flush()` — see `back/spec/logging.md` (SDD
contract) and the `.d.ts` shipped with the feature.

## Outputs & triggers

Log lines in `logs/app.log` / `logs/error.log`; `logger.get_logs()` for the HTTP
log endpoints.

## Lifecycle slot

None — server-side (js-node namespace), not mounted in a web lifecycle slot.

## Consumers

| project | language | notes |
|---|---|---|
| plst | js-node | vendored into back-node-js (frozen reference) |

## Versions

- **v1** — queued appender + ext-log ingestion, `.d.ts` typings.
