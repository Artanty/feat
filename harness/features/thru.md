# thru

Docs: `back/docs/thru.md`; code: `back/features/thru/v1..v3/py/` (Flask
blueprint, also vendored into noy/back as its /thru).

Request pass-through: `GET|POST /thru[/<label>]` with `target`, `method`,
`body`, `headers` (auth-token injection), `timeout_s` (default 30,
caller-raiseable — feat's own redeploy uses 120). Response mirrors upstream +
`X-Thru-Elapsed-Ms`; connect failure → 502. Envs at call time:
`THRU_ALLOWED_HOSTS` (SSRF allowlist), `THRU_DISABLED`.

Decisions: v2 added CORS preflight (browser POSTs); v3 sends the body whenever
the caller supplies a content-type (live chat.twc1.net HAR bug — see
incidents/26-11-19). Synchronous by design: it solves network path/secret-free
browser calls, NOT caller-side time limits.
