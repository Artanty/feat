# logging / db-diag / theme-changer (vendored utilities)

Docs: `back/docs/logging.md`, `back/docs/db-diag.md`; code under
`back/features/{logging,db-diag,theme-changer}/`.

- **logging** v1 (js-node + py) — structured logger vendored into consumers;
  plst syncs via `back/scripts/sync_features.py`.
- **db-diag** v1 (py + js-node) — classifies failed MySQL connections
  (firewall / auth / unreachable) for deploy diagnostics.
- **theme-changer** v1 (sdui) — DivKit theme-switching card; the ext host's
  `theme` global resolves first (theme-changer pattern — cards declare
  nothing).
