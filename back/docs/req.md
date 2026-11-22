# req

`features/req/v1` (`js-node` namespace) — env-recipe request executor: an Express-attachable
handler that lets frontends trigger backend capabilities whose secrets (tokens, internal
URLs) must never reach the browser. Spec-first: `back/spec/req.md` is the contract, tests
in `back/test/req.test.mjs` pin it; `py` namespace arrives when a Flask consumer needs it.

## Why

A capability like flow's `/retrigger` requires `Authorization: Bearer <APP_TRIGGER_RUN_TOKEN>`
— the token can never live in frontend code. Instead of a bespoke proxy per call, `req`
executes RECIPES defined entirely by env rows: the frontend calls `/req/<name>` with
public params, the backend fills an operator-authored template and performs the request,
mirroring the response back.

## How it works

Consumers VENDOR `req.js` (+ `req.d.ts`) and integrate one of two ways:

```js
// direct — the project knows the feature:
import { attachReq } from './features/req/req.js';
attachReq(app);                 // GET|POST /req/:name   (opts: env, fetchImpl, prefix)

// via the backend-slots loader — the project knows only the slot (docs/backend-slots.md):
// env row FEAT_REQ_MOUNT=/req → loader calls the standard entry:
export function attach(app, settings) → attachReq(app, { ...settings, prefix: settings.mount ?? '/req' })
```

Recipe env rows (read at call time; presence of `_TARGET` enables the recipe):

| env | default | meaning |
|---|---|---|
| `FEAT_REQ_<NAME>_TARGET` | — (required) | absolute http(s) URL; `{{param}}` placeholders allowed |
| `FEAT_REQ_<NAME>_METHOD` | `get` | get/post/put/patch/delete |
| `FEAT_REQ_<NAME>_HEADERS` | — | JSON object of outbound headers — **where secrets go** |
| `FEAT_REQ_<NAME>_BODY` | — | JSON object (re-serialized) or string (verbatim), `{{param}}` allowed |
| `FEAT_REQ_<NAME>_TIMEOUT_S` | `30` | overall budget |

Params merge from JSON body + query (query wins). Unknown placeholder → 400; bad env
JSON/method/timeout → 500 recipe misconfigured; no `_TARGET` → 404; connect-level
failure → 502. Upstream responses are MIRRORED (status/content-type/body + CORS `*`).
`${UPPER_SNAKE}` references in templates resolve from the process env first (unset →
500), so shared values live in one row (e.g. `${FLOW_BACK_URL}/retrigger`).

**Params are public by contract** (URLs get logged); secrets only in `_HEADERS`/`_BODY`
env rows. The template is the allowlist of shape: callers supply values, never structure.

Reference recipe (retrigger a deploy via flow):

```
FEAT_REQ_REDEPLOY_TARGET  = https://flow.../retrigger
FEAT_REQ_REDEPLOY_METHOD  = post
FEAT_REQ_REDEPLOY_HEADERS = {"Authorization": "Bearer <APP_TRIGGER_RUN_TOKEN>"}
FEAT_REQ_REDEPLOY_BODY    = {"project": "{{project}}"}
```

Frontend: `POST /req/redeploy {"project": "safe"}`.

## Lifecycle slot

Backend feature (vendored at deploy time, `feature-slots.md` backend section). No env
toggle of its own — each recipe's `_TARGET` row is its own toggle. Mount point decides
auth: consumers place it behind their own middleware when the surface shouldn't be
public.

## Consumers

| project | language | notes |
|---|---|---|
| safe | js-node | vendored, mounted `POST /api/req/:name` behind requireTotpSession |
| stat | js-node | vendored, mounted `/req/:name` (stat back is authless) |

## Versions

- **v1** (2026-11-20) — js-node namespace: `buildRequest`/`mergeParams` pure core +
  `createReqHandler`/`attachReq`; spec-pinned by `test/req.test.mjs`.
