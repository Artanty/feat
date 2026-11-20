# backend-slots — feature spec (SDD contract)

When to use: a BACKEND project hosts feat backend features (req, later thru-js etc.) and
must not know feature specifics. The project declares injection points (slots); config
decides WHICH vendored feature fills each slot and its settings. This is the backend twin
of the frontend FeatureSlot pattern (know/entries/feature-slots.md) and the seed of the
backend-skeleton vision recorded there.

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

One row per feature is BOTH toggle and placement:

    FEAT_<ID>_MOUNT=<path>     # present → features/<id>/<id>.js is attached; absent → dormant

- `<ID>` upper snake (`REQ`, `GET_UPDATES`), `<id>` = ID lowercased with underscores →
  hyphens (`req`, `get-updates`) — the vendored dir name (loader v2; v1 allowed
  `[A-Z0-9]+` only).
- Value = the mount path passed to the feature (e.g. `/api/req`); a `true` value is
  invalid (path required — placement is part of the contract).
- Extra feature settings ride the same prefix (`FEAT_<ID>_<SETTING>`); they are collected
  into `settings` verbatim (lowercased key, mount row excluded) — the loader never
  interprets them.

## Feature entry (contract for every backend feature)

Each vendored feature module `features/<id>/<id>.js` exports a standard entry:

```js
attach(app, settings) → unknown
```

- `settings.mount` — the path from `_MOUNT`.
- `settings.<key>` — the feature's own `FEAT_<ID>_<KEY>` rows (strings).
- Placement/auth policy is the SLOT call-site's property (e.g. safe mounts after its TOTP
  middleware); the feature must not assume auth.

## Loader semantics

1. Scan env for `^FEAT_([A-Z0-9]+(?:_[A-Z0-9]+)*)_MOUNT$` rows with non-empty values
  (falsy/whitespace = dormant) (v2 regex; v1 = `[A-Z0-9]+` only).
2. For each, in stable (sorted) order: `await import(<vendoredDir>/<id>/<id>.js)` and
  call `attach(app, settings)`.
3. **Silent-fail per feature** (the frontend wrapper's rule): import or attach failure is
  logged to console.error and SKIPPED — a broken feature must never break the host boot.
  Other features still mount.
4. Returns the list of mounted feature ids (for logging/tests).
5. Loader is dependency-free; the vendoredDir defaults to `./` relative to the loader file
  (consumers vendor `features/loader.js`; feature dirs sit beside it).

## Slot registry

The slot a feature typically occupies (naming lives in know/entries/feature-slots.md):

- `backend-req` — HTTP-layer recipe executor. Resident: feat `req` v1.
- `backend-thru` — HTTP-layer pass-through. Resident: feat `thru` (py; predates the
  loader, registered directly for now).
- `backend-get-updates` — runtime info endpoint (version/framework/packages/features/envs).
  Resident: feat `get-updates` v1.

## Versions

- **v2** (2026-11-21) — IDs may contain underscores; dir id = lowercased with `_`→`-`
  (`FEAT_GET_UPDATES_MOUNT` → `features/get-updates/get-updates.js`). Settings pass-through
  unchanged. Known edge: a mounted ID that is an underscore-prefix of another mounted ID
  (GET vs GET_UPDATES) makes the shorter one's settings collection see the longer one's
  rows — avoid prefix-overlapping IDs. Single-word IDs behave exactly as v1.
- **v1** (2026-11-20) — original: `[A-Z0-9]+` IDs only.
