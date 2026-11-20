# DECISIONS

## 2026-11-21 (5) — RESULT: naming convention settled — kebab everywhere, loader = sole translator

Rule 3 written to know/entries/rules.md after weighing four options with the user:
(a) one-word ids — rejected: features must be usable in web AND back, and one name must
cover all namespaces; (b) hyphens inside env names — rejected: shells can't set them,
k8s/CI/systemic platforms forbid them, no ${} expansion, forks rule 0; (c) snake_case
backend ids — rejected: same cross-namespace problem (frontend forced to kebab);
(d) WINNER: kebab-case feature names everywhere + UPPER_SNAKE env IDs
(`FEAT_GET_UPDATES_MOUNT`), with the `-`↔`_` translation ONLY inside the backend-slots
loader (≥v2). No code changes — get-updates + loader v2 as shipped already implement
it; node suite re-verified 116/116. version-display confirmed good/complementary:
frontend <deploy-info> badge (display) vs get-updates (backend JSON provider); a future
src wiring needs a field shim (commit/repo vs commit_id/slave_repo). NOT deployed.
Addendum same day: rule 3 gained the collision-audit clause — check mounted env IDs for
underscore-prefix overlaps (FEAT_GET_ vs FEAT_GET_UPDATES_) when adding/renaming
features and periodically; on collision rename the SHORTER feature.

## 2026-11-21 (4) — PLAN: (superseded by (5) before execution — feature stays `get-updates`)

## 2026-11-21 (3) — RESULT: renamed `get-updates`; loader v2 (underscore IDs), 116/116

Done, nothing committed. Renamed everything getupd → get-updates (spec/docs/test dirs +
files, function names attachGetUpdates/createGetUpdatesHandler, env rows
FEAT_GET_UPDATES_MOUNT / FEAT_GET_UPDATES_FEATURES, slot backend-get-updates). Because
loader v1's regex rejects underscores, shipped `back/features/loader/v2/js-node/`
(copy of v1 + ID regex `FEAT_([A-Z0-9]+(_[A-Z0-9]+)*)_MOUNT`, dir id = lowercase with
`_`→`-`; single-word ids byte-identical behavior). backend-slots spec/docs got v2
sections incl. the known prefix-overlap settings edge (GET vs GET_UPDATES).
get-updates.js mountedFeatures applies the same `_`→`-` mapping (features report
hyphenated ids). get-updates docs gained the v2 (planned) roadmap row: adds `logs`
({log,error,start} like safe/totp) and all fields EXCEPT features become env-injected
(no package.json reading). Tests: get-updates suite renamed (10) + 2 new v2 loader
cases (underscore dir mount + real get-updates attach through v2 loader) — node suite
**116/116**. NOT deployed (needs -d;); stat/safe consumers re-vendoring loader v2 is
optional (v1 keeps working for single-word ids).

## 2026-11-21 (3) — PLAN: rename `getupd` → `get-updates`; loader v2 (underscore IDs)

User direction: (1) feature name is `get-updates` (not getupd); (2) docs get a v2
roadmap row: adds logs, all fields sourced from envs except `features`.
Consequence: mount row becomes FEAT_GET_UPDATES_MOUNT, which loader v1's regex
(`[A-Z0-9]+`) rejects → loader v2: ID may contain underscores, dir id = lowercase with
`_`→`-` (GET_UPDATES → features/get-updates/get-updates.js); back-compatible (REQ → req).
1. Rename spec/docs/test/feature dirs+files getupd→get-updates; env rows
   FEAT_GETUPD_* → FEAT_GET_UPDATES_*; slot backend-getupd → backend-get-updates.
2. `back/features/loader/v2/js-node/` (copy v1 + underscore-ID mapping, settings
   collection unchanged); backend-slots spec+docs v2 section/row.
3. Tests: update get-updates suite; backend-slots tests + v2 cases (underscore id →
   hyphen dir, settings pass-through, single-word back-compat). Run suites. Not deployed.

## 2026-11-21 (2) — RESULT: `getupd` v1 shipped (js-node), node suite 114/114

Done, nothing committed. Spec-first: `back/spec/getupd.md` + `back/test/getupd.test.mjs`
(10 cases) + `back/features/getupd/v1/js-node/` (getupd.js/.d.ts/index.js, envelope-only
no src mirror) + `back/docs/getupd.md` + `backend-getupd` slot rows in backend-slots
spec+docs. Full node suite 114/114. Feature id `getupd` (loader needs upper-snake
FEAT_GETUPD_MOUNT + vendored features/getupd/getupd.js); mount path keeps the sibling
convention /get-updates. Identity from CI env rows (TAG_VERSION/COMMIT_ID/COMMIT/
PROJECT_ID/SLAVE_REPO/NAMESPACE, version falls back to package.json); framework by
priority nest>express>fastify>koa>hapi from packages; packages = deps+devDeps verbatim;
features = FEAT_*_MOUNT ids (FEAT_GETUPD_FEATURES overrides); envs = presence map,
values NEVER sent. NOT deployed (needs -d;). Wiring key/safe/totp/flow onto it =
separate per-project follow-ups. DECISIONS rotated this session (450+ → current thread).

## 2026-11-21 (2) — PLAN: `getupd` v1 (js-node) — get-updates runtime info endpoint

User request: standardize the ad-hoc /get-updates endpoints (key/safe/totp/flow) as one
vendored feat backend feature reading from envs. Choices (recommended defaults, user
unavailable): js-node only; packages parsed from the consumer's package.json; envs as
presence map (no values — secret-safe, matches siblings); features = mounted feat slots
(FEAT_*_MOUNT rows). Sibling extras (logs/urls/stat pings) stay per-project wrappers.

1. `back/spec/getupd.md` — contract: response JSON (version/framework/packages/features/
   envs + commit_id/commit_message/project_id/slave_repo/namespace, null when absent,
   fields never omitted), data sources, attach(app, settings) entry, FEAT_GETUPD_MOUNT
   (default path /get-updates), slot `backend-getupd` row in backend-slots spec+docs.
2. `back/features/getupd/v1/js-node/` — getupd.js (collectInfo({env,cwd}) +
   createGetupdHandler + attach; dependency-free ESM), getupd.d.ts, index.js entry.
   Envelope-only (no src mirror, version-display v5 precedent).
3. `back/test/getupd.test.mjs` — node:test vs shipped copy: defaults with empty env,
   env presence map, package.json parsing (tmp fixture), framework detection, FEAT_*
   features derivation, attach registers route on a fake app.
4. `back/docs/getupd.md` — vendor/mount docs + auth warning (env NAMES leak).
5. Run suites; RESULT entry. Not deployed (needs -d;). DECISIONS rotated this session.

--- rotated to DECISIONS-archive.md (2026-11-21, ~450 → current-thread-only) — see DECISIONS-archive.md for prior history
