# DECISIONS

## 2026-11-22 (1) — RESULT: global-loading v1 sdui namespace added (DONE, not deployed)

- `back/features/global-loading/v1/sdui/envelope.json` created; served at
  `/global-loading/v1/sdui/envelope.json` (verified locally on :5477). js-web
  overlay untouched. Card: DivKit `gif` spinner (animated-SVG data URL — CSS
  keyframes inside the SVG animate under <img>, no network request, passes ext
  contracts validateEnvelope) + "loading…" text themed via the ext host's shared
  `theme` global. Root height wrap_content (DivKit-web sizes card roots to
  content; the ext host centers it with flexbox).
- Consumed by ext: shown in the side-panel card host while a tab's envelope is
  loading (stat via thru can take ~30s). Needs feat redeploy for prod.

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


## 2026-11-22 (5) — RESULT: FLOW_BACK_DOMAIN → FLOW_BACK_URL rename (docs/examples)

User decision after dropping the req v2 caller-template idea (security: caller-supplied
target + ${ENV} header refs = secret exfiltration on authless hosts — redeploy v2 NOT
built, req v1 env-recipe design stays). Rename applied to stat/back/.env.example,
safe/back/.env.example, feat back/spec/req.md + docs/req.md + test/req.test.mjs example
env (row + ref together); req suite 14/14. NOT touched: req v1 source comments (published
version) + safe's vendored req.js copy + DECISIONS history. CAVEAT: if safe PROD env
storage has a live FLOW_BACK_DOMAIN row, rename it + its FEAT_REQ_*_TARGET ref together
(unset ref → 500). stat recipe rows not live yet — unaffected. Nothing committed.


## 2026-11-23 — PLAN: doctrine fix — retrigger/thru knowledge leaves stat@web

User: stat app must not know about retrigger or thru — features are injected into
slots, env/config rules what-goes-where. Yesterday's retriggerRun patch (api.service
constructing thru + req URLs) violated that. Plan: (1) feat redeploy v2 (js-web) gains
an optional `thru` attr — when set, the click sends GET <thru>?target=<src>&method=
post&body={"project"}&timeout_s (default 120, attr timeout-s) — thru-knowledge lives in
the FEATURE; URLs are attrs (config data). (2) stat web: new slot `run-retrigger`
filled by redeploy v2 (constant config row in feat.ts, src=BACKEND_URL/req/retrigger,
thru=FEAT_URL/thru); DeployTab's bespoke ↻ button+retriggerRun replaced by
<FeatureSlot slot="run-retrigger" attrs={{project, namespace}}/>; retriggerRun + THRU_URL
row deleted from api.service/.env. (3) docs: redeploy spec/docs v2, feature-slots
skeleton + know (new run-retrigger slot), tests (redeploy-v2 thru URL pin), suites,
stat tsc, DECISIONS/memory. NOT committed.

## 2026-11-23 — RESULT: redeploy v2 (thru transport) + stat run-retrigger slot — doctrine restored

User caught a doctrine violation: stat web's retriggerRun knew about the retrigger
recipe AND the thru transport. Fixed by moving knowledge into features/slots:
- feat redeploy v2 (back/features/redeploy/v2/js-web/): optional attrs `thru` (base of
  a thru route) + `timeout-s` (default 120) — thru mode sends GET
  <thru>?target=<src>&method=post&body={"project"}&timeout_s instead of the direct
  POST; direct mode byte-identical to v1. Spec/docs updated (v2 rows, use case:
  sleeping src backend + unanswered CORS preflight). Tests back/test/redeploy-v2.test.mjs
  (4) — feat suite now 135/135 (v1 redeploy suite still pins v1).
- stat web: FeatureConfig gained optional build-time `attrs` (merged under usage attrs
  in FeatureSlot); new constant row `run-retrigger` → redeploy v2 with
  src=BACKEND_URL/req/retrigger, thru=FEAT_URL/thru (URLs from env = config data);
  DeployTab's bespoke ↻ button/retriggering state replaced by
  <FeatureSlot slot="run-retrigger" attrs={{project, namespace}}/>; retriggerRun +
  THRU_URL row deleted from api.service.ts/.env (the 2026-11-22 (15) thru patch is
  superseded by this). tsc: only pre-existing rc-picker error; parcel build clean.
- Skeleton + know feature-slots: `run-retrigger` slot documented (web slots table,
  diagram, consumers row). NOT committed; stat -d pending; redeploy v2 needs feat -d
  first (stat's slot loads it from the feat host at runtime — until feat deploys, the
  slot stays dark by design (silent-fail), no harm).

## 2026-11-23 (2) — PLAN: redeploy v3 — attrs read at click time (stale-attribute bug)

User bug: switching runs in stat DeployTab then clicking redeploy sent the PREVIOUS
run's project (stat@back while viewing tik@back). Cause: v2 reads src/project/
namespace/thru once in connectedCallback and closes over them; React updates attrs on
the SAME element when the selected run changes, but the component never re-reads
(no attributeChangedCallback). Fix: all attrs read lazily inside the click handler
(+ title/labels recomputed from current attrs); required-attr validation stays at
connect (renders nothing). v3 dir (v2 is published/deployed in tag 0.0.44 — never edit
in place); stat feat.ts row pins v3. Tests pin the lazy reads. Needs feat -d.

## 2026-11-23 (2) — RESULT: redeploy v3 (click-time attrs) shipped, 141/141

v3 = v2 + attr() helper; ALL attrs read inside the click handler; title/labels and
redeploy:done detail built from click-time values (refreshTitle helper). Required-attr
check stays at connect (renders nothing when missing at mount). Spec/docs v3 rows.
Tests back/test/redeploy-v3.test.mjs (6: legacy pins adapted + stale-attr pins) — feat
suite **141/141**. stat web feat.ts row pins redeploy v3 (tsc/build unaffected —
version string only). Fix ships only after feat -d (v3 on the feat host); until then
stat's slot 404s silently and stays dark — deploy feat first, no stat deploy needed
(BOOTS from the host each load).
