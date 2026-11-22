# get-updates — feature spec (SDD contract)

When to use: a backend project wants the `/get-updates`-style runtime info endpoint that
key/safe/totp/flow each hand-rolled — deploy identity, framework, package versions,
mounted feat features, and which envs are set — as ONE vendored feature. The response
standardizes those endpoints; project-specific extras (logs, urls, stat pings) stay in
the project's own wrapper routes.

Spec-driven rule: **this file is the contract**. Tests (`back/test/get-updates.test.mjs`) pin
it; an implementation in any language/framework passes when it satisfies both. js-node
first (`py`/fastify namespaces may be added when a consumer needs them).

## Route

    GET /get-updates        # canonical path; the feature's defaultMount

Filled into the built-in `route` slot by the backend-slots loader (v3):
`FEAT_GET_UPDATES_SLOT=route` enables it; optional `FEAT_GET_UPDATES_MOUNT=<path|true>`
overrides the path (`true` = defaultMount — recommended default everywhere so the
endpoint is identical across projects). Placement/auth policy is the host's business —
the endpoint leaks env NAMES (not values), so authed hosts (e.g. safe, totp) must place
it behind their session middleware.

## Response (always 200, single JSON object; fields never omitted, null when no source)

```json
{
  "version": "v1.2.3",
  "framework": "express@4.21.2",
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

Field sources (first non-empty wins; empty env values count as unset):

- `version` — env `TAG_VERSION`, else the `version` field of the consumer's
  `package.json`, else null.
- `framework` — `<name>@<range>` for the first match in priority order
  `@nestjs/core` (reported as `nest`), `express`, `fastify`, `koa`, `hapi` taken from
  `packages`; `unknown` when none matched or no package.json.
- `commit_id` — env `COMMIT_ID`; `commit_message` — env `COMMIT`; `project_id` — env
  `PROJECT_ID`; `slave_repo` — env `SLAVE_REPO`; `namespace` — env `NAMESPACE`.
- `packages` — merged `dependencies` + `devDependencies` of the consumer's
  `package.json` (path `<cwd>/package.json`, values are the declared ranges verbatim);
  `{}` when the file is absent/unreadable/not valid JSON.
- `features` — sorted lowercase ids of every filled backend slot: env rows
  `FEAT_<ID>_SLOT` with a non-empty value (loader-independent fallback = the loader's
  own discovery rule). Optional `FEAT_GET_UPDATES_FEATURES=a,b` row overrides the list
  verbatim (comma-split, trimmed, empties dropped).
- `envs` — presence map: `{ KEY: true }` for every env var whose value is a non-empty
  string. **Values are NEVER reported** (secret-safe — same rule as key/safe/totp/flow).

Every response carries `Access-Control-Allow-Origin: *`.

## API (js-node, v2)

- Module entry (backend-slots v3): `kind = 'route'`, `defaultMount = '/get-updates'`,
  `routes = { 'GET /': handler }` — the loader registers `GET /get-updates`.
- `collectInfo(opts = {})` — `{ env = process.env, cwd = process.cwd() }` → the response
  object. Pure read; throws never (package.json faults degrade to `packages: {}`).
- `createGetUpdatesHandler(opts = {})` — `(req, res)` Express-shaped handler,
  dependency-free (tests drive it with plain objects).

Consumer contract: NO local copy — the loader fetches the feature from the feat host
(`FEAT_URL`) at boot; enable with `FEAT_GET_UPDATES_SLOT=route`
(+ optional `FEAT_GET_UPDATES_MOUNT=true`).

## Versions

- **v2** (2026-11-22) — backend-slots v3 entry: `kind 'route'` + `defaultMount` +
  `routes` map (no attach boilerplate); `features` derives from `_SLOT` rows.
- **v1** (2026-11-21) — legacy `attach(app, settings)` entry; `features` from `_MOUNT`
  rows. Stays accessible; stat consumers should use v2.

## Slot registry

`route` (built-in) — runtime info endpoint. Resident: feat `get-updates` v2.
