# backend-slots — feature spec (SDD contract)

When to use: a BACKEND project hosts feat backend features (req, get-updates, later
middleware features like an auth-interceptor) and must not know feature specifics.
WHO fills a slot is CONFIG (env rows); WHERE each slot sits is HOST CODE; a FEATURE
declares its kind + defaults. This is the backend twin of the frontend FeatureSlot
pattern (know/entries/feature-slots.md).

Spec-driven rule: **this file is the contract**. Tests (`back/test/backend-slots.test.mjs`)
pin it; any-language implementations pass when they satisfy both. js-node first (`py`
when a Flask consumer needs it).

## Concept inversion

WITHOUT slots, the app hardcodes the feature:
`import { attachReq } from './features/req/req.js'; attachReq(app);` — the project knows
the feature. WITH slots the app knows only the slot call:

```js
import { mountBackendFeatures } from './features/loader.js';
await mountBackendFeatures(app);   // mounts whatever the deploy config says
```

## Config (env rows, read at mount time)

The SLOT row is the toggle — absent/empty = the feature stays dormant:

    FEAT_<ID>_SLOT=<slotName>     # required: which slot the feature fills
    FEAT_<ID>_MOUNT=<path|true>   # route slot only, optional: path override;
                                  #   `true` = the feature's defaultMount (canonical)
    FEAT_<ID>_<SETTING>           # extra feature settings, passed verbatim
    FEAT_URL=<feat host>          # remote resolution base for not-vendored features

- `<ID>` upper snake (`REQ`, `GET_UPDATES`), `<id>` = ID lowercased with underscores →
  hyphens (`req`, `get-updates`) — the vendored dir name. Avoid mounted IDs that are
  underscore-prefixes of each other (`GET` vs `GET_UPDATES` — settings collision).
- A feature's CANONICAL endpoint path is declared by the feature itself
  (`defaultMount`) — projects standardize on `=true` (or omit `_MOUNT` entirely) so the
  path is identical everywhere; an explicit path is a deliberate local override.
- Slots are lowercase names. `route` is the built-in slot (HTTP endpoints). Every
  other slot name is a HOST-DEFINED anchor (see Loader semantics).

## Feature entries (contract for every backend feature)

A js-node feature module exports exactly ONE of:

```js
// 1. route feature (v3)
export const kind = 'route';
export const defaultMount = '/get-updates';          // canonical path
export const routes = { 'GET /': (req, res) => … };  // '<METHOD> <relative-path>' keys

// 2. middleware feature (v3) — e.g. an auth-interceptor
export const kind = 'middleware';
export const middleware = (req, res, next) => …;

// 3. legacy entry (pre-v3; req v1) — the feature registers itself
export function attach(app, settings) { … }
```

Route paths in `routes` are RELATIVE to the mount (`'GET /:name'` at `/req` →
`GET /req/:name`). The feature must not assume auth — placement/auth policy is the
host's business.

## Loader semantics

1. Scan env for `^FEAT_([A-Z0-9]+(_[A-Z0-9]+)*)_SLOT$` rows with non-empty values
  (the toggle). For each, in stable (sorted by id) order:
2. RESOLVE the module LOCAL-FIRST: `<vendoredDir>/<id>/<id>.js` if readable
  (a deliberate version pin); otherwise fetch from the feat host —
  `GET <FEAT_URL>/manifest.json` → `features[<id>].latest` →
  `GET <FEAT_URL>/<id>/<latest>/js-node/<id>.js` — and import the source via a
  `data:` URL (single-file main module; nothing is written to the consumer repo).
  No local file + no `FEAT_URL` → resolution fails.
3. REGISTER per the feature entry:
   - legacy `attach`: call `attach(app, { ...settings, mount, slot })`.
   - `kind 'route'` (must have `SLOT=route`): register each routes entry on the app;
     mount path = `_MOUNT` override, else `defaultMount` (no both → fail).
   - `kind 'middleware'`: append to the named anchor the HOST placed via
     `feat.slot(<name>)`; several features in one anchor run in sorted-id order.
     A `SLOT` naming an anchor the host never placed → fail.
4. **Silent-fail per feature**: resolution/registration failure is logged to
  console.error and SKIPPED — a broken feature (or an unreachable feat host) must
  never break the host boot. Other features still mount.
5. Returns the mounted feature ids (for logging/tests).

Host API: simple hosts (routes only) call `mountBackendFeatures(app)`. Hosts with
middleware positions use `createFeatLoader()`:

```js
const feat = createFeatLoader();
app.use(express.json());
app.use(feat.slot('pre-auth'));   // anchor — WHERE is host knowledge
await feat.mount(app);            // SLOT rows fill anchors + routes
```

The loader is dependency-free; consumers vendor ONLY `loader.js` (+ `loader.d.ts`).

## Slot registry

The slot a feature typically occupies (naming lives in know/entries/feature-slots.md):

- `route` (built-in) — HTTP endpoints. Residents: feat `req` v1 (legacy attach),
  feat `get-updates` v2 (kind route).
- `backend-thru` — HTTP-layer pass-through. Resident: feat `thru` (py; predates the
  loader, registered directly for now).
- host-named middleware anchors (e.g. `pre-auth`) — for future middleware features.

## Versions

- **v3** (2026-11-22) — named slots: `FEAT_<ID>_SLOT` row is the required toggle;
  `_MOUNT` demoted to optional path override (`true` = feature `defaultMount`);
  feature entries kind route (routes map + defaultMount) / kind middleware;
  `createFeatLoader()` + `feat.slot(name)` anchors; legacy `attach()` still supported.
- **v2** (2026-11-21, incl. v2.1 remote resolution 2026-11-22) — IDs may contain
  underscores (`_`→`-` dir mapping); not-vendored features fetched from `FEAT_URL`
  and imported via `data:` URL — loader.js is the only vendored file.
- **v1** (2026-11-20) — original: `FEAT_<ID>_MOUNT` = toggle+placement, `[A-Z0-9]+`
  IDs only, local vendored features only.
