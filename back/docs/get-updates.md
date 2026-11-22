# get-updates

`features/get-updates/v2` (`js-node` namespace) — the `/get-updates` runtime info endpoint
as a remote-loaded backend feature: deploy identity, framework, package versions, filled
feat slots, and which envs are set. Standardizes the hand-rolled `/get-updates`
routes in key/safe/totp/flow. Spec-first: `back/spec/get-updates.md` is the contract,
`back/test/get-updates.test.mjs` pins it.

## How it works

Consumers carry NO copy of the feature. The backend-slots loader (v3) fetches it from
the feat host at boot (`FEAT_URL`) and registers it in the built-in `route` slot:

```js
import { mountBackendFeatures } from './features/loader.js';
await mountBackendFeatures(app);
```

Env rows: `FEAT_GET_UPDATES_SLOT=route` enables it; optional
`FEAT_GET_UPDATES_MOUNT=<path|true>` overrides the path (`true` = the feature's
`defaultMount` — recommended so the endpoint is identical across projects).

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
- `features`: sorted ids of filled backend slots (`FEAT_*_SLOT` rows, loader v3);
  optional `FEAT_GET_UPDATES_FEATURES=a,b` overrides verbatim.
- `envs`: presence map only — **values are never reported** (secret-safe).
- CORS `*` on every response.

## Auth warning

The endpoint leaks env NAMES and package versions — place it behind the host's auth
when those are sensitive (e.g. safe's `requireTotpSession`); placement is the host's
business (backend-slots contract). Project-specific extras the siblings add (logs,
urls, stat pings) stay in their own wrapper routes.

## Consumers

- stat@back (remote-loaded via loader v3, dormant until `FEAT_GET_UPDATES_SLOT=route`)

## Versions

- **v2** (2026-11-22) — backend-slots v3 entry: `kind 'route'` + `defaultMount`
  '/get-updates' + `routes` map (no attach boilerplate); `features` from `_SLOT` rows.
- **v1** (2026-11-21) — legacy `attach(app, settings)` entry; `features` from `_MOUNT`
  rows. Stays accessible.
- **planned v3** — adds `logs` (like safe/totp: `{ log, error, start }` from the
  consumer's logger) and switches every field EXCEPT `features` to env-injected values
  (env rows as the single source — no package.json reading for
  version/framework/packages).
