# thru

`features/thru/v1` (`py` namespace) — request pass-through for backend servers: a Flask
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

Route `GET|POST /thru`, query params:

| param | default | meaning |
|---|---|---|
| `target` | — (required) | absolute http(s) URL to hit |
| `method` | `get` | get/post/put/patch/delete |
| `body` | — | url-encoded JSON body for non-get methods |
| `timeout_s` | `30` | overall budget, seconds |

Response MIRRORS the upstream request: same status, content-type and body, plus
`X-Thru-Elapsed-Ms`; connect-level failures → 502 JSON `{request: "error", error, target}`
with `X-Thru-Error`. CORS `Access-Control-Allow-Origin: *` — browser consumers are the
point. SSRF guard: http/https only + optional allowlist.

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
| feat | py | dogfood: feat's own back registers thru_bp |
| noy | py | candidate: replace/extend make-request (not wired yet) |
| stat@web | browser | candidate: route gated calls via a thru host when direct fails (not wired yet) |

## Versions

- **v1** (2026-11-16) — Flask blueprint, mirrored responses, CORS, allowlist/disable envs,
  stdlib-only upstream fetch.
