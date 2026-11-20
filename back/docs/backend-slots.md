# backend-slots

`features/loader/v1` (`js-node` namespace) — config-driven mounting of backend features:
the project knows SLOTS, config decides which vendored feature fills each slot. The
backend twin of the frontend FeatureSlot pattern; seed of the backend-skeleton vision
(know/entries/feature-slots.md). Spec-first: `back/spec/backend-slots.md` is the contract,
`back/test/backend-slots.test.mjs` pins it.

## Why

Direct integration hardcodes the feature in the project (`import { attachReq } …`) — every
feature change touches app code. With the loader, the app declares one slot call and the
deploy config (env rows, the same channel as `FEAT_THRU=true`) decides what is mounted
where. Flipping a feature = an env change, not a rebuild.

## How it works

Consumers vendor `loader.js` (+ `loader.d.ts`) once as `features/loader.js`; feature dirs
sit beside it (`features/<id>/<id>.js`). The app calls:

```js
import { mountBackendFeatures } from './features/loader.js';
await mountBackendFeatures(app);
```

Config env rows (read at mount time): `FEAT_<ID>_MOUNT=<path>` — present means the
vendored feature is attached (path passed as placement), absent/empty means dormant.
Extra `FEAT_<ID>_<SETTING>` rows pass through verbatim as feature settings.

Every backend feature ships the standard entry `attach(app, settings)` (mount path in
`settings.mount`). Failures are logged and skipped per feature — a broken feature never
breaks the host boot. Dependency-free ESM.

## Slots

| slot | resident | notes |
|---|---|---|
| `backend-req` | feat `req` v1 | HTTP-layer recipe executor (docs/req.md) |
| `backend-thru` | feat `thru` (py) | predates the loader, registered directly for now |
| `backend-get-updates` | feat `get-updates` v1 | runtime info endpoint (docs/get-updates.md) |

## Versions

- **v2** (2026-11-21) — js-node namespace: IDs may contain underscores; dir id =
  lowercased with `_`→`-` (`FEAT_GET_UPDATES_MOUNT` → `features/get-updates/`).
  Single-word IDs behave exactly as v1.
- **v1** (2026-11-20) — js-node namespace: `mountBackendFeatures(app, opts)`,
  `FEAT_<ID>_MOUNT` env contract, silent-fail semantics; `req` v1 is the first
  attach()-shaped feature.
