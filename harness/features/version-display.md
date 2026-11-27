# version-display

Docs: `back/docs/version-display.md`; code:
`back/features/version-display/v1..v5/js-web/` (+ sdui from v5);
src in `back/src/version-display/`.

`<deploy-info>` badge reading `/version.json`-style endpoints; shows only the
version since v4; v5 adds js-web + sdui namespaces with details above the
badge. Complements get-updates (display vs backend JSON provider — a future
src wiring needs a field shim: commit/repo vs commit_id/slave_repo).
