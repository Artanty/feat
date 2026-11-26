# backend-slots

`features/loader/v3` (`js-node` namespace) — named-slot mounting of backend features:
WHO fills a slot is config (env), WHERE the slot sits is host code, the feature
declares its kind + defaults. The backend twin of the frontend FeatureSlot pattern;
seed of the backend-skeleton vision (know/entries/feature-slots.md). Spec-first:
`back/spec/backend-slots.md` is the contract, `back/test/backend-slots.test.mjs` pins it.
The one-glance slot map (web + back) lives in `docs/feature-slots.md` — update it when
adding a feature or slot.

## Why

Direct integration hardcodes the feature in the project (`import { attachReq } …`) —
every feature change touches app code. With the loader, the app declares slots and the
deploy config (env rows, the same channel as `FEAT_THRU=true`) decides what fills each
one. Flipping a feature = an env change, not a rebuild. And since v2.1 the consumer
vendors ONLY `loader.js` — features are fetched from the feat host at boot.

## How it works

Consumers vendor `loader.js` (+ `loader.d.ts`) once as `features/loader.js`. Simple
hosts (HTTP routes only):

```js
import { mountBackendFeatures } from './features/loader.js';
await mountBackendFeatures(app);
```

Hosts with middleware positions (e.g. an auth-interceptor slot before TOTP):

```js
import { createFeatLoader } from './features/loader.js';
const feat = createFeatLoader();
app.use(express.json());
app.use(feat.slot('pre-auth'));   // anchor — WHERE is host knowledge
await feat.mount(app);            // SLOT rows fill anchors + routes
```

Config env rows (read at mount time):

- `FEAT_<ID>_SLOT=<slotName>` — required toggle: which slot the feature fills
  (`route` built-in, or a host anchor name). Absent = dormant.
- `FEAT_<ID>_VERSION=vN|latest` — optional (v4): pin the feature version; default
  latest. Required envs from the feat host's `/catalog.json` are validated before
  mounting (missing rows → feature skipped with an error naming them).
- `FEAT_<ID>_MOUNT=<path|true>` — optional route-path override; `true` (recommended,
  or just omit) = the feature's own `defaultMount`, so canonical endpoint paths are
  identical across projects.
- `FEAT_<ID>_<SETTING>` — feature settings, verbatim.
- `FEAT_URL=<feat host>` — remote resolution for features without a local pinned copy:
  manifest latest → js-node main file → imported via `data:` URL (nothing written to
  the repo; local `features/<id>/<id>.js` pins win).

Feature entries: `kind 'route'` (defaultMount + routes map), `kind 'middleware'`
(middleware fn, fills a host anchor, sorted-id order), or legacy `attach(app,
settings)` (req v1). Failures are logged and skipped per feature — a broken feature
or an unreachable feat host never breaks the host boot. Dependency-free ESM.

## Slots

| slot | resident | notes |
|---|---|---|
| `route` (built-in) | feat `get-updates` v2 | kind-route; canonical path from defaultMount (docs/get-updates.md) |
| `route` (built-in) | feat `req` v1 | legacy attach entry (docs/req.md) |
| `backend-thru` | feat `thru` (py) | predates the loader, registered directly for now |
| host-named anchors (e.g. `pre-auth`) | — | for future middleware features (auth-interceptor) |

## Versions

- **v4** (2026-11-26) — `_VERSION` pins + `/catalog.json` required-env validation;
  platform rule (namespace = loader identity).
- **v3** (2026-11-22) — named slots: `_SLOT` row is the required toggle; `_MOUNT`
  optional override (`true` = feature defaultMount); route/middleware kinds;
  `createFeatLoader()` + `feat.slot()` anchors; legacy attach() supported.
- **v2** (2026-11-21 + v2.1 2026-11-22) — underscore IDs (`_`→`-` dirs); remote
  resolution via `FEAT_URL` — loader.js is the only vendored file.
- **v1** (2026-11-20) — `mountBackendFeatures(app, opts)`, `FEAT_<ID>_MOUNT`
  toggle+placement, local vendored features only; `req` v1 the first attach()-shaped
  feature.
