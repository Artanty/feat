# req — feature spec (SDD contract)

When to use: a frontend needs to call a backend capability that requires SECRETS (tokens,
internal URLs) the browser must never see — e.g. retriggering a deploy via flow's
`/retrigger`, which needs `Authorization: Bearer <APP_TRIGGER_RUN_TOKEN>`. Instead of a
bespoke proxy per call, `req` executes env-defined RECIPES: the frontend calls
`/req/<name>` with public params, the backend fills an operator-authored template and
performs the request server-side.

Spec-driven rule: **this file is the contract**. The tests (`back/test/req.test.mjs`) pin
it; an implementation in any language/framework passes when it satisfies both. Framework
variants are NAMESPACES of one version (`js-node` today; `py` when a Flask consumer
needs it), not separate versions.

## Concepts

- **Recipe** — one named outbound request, defined entirely by env rows. The recipe name
  is DATA: adding a capability = adding env rows, not code.
- **Params** — caller-supplied values (entity ids, project names, flags). **Public by
  contract**: they travel on the caller's request (query/URL get logged); secrets never
  are params — secrets live in the recipe's `_HEADERS`/`_BODY` env rows, server-side.

## Route

`GET|POST /req/:name` (name lowercased, kebab/case-insensitive → `FEAT_REQ_<UPPER_SNAKE>_`).

## Environments (read at call time)

| env | effect |
|---|---|
| `FEAT_REQ_<NAME>_TARGET` | absolute http(s) URL of the outbound request. **Presence = recipe exists**; missing → 404 `unknown recipe`. Placeholders allowed. |
| `FEAT_REQ_<NAME>_METHOD` | get/post/put/patch/delete, default `get` |
| `FEAT_REQ_<NAME>_HEADERS` | JSON object of outbound headers — where secrets go. Placeholders allowed. |
| `FEAT_REQ_<NAME>_BODY` | JSON object (re-serialized after substitution) or string (substituted verbatim). Only meaningful for non-get. |
| `FEAT_REQ_<NAME>_TIMEOUT_S` | overall budget, default 30 |

## Params & placeholders

- **Env references** — `${UPPER_SNAKE_NAME}` in TARGET/HEADERS/BODY resolves against the
  process env FIRST (before params), so shared values live in one env row (e.g.
  `FEAT_REQ_R_TARGET = ${FLOW_BACK_DOMAIN}/retrigger`). A reference to an unset env →
  500 recipe misconfigured naming the env. Env names are UPPER_SNAKE_CASE only
  (know/entries/rules.md).
- Params are merged from the JSON request body (object) and the query string — **query
  wins** on conflict.
- `{{param}}` placeholders in TARGET/HEADERS/BODY are replaced by string substitution
  BEFORE use. A placeholder present in a template but absent from the params → 400
  naming the placeholder (catches typos early).
- Substitution is values-only: the caller cannot add headers, change structure, or
  introduce keys the template doesn't have — the template is the allowlist of shape.

## Error semantics

| condition | status |
|---|---|
| recipe name has no `_TARGET` env | 404 `{"error":"unknown recipe"}` |
| template references unknown placeholder | 400 `{"error":"unknown param <name>"}` |
| `_HEADERS`/`_BODY`/`_METHOD`/`_TIMEOUT_S` env invalid (bad JSON, bad method, bad int) | 500 `{"error":"recipe misconfigured", ...}` |
| `_TARGET` not http(s) | 500 `{"error":"recipe misconfigured"}` |
| connect/timeout/TLS failure | 502 `{"error": <reason>}` |

An upstream HTTP error IS a response: mirror it (see below), never convert to 5xx.

## Outbound request & response mirroring

- Outbound headers: recipe `_HEADERS` only, plus `content-type: application/json` when a
  body is sent and the recipe didn't set one. Hop-by-hop headers (`connection`,
  `content-length`, `transfer-encoding`, `host`, `accept-encoding`) are never sent.
- The response MIRRORS the upstream: same status, `content-type`, body. CORS
  `Access-Control-Allow-Origin: *` (browser consumers are the point). Callers see the
  target's real errors (409 still-in-progress etc.) through the same mirror.

## Consumer contract (js-node)

Consumers vendor `features/req/v1/js-node/req.js` (+ `req.d.ts`) — `index.js` is only
feat's router entry, not vendored. Two integration forms:

```js
// direct (the project knows the feature):
import { attachReq } from './features/req/req.js';
attachReq(app, { prefix: '/req' });            // opts: env, fetchImpl, prefix

// via the backend-slots loader (project knows only the slot; spec/backend-slots.md):
// env row FEAT_REQ_MOUNT=/req → loader calls the standard entry with {mount, ...settings}
export function attach(app, settings = {}) → attachReq(app, { ...settings, prefix: settings.mount ?? '/req' })
```

Express 4 compatible; `attachReq` registers `GET|POST <prefix>/:name`. Mount point
decides path prefix AND auth: consumers put it behind their own auth middleware when the
surface should not be public (safe mounts it behind requireTotpSession).
