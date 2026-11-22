# feature-slots skeleton — the slot map (web + back)

Visual map of every known feature slot and its residents. **Maintained by hand:**
whenever a feature is added/renamed or a slot is introduced, update this file (it is the
one-glance answer to "what slots exist and what fills them"). Naming/semantics history
lives in `know/entries/feature-slots.md`; loader contract in `backend-slots.md`.

## The skeleton

```
WEB APP (browser)                              BACKEND (server)
──────────────────────                         ─────────────────────────────────────────────
boot                                           boot
┌────────────────────────────────┐             import { mountBackendFeatures } from
│ app-init                       │               './features/loader.js'   ← only vendored file
│   wake-up  <wake-server>       │             await mountBackendFeatures(app)
└────────────────────────────────┘                        │
                                               WHO  ← env: FEAT_<ID>_SLOT=<name> (toggle;
HTTP layer                                                      absent = dormant)
┌────────────────────────────────┐             WHAT ← feat host (FEAT_URL): loader fetches
│ backend-request (on error)     │                        the feature at boot (latest)
│   http-gate  window.featGate   │                        │
│   wake-up (manual mode)        │                        ▼
└────────────────────────────────┘    ┌───────────────────────┬───────────────────────┐
                                      │ route slot (built-in) │ host anchors (any name)│
chrome                                 │  path = defaultMount  │  placed by host code:  │
┌────────────────────────────────┐    │                       │  app.use(feat.slot(x))│
│ app-version                    │    │  get-updates v2  ─────┼─ GET /get-updates      │
│   version-display <deploy-info>│    │  req v1 (legacy) ─────┼─ GET|POST /req/:name   │
├────────────────────────────────┤    │                       │  (middleware features  │
│ project-header                 │    │                       │   run sorted-id; none  │
│   redeploy <redeploy-button>   │    │                       │   resident yet — e.g.  │
└────────────────────────────────┘    │                       │   pre-auth anchor for  │
                                      │                       │   an auth-interceptor) │
bus (feat feature `bus`, js-web):     └───────────────────────┴───────────────────────┘
attrs in · events out · request/reply  pre-loader: thru (py blueprint, registered
                                       directly by the host — GET|POST /thru?target=…)
```

Both sides are FEATURE SLOTS, split by environment: **web feature slots** (filled in a
browser app) and **back feature slots** (filled in a server). Below, sections and labels
use the `web-`/`back-` wording; slot IDs stay as deployed (a future uniform
`web-*`/`back-*` ID scheme is a separate migration).

## web feature slots (web)

| slot | placement / activation | residents |
|---|---|---|
| `app-init` | on boot, before API traffic | wake-up (`<wake-server>`) |
| `app-version` | persistent chrome (header/footer) | version-display (`<deploy-info>`) |
| `project-header` | opened project's header | redeploy v1 (`<redeploy-button>`) |
| `backend-request` | error-activated in the HTTP layer | http-gate (`window.featGate`), wake-up manual |

Host wrappers: plst `FeatureSlot.tsx` (config from `/api/features`), safe
`feature-slot.component.ts` (local-constant config). Attrs are build-time strings;
runtime data goes over the bus.

## back feature slots (back, loader v3)

| slot | what it is | residents |
|---|---|---|
| `route` (built-in) | HTTP endpoints; path = feature `defaultMount` (`_MOUNT` optional override) | get-updates v2 (`GET /get-updates`), req v1 legacy (`GET|POST /req/:name`) |
| host-named anchors (e.g. `pre-auth`) | host places `feat.slot(name)` in its middleware chain; middleware features fill it, sorted-id order | — (none yet; planned: auth-interceptor) |
| `backend-thru` (pre-loader) | direct-registered Flask blueprint | thru (py) `GET|POST /thru` |

Config rows: `FEAT_URL`, `FEAT_<ID>_SLOT=<name>`, optional `FEAT_<ID>_MOUNT=<path|true>`,
`FEAT_<ID>_<SETTING>`.

## Consumers today

| project | web feature slots used | back feature slots filled |
|---|---|---|
| plst | reference FeatureSlot host (wake-up, http-gate, version-display; js-ext vendors too) | — |
| stat | app-init (wake-up), app-version (version-display), backend-request (http-gate) | route: req, get-updates (env-config rows) |
| safe | project-header (redeploy) | route: req (`/api/req`, TOTP-gated call site) |
| chat | — | via thru transport (THRU_URL) |

## Maintenance

Adding a feature or slot → update the diagram + the table above, bump the entry in this
repo's DECISIONS.md. Rule of thumb: the diagram shows *slots*; per-feature docs
(`docs/<feature>.md`) stay the detail source.
