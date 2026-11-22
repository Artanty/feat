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

## 2026-11-22 — PLAN: loader v2 remote resolution — no vendored feature files in consumers

User correction (stat wiring): consumers must not carry feature files at all
(stat/back/features/get-updates/get-updates.js "should not exist"). The loader becomes
the sole fetcher: for each FEAT_<ID>_MOUNT row, resolve the module LOCAL-FIRST
(vendoredDir features/<id>/<id>.js — pinned/offline installs), else fetch from the feat
host: FEAT_URL env (or opts.featUrl) → GET <base>/manifest.json → features[<id>].latest
→ GET <base>/<id>/<v>/js-node/<id>.js → import via data: URL (single-file modules, no
writes, no repo pollution). No FEAT_URL + no local file → silent-fail per feature.
1. Update loader v2 + spec/docs semantics (remote resolution, FEAT_URL row, js-node ns
   main-file convention <id>.js, data:-URL import, fetchImpl opt for tests).
2. Feat tests: fetch-miss mounts from fake host, local-first priority, no-FEAT_URL skip.
3. stat: rm -rf features/get-updates, re-vendor loader v2, .env.example note (FEAT_URL),
   local e2e with feat flask :5477 → endpoint appears from REMOTE feature only when row
   set; dormant otherwise. DECISIONS in both repos.

## 2026-11-22 — RESULT: loader v2.1 remote resolution shipped, 120/120 + stat e2e

Done, nothing committed. Loader v2 gained remote resolution (spec/docs updated, v2.1
row): local-first features/<id>/<id>.js; otherwise FEAT_URL (or opts.featUrl) →
GET <base>/manifest.json → features[<id>].latest → GET <base>/<id>/<v>/js-node/<id>.js
→ import via data: URL (single-file main module convention; nothing written to the
consumer repo). No local file + no FEAT_URL, unknown feature, or HTTP failure =
silent-fail per feature. New tests: remote mount via injected fetchImpl, local-wins,
no-FEAT_URL skip, unknown-feature skip — suite **120/120**.
stat@back re-wired the v2.1 way: features/get-updates/ DELETED (repo carries only
loader.js/.d.ts + its pinned req copy); .env.example documents commented
FEAT_GET_UPDATES_MOUNT + FEAT_URL rows. E2E local (feat flask :5477 + stat tsx :4577):
with the two rows → GET /get-updates 200, features ["get-updates","req"] (feature code
fetched from feat at boot); without the mount row → 404 route-absent. Both servers
stopped, ports free. Consumers now vendor ONLY loader.js — the original backend-slots
vision, minus the vendoring step. NOT deployed (feat -d pending).


## 2026-11-22 (2) — PLAN: loader v3 + get-updates v2 — named slots (SLOT row + anchors)

User direction: env must explicitly say WHICH SLOT a feature fills (an auth-interceptor
is middleware at a host position, not "a path"); host code says WHERE each slot sits.
Contract: FEAT_<ID>_SLOT=<name> REQUIRED (absent = dormant; _MOUNT becomes optional
route-path override, `true` = feature defaultMount). Feature exports kind
('route'|'middleware') + routes map/defaultMount or middleware fn; legacy attach()
still supported (req v1). Loader API: mountBackendFeatures(app) simple hosts +
createFeatLoader()/feat.slot('name') anchors for middleware positions (sorted-id order
within an anchor; unknown anchor silent-fail). Remote resolution unchanged.
New versions per rules (v2/v1 recorded as shipped): loader v3, get-updates v2 (drops
attach boilerplate → kind/defaultMount/routes). Spec/docs rewrite, tests re-pinned,
stat re-vendors v3 + SLOT rows e2e, rules.md rule 4 + memory updated.


## 2026-11-22 (2) — RESULT: loader v3 (named slots) + get-updates v2 shipped, 131/131

Done, nothing committed. Loader v3 (back/features/loader/v3/js-node/): FEAT_<ID>_SLOT
row is the REQUIRED toggle (absent = dormant); _MOUNT demoted to optional path override
(`true`/absent = feature defaultMount — canonical paths live in the feature, uniform
across projects). Feature entries: kind 'route' (defaultMount + routes map,
'<METHOD> <rel-path>' keys), kind 'middleware' (fills a HOST-PLACED anchor
feat.slot('<name>') via createFeatLoader(); sorted-id order; unplaced anchor =
silent-fail), legacy attach() still supported (req v1 mounts with SLOT row, mount/slot
in settings). Remote resolution unchanged. get-updates v2 (…/v2/js-node/): attach
boilerplate dropped → kind/defaultMount '/get-updates'/routes; `features` field derives
from _SLOT rows. Spec/docs rewritten (backend-slots v3 model + versions; get-updates v2
consumer contract). backend-slots.test.mjs fully re-pinned to v3 (16 cases incl.
anchors order, remote defaultMount, legacy req, real get-updates v2); new
get-updates-v2.test.mjs (10); v1 suites still pin v1. Suite **131/131**.
stat@back: re-vendored loader v3 (tsc clean), .env.example rows → commented
FEAT_GET_UPDATES_SLOT/FEAT_REQ_SLOT. E2E vs feat :5477: SLOT rows only (no paths!) →
get-updates at /get-updates (from defaultMount) + req legacy mounted; no SLOT rows →
both 404 dormant. Servers stopped. Deploy env for stat prod: FEAT_URL +
FEAT_GET_UPDATES_SLOT=route + FEAT_REQ_SLOT=route (feat deploys first). rules.md
rule 4 updated. NOT deployed.


## 2026-11-22 (3) — RESULT: feature-slots skeleton doc (visual slot map, web + back)

User request: keep + occasionally update a skeleton of existing feature slots as a
visual schema in the loader docs. Created `back/docs/feature-slots.md`: ASCII two-column
skeleton (web app slots: app-init/backend-request/app-version/project-header + bus, vs
backend: loader boot → SLOT env → route slot + host anchors), slot/resident tables,
config-row reference, consumers-today matrix (plst/stat/safe/chat), and a maintenance
note (update the map whenever a feature/slot is added — the map shows SLOTS, per-feature
docs stay the detail source). backend-slots.md links to it. know/entries/feature-slots.md
backend section refreshed to loader v3 reality (was stale v1 + duplicated paragraph) and
points at the feat skeleton as the maintained visual map. No code changes; suites
untouched. NOT deployed.


## 2026-11-22 (4) — RESULT: slot docs renamed to web-/back- wording (docs only)

User: both sides are feature slots — label them uniformly. feature-slots.md skeleton +
know/entries/feature-slots.md sections renamed to "web feature slots (web)" /
"back feature slots (back)", with an explicit note that both are feature slots split by
environment and that slot IDs stay as deployed (a uniform web-*/back-* ID scheme would
be a separate migration touching consumer configs). Docs only — no code/config changes.

