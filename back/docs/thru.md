# thru

`features/thru` v1/v2 (`py` namespace) — request pass-through for backend servers: a Flask
blueprint that lets other apps make their outer requests THROUGH the hosting backend.
Origin: noy/back's `make-request`; generalized as a feat feature so any backend can host
it — python servers first, other languages when the backend skeleton lands.

## Why

The hosting backend's network is often the only path to an origin: the caller's network
may block the target host (e.g. the user's local network cannot reach Render — stat@web
could route those calls via a thru-hosting backend), or the target rejects the caller's
origin. The backend does the fetch server-side and mirrors the response back.

## How it works

Consumers VENDOR `thru.py` (js-node/js-web features load from the feat host at runtime;
python backends vendor, per the logging/db-diag consumer contract) and register:

```python
from thru import thru_bp
app.register_blueprint(thru_bp)
```

Route `GET|POST /thru`, query params (`POST` may instead carry them as a JSON object
body with `target*`-prefixed keys — `target`, `targetMethod`, `targetBody`,
`targetHeaders`, `targetTimeoutS`; query params override body fields; `targetBody` may
be a JSON object, serialized as-is, or a string, forwarded verbatim):

| param | default | meaning |
|---|---|---|
| `target` | — (required) | absolute http(s) URL to hit |
| `method` | `get` | get/post/put/patch/delete |
| `body` | — | url-encoded JSON body for non-get methods |
| `headers` | — | url-encoded JSON object of extra upstream headers (e.g. `{"Authorization": "Bearer ..."}`); hop-by-hop headers (host, content-length, …) are dropped, non-JSON / non-object → 400 |
| `timeout_s` | `30` | overall budget, seconds |

Response MIRRORS the upstream request: same status, content-type and body, plus
`X-Thru-Elapsed-Ms`; connect-level failures → 502 JSON `{request: "error", error, target}`
with `X-Thru-Error`. CORS `Access-Control-Allow-Origin: *` — browser consumers are the
point. SSRF guard: http/https only + optional allowlist.

### CORS preflight (v2)

A GET /thru with everything in query params is a simple request — no preflight. A POST
with `Content-Type: application/json` (the form browsers use to pass `targetHeaders` /
JSON `targetBody` — Russian-text bodies would blow URL limits as GET params) is
PREFLIGHTED: v2 answers `OPTIONS /thru` explicitly, echoing the request's
`Access-Control-Request-Headers` (fallback `Content-Type`), `Access-Control-Allow-Methods:
GET, POST, OPTIONS`, `Access-Control-Max-Age: 600`, and every response carries
allow-origin/methods/headers. v1 relied on Flask's automatic OPTIONS, which omits
Allow-Headers — the browser killed the preflight and the POST never flew (GET-only
consumers never noticed). The main route sets `provide_automatic_options=False` — the
automatic handler otherwise SHADOWS the explicit preflight route (same URL, automatic
wins the match).

### Path label (v3.1)

The same handler also answers `/thru/<label>` (GET|POST|OPTIONS). The label is
DISPLAY-ONLY — the server ignores it completely; target/method/headers/body come from
query params / POST body exactly as on bare `/thru`. It exists so browser network
consoles show distinct request names instead of a wall of identical `/thru` entries.
Convention: `thru-` + last path segment of the target URL
(`/thru/thru-get-items?target=https://site.com/category/get-items`). Bare `/thru` keeps
working; consumers can adopt labels gradually.

## Environments

Read at call time (no runtime config fetch):

| env | effect |
|---|---|
| `THRU_ALLOWED_HOSTS` | comma-separated hostname allowlist; unset = any host |
| `THRU_DISABLED=true` | 503 |

## Lifecycle slot

**`backend-thru`** — the first BACKEND slot: injected at the backend's HTTP layer (the
blueprint registration), not mounted in a frontend. The project's deploy config decides
injection (`FEAT_THRU=true` row; serf vendoring at deploy = future pipeline step). See
know/entries/feature-slots.md (backend slots section).

## Consumers

| project | language | notes |
|---|---|---|
| feat | py | dogfood: feat's own back registers thru_bp (v2) |
| noy | py | candidate: replace/extend make-request (not wired yet) |
| stat@web | browser | gatedFetch THRU_URL transport: GET-query form (preflight-free) |
| chat@web | browser | POST-body form through feat http-gate v2: all chat/back traffic via thru (Render unreachable from the app's users) |

## Versions

- **v1** (2026-11-16) — Flask blueprint, mirrored responses, CORS, allowlist/disable envs,
  stdlib-only upstream fetch.
- **v1.1** (2026-11-19) — `headers` query param: JSON object of extra upstream headers
  (Authorization etc.) so authed endpoints (e.g. flow `/retrigger`) work through thru;
  hop-by-hop headers never forwarded.
- **v1.2** (2026-11-19) — `POST /thru` accepts the params as a JSON object body with
  `target*`-prefixed keys (`target`/`targetMethod`/`targetBody`/`targetHeaders`/
  `targetTimeoutS`); query params override body fields. Before, the HTTP body of a
  POST was silently ignored.
- **v2** (2026-11-19) — CORS preflight: explicit `OPTIONS /thru` (echoes
  Access-Control-Request-Headers, Max-Age 600) + allow-methods/allow-headers on every
  response; `provide_automatic_options=False` on the main route (automatic OPTIONS
  shadows an explicit one). No behavioral change to GET/POST themselves.
- **v3** (2026-11-19) — the upstream body is ALWAYS attached. v2/v1 only set the
  request data when the caller did NOT supply a content-type header — callers that
  send `content-type` in `headers`/`targetHeaders` (chat@web, on every call) had
  their POST body silently dropped (live: TOTP verify arrived bodyless → 400 "code
  must be a 6-digit string"). Content-type is now `setdefault`-ed only when absent.
- **v3.1** (2026-11-20) — `/thru/<label>` (GET|POST|OPTIONS): display-only path label
  for readable network-console names; label ignored, behavior identical to bare `/thru`.
