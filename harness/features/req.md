# req

Docs: `back/docs/req.md`; spec: `back/spec/req.md`; code:
`back/features/req/v1/js-node/` (feat.json).

Env-recipe request executor for js-node consumers: `POST /req/<name>` where
the recipe (target URL, headers incl. `Authorization`, timeout) lives in
`FEAT_REQ_<NAME>_*` env rows — frontends trigger backend capabilities whose
secrets never reach the browser. Supports `${ENV}` refs in recipe values.
Reference recipe: flow's /retrigger
(`FEAT_REQ_REDEPLOY_TARGET = <flow>/retrigger`).

Decisions: a v2 caller-supplied template was REJECTED (secret-exfiltration
risk) — recipes stay env-only. Gotcha: unset `_TARGET` ref → 500; rename prod
rows together with docs refs.
