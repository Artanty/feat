# get-updates

`features/get-updates/v1` (`js-node` namespace) — the `/get-updates` runtime info endpoint
as a vendored backend feature: deploy identity, framework, package versions, mounted
feat features, and which envs are set. Standardizes the hand-rolled `/get-updates`
routes in key/safe/totp/flow. Spec-first: `back/spec/get-updates.md` is the contract,
`back/test/get-updates.test.mjs` pins it.

## How it works

Consumers vendor `get-updates.js` (+ `get-updates.d.ts`) as `features/get-updates/get-updates.js` beside the
backend-slots loader, and mount via config (no feature import in app code):

```js
import { mountBackendFeatures } from './features/loader.js';
await mountBackendFeatures(app);
```

Env row `FEAT_GET_UPDATES_MOUNT=/get-updates` enables + places it (absent = dormant).
Slot: `backend-get-updates`.

`GET /get-updates` responds (fields never omitted, `null` when no source):

```json
{
  "version": "v1.2.3",
  "framework": "express@^4.21.2",
  "commit_id": "abc1234",
  "commit_message": "fix: thing -d;",
  "project_id": "123",
  "slave_repo": "user/safe",
  "namespace": "prod",
  "packages": { "express": "^4.21.2", "prisma": "^6.0.0" },
  "features": ["get-updates", "req"],
  "envs": { "TAG_VERSION": true, "PORT": true }
}
```

- identity: env rows `TAG_VERSION` / `COMMIT_ID` / `COMMIT` / `PROJECT_ID` /
  `SLAVE_REPO` / `NAMESPACE` (same CI-injected set the sibling backends use);
  `version` falls back to the consumer's `package.json` version.
- `framework`: first match in priority `@nestjs/core`(nest) > express > fastify > koa >
  hapi among `packages`; `unknown` otherwise.
- `packages`: `dependencies` + `devDependencies` of `<cwd>/package.json` (ranges
  verbatim; `{}` when absent/unreadable).
- `features`: sorted ids of mounted backend features (`FEAT_*_MOUNT` rows, loader-v2
  naming: `FEAT_GET_UPDATES_MOUNT` → id `get-updates`); optional
  `FEAT_GET_UPDATES_FEATURES=a,b` overrides verbatim.
- `envs`: presence map only — **values are never reported** (secret-safe).
- CORS `*` on every response.

## Auth warning

The endpoint leaks env NAMES and package versions — mount it behind the host's auth
when those are sensitive (e.g. safe's `requireTotpSession`); placement is the host's
business (backend-slots contract). Project-specific extras the siblings add (logs,
urls, stat pings) stay in their own wrapper routes.

## Consumers

- (none yet — candidates: key, safe, totp, flow replacing their hand-rolled routes)

## Versions

- **v2 (planned)** — adds `logs` (like safe/totp: `{ log, error, start }` from the
  consumer's logger) and switches every field EXCEPT `features` to env-injected values
  (env rows as the single source — no package.json reading for
  version/framework/packages; `features` stays `FEAT_*_MOUNT`-derived).
- **v1** (2026-11-21) — js-node namespace: `collectInfo`, `createGetUpdatesHandler`,
  `attachGetUpdates`, standard `attach(app, settings)`.
