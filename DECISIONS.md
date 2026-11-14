# DECISIONS

## 2026-11-14 (12) — RESULT: js-ext http-gate config was captured at load — fixed to lazy

Live bug (plst ext import, 17:53): POST /api/library/scan against the sleeping
snapdeploy died instantly "Failed to fetch", NO wake episode in ext-logs — the gate
was a silent passthrough. Cause: the js-ext adapter read `root.FEAT_GATE_CONFIG` at
script LOAD time, but in the extension popup.js sets the config AFTER the vendor
bundles load → conf={} → createGate's misconfigured=passthrough branch. Fix: capture
the config at FIRST REQUEST (gate() init). Regression test: config set after eval,
NETWORK-only rule, POST rejected while asleep → wake → retry → 200
(http-gate-ext.test.mjs). GOTCHA hit: first run failed because the test evals the
SHIPPED features/ mirror — re-mirrored before rerunning. **53/53**. Mirrored, plst
re-vendored + rebuilt.

## 2026-11-14 (11) — RESULT: js-ext namespaces shipped for wake-up v2 + http-gate v2, 52/52

Done, nothing committed. `back/src/{wake-up,http-gate}/v2/js-ext/index.js` mirrored to
`back/features/` (diff clean except the known pre-existing drift). wake-up js-ext:
`globalThis.featWakeUp.wakeServer(base, opts)` — v2 network core (snapdeploy wake POST
swallow-then-poll `HEAD <base>/healthz`, 3s/185s, single-flight join; different-target
while running rejects immediately), `opts.onState(waking|awake|timeout|error, detail)`
mirrors the web events; `module.exports` for node tests. http-gate js-ext: v2 core
copied verbatim + ext adapter — no bus, `recover` calls `featWakeUp.wakeServer` directly;
config `recovery.target` replaces event/payload; signals `gate-recovering`/`gate-recovered`
→ `config.onState`; `autoPatch` dropped (explicit `featGate.request`). Docs: js-ext
sections in wake-up.md + http-gate.md, consumers rows (plst ext vendoring).
Tests: `back/test/wake-up-ext.test.mjs` (8) + `http-gate-ext.test.mjs` (3) — suite
**52/52**. Test gotchas: single-flight race (wake can FINISH before the second call —
hold the target asleep until after the reject assertion); core tests must inject
`deps.signal` themselves (adapter signal only exists on the adapter instance); a failed
wake must reject (not `.catch()`-swallow) to fail the episode. plst wiring next (its
own DECISIONS).

## 2026-11-14 (11) — PLAN: js-ext namespaces for wake-up v2 + http-gate v2 (Chrome MV3 consumers)

User request: keep features here, add chrome-ext versions of http-gate and wake-up. User
choice on versioning: js-ext goes INSIDE the existing v2 dirs (a new namespace URL is not a
mutation of published content — no version bump for "no new functions"). MV3 CSP
(`script-src 'self'`) forbids loading bundles from feat.twc1.net at runtime → consumers
VENDOR the files (js-node pattern).

Plan:
1. `back/src/wake-up/v2/js-ext/index.js` — port of v2's network core, NO custom element,
   NO featBus (service worker has no shared window). Attaches `globalThis.featWakeUp`
   exposing `wakeServer(base, opts)` → Promise {awake, attempts, elapsedMs, strategy} /
   rejects on timeout. Same logic: snapdeploy/somdip wake POST (swallow failures) →
   HEAD poll `/healthz` every 3s, budget 185s, 503/network = asleep, single-flight join.
   Status surface: `onState(state, detail)` opt-in callback with waking/awake/timeout
   (mirrors web wake-start/wake-awake/wake-timeout) so a popup can render "waking…".
2. `back/src/http-gate/v2/js-ext/index.js` — copy of v2's pure `createGate` core + an
   ext adapter: deps.request = fetch, deps.recover = direct featWakeUp.wakeServer call
   (no bus), config via `globalThis.FEAT_GATE_CONFIG` or args. Same rules semantics.
3. Mirror both to `back/features/…/v2/js-ext/`, `node --check`, `diff -r back/src
   back/features` (ignoring known bus/global-loading drift).
4. `back/docs/wake-up.md` + `http-gate.md`: js-ext sections (Environments, Inputs,
   Outputs, Consumers = plst ext vendor).
5. `back/test/wake-up-ext.test.mjs` + reuse gate core via the js-ext bundle eval:
   host detection, wake POST for snapdeploy only, poll-until-awake, single-flight,
   timeout; gate 503/network → wake → retry once. `node --test` green.
6. plst side (recorded in plst/DECISIONS.md too): vendor sync into `ext/vendor/feat/`,
   manifest wiring, popup call() wake-retry, DEFAULT_SERVER → snapdeploy backend.
Nothing committed.

## 2026-11-14 (10) — RESULT: committed + deployed 9789591 (`-d`)

Commit `9789591` ("http-gate v2 NETWORK rule + feat version badge on docs/root via
version-display -d;") shipped BOTH pending worktrees: http-gate v2 (spec/docs/tests/bundle)
and the version badge. Tag `v0.0.29.0.0.0`, deploy reported success. NOTE: prod lagged
~5 min — /version.json 404 and http-gate/v2 404 right after the deploy message, then all
live (version.json → 0.0.29, v2 → 200, manifest latest v2, badge markup on / and /docs
pages). Don't panic on an immediate-post-deploy 404; recheck after a few minutes before
assuming a failed sync. (This deploy also clears the http-gate v2 "redeploy feat" user
action from (8); plst still needs its own redeploy.)

## 2026-11-14 (9) — RESULT: feat version badge on docs + root page, via version-display — done

`back/app.py` only: `_read_app_version()` parses the pyproject version once at startup
(currently 0.0.28); new `GET /version.json` → `{version, project:'feat',
namespace:'back'}` (no-cache default); VERSION_BADGE_CSS + VERSION_BADGE constants
(script `/version-display/latest/js-web` + `<deploy-info src='/version.json'
manifest='/manifest.json'>`) wired into the top row of `/` (new `<p>` above the h1),
`/docs` index (next to the theme button) and DOCS_PAGE (nav, after the theme button);
host CSS `deploy-info{position:static;display:inline-block;vertical-align:middle}`
overrides the shadow `:host{position:fixed}` — badge flows inline in the top row.
GOTCHA hit: `/version-display/latest/js-web/` WITH trailing slash → 404 (the /latest
route is strict-slash; the redirect target /v4/js-web/ has its own slash route) — use the
slash-less /latest URL in script tags. Browser-verified on :5477: all three pages show
badge `v0.0.28`, position:static, in the top row (root: above h1; docs: inside nav at
y≈36). Server stopped, port free. Not committed — ships with the next `-d`.

## 2026-11-14 (9) — PLAN: feat's own version badge on docs + root page, via version-display

User request: show the current feat version in the top row of the docs pages and the
`/` features index — using feat's own `version-display` feature. Plan: (a) `back/app.py`
reads the pyproject version once at startup and serves `GET /version.json` →
`{version, project:'feat', namespace:'back'}` (no-cache default); (b) DOCS_PAGE, docs_index
and the `/` index get `<script src='/version-display/latest/js-web/'>` +
`<deploy-info src='/version.json' manifest='/manifest.json'>` in the top row, with host CSS
`deploy-info{position:static;display:inline-block}` (outer-page rules override the shadow
`:host{position:fixed;bottom/right}`, so the badge flows inline instead of bottom-right);
(c) verify on :5477 (curl all three pages + browser check the badge shows `v0.0.28` in the
top row on / and /docs), stop server, record result.

## 2026-11-14 (8) — RESULT: http-gate v2 — NETWORK rule (prod HAR diagnosis)

User deployed feat@back (feat.twc1.net) + plst@web (plist.twc1.net); app dead: "cannot
reach the plst server", no features. HAR (read first, per plst rules): `/api/features`
(simple GET) → readable **503**, but every `/api/library/*` (x-user-id/content-type →
CORS preflighted) → **status 0**: the sleeping snapdeploy edge does not answer preflights,
so preflighted calls die as network errors before any status is readable. The gate's
503-only rule passed them through — exactly the caveat recorded in (7)/plst DECISIONS.
Deployed plst bundle verified CURRENT (feat.twc1.net baked in, app-infra rows present;
feat.twc1.net serves all features 200 — local DNS needs dig @1.1.1.1 + --resolve).
Fix: **http-gate v2** (v1 published → new dir, never edit in place): rule `{on:
'NETWORK'}` — transport rejection as recoverable signal; parked NETWORK requests reject
with their ORIGINAL error on failed recovery; `if (root.featGate) return` guard (any
version wins, never double-wrap). Spec + docs updated; tests now pin v2 (41/41, +5
NETWORK tests). plst: row → v2, rules `[{on:'ERROR',trigger:503},{on:'NETWORK'}]`,
70/70 + build ok. E2E with a HAR-faithful fake (preflight dies while asleep, simple GETs
readable 503): wire log reproduced prod exactly — 3 preflight deaths → ONE episode
(NETWORK) → wake HEAD OK → all parked (incl. network-error deaths) retried to 200; bus
log loading-start/request/response/end. KNOWN LIMIT (left): /api/features config fetch
is ungated (raw fetch) and its failed promise is cached forever — app-version badge
needs a reload after first wake; fix later if it bothers. USER ACTION: redeploy BOTH
feat (new v2 route) and plst (v2 row + NETWORK rules). Not committed — say the word.
Prior sessions: `DECISIONS-archive.md` (rotated 2026-11-14).

## 2026-11-14 (7) — RESULT: wake-up v2 bus-late serve + plst wired (companion)

Done, nothing committed. wake-up/v2 serveBus: if featBus is absent at connect, watches
for it (250ms interval, bounded 80 tries ≈ 20s; unwatched on disconnect) — bundles load
in any order by contract. Mirrored to features/, node --check ok, feat suite still green.
Consumed by plst web same day (see plst/DECISIONS 2026-11-14): app-infra slot loads bus +
global-loading + http-gate (script-only rows), app-init wake-up v2 manual; apiFetch goes
through featGate; e2e verified the full chain in plst (park → one wake → retry).

## 2026-11-14 (6) — RESULT: global-loading v1 + event-addressed bus requests, 37/37

Done, nothing committed.
1. **bus v1** (uncommitted → edited in place): `request(event, payload, opts)` — no `to`
   param; routing was already by event (first serve() handler wins), `to` was cosmetic;
   `opts.to` still available for directed requests. feature-contract.md updated. Naming
   stays kebab-case (SCREAMING_CASE rejected — one dialect contract-wide).
2. **global-loading/v1/js-web** (src mirrored) — listens the bus TRANSPORT directly
   (document CustomEvents 'feat-bus', load-order independent, no featBus dependency);
   counter-based: 'global-loading-start'/'global-loading-end' signals show/hide a
   full-screen backdrop (z-index max, pointer-blocking, spinner + "loading…").
   docs/global-loading.md added.
3. **http-gate**: config `recovery:{event, payload}` (.feature dropped — bus addresses
   by event); core gains optional `deps.signal(name)` (throw-safe: UI hint can never
   break recovery) emitting global-loading-start/-end around every episode (resume OR
   fail). Signals come from the GATE not wake-up (decoupling: mounted app-init wakes
   must not block UI; any future provider gets the loader free). Spec + docs updated.
4. **Tests**: 11 gate (new: loading-signal pair incl. end-on-fail) — **37/37** total.
5. **Browser-verified** on :5477 (global-loading loaded FIRST, proving no bus dep):
   bus log `signal:start → request:wake-up → response:wake-up → signal:end` — request
   with NO address resolved fine; overlay visible mid-episode (slow fake backend —
   first check raced a fast wake), elementFromPoint hit-tests at 3 points all land on
   the overlay subtree (blocks interaction), hidden after resume AND on manual signal
   pair. Servers stopped, ports free.

## 2026-11-14 (6) — PLAN: global-loading feature + bus request without address

User requests: (1) full-screen blocking loader while a recovery is pending, as a separate
feature; (2) drop the explicit feature address in bus requests — event name is the address.
Decisions: signals come from the GATE not wake-up (same decoupling argument — the gate
knows traffic is paused; mounted app-init wakes must not block the UI); event names stay
kebab-case (contract-wide convention, SCREAMING_CASE rejected — one naming style only).
Plan: (a) bus v1 (uncommitted → edit in place): `request(event, payload, opts)` — no `to`
param, routing was already by event; update feature-contract.md; (b) http-gate: config
`recovery:{event, payload}` (drop .feature), core gains optional `deps.signal(name)` —
begin/finish episode emit `global-loading-start`/`global-loading-end`; (c) NEW
`global-loading/v1/js-web` — listens bus transport (document CustomEvents, load-order
independent), counter-based show/hide, backdrop + spinner, z-index max; (d) docs:
global-loading.md, http-gate spec+doc, wake-up.md bus lines; (e) tests update + add signal
test; browser verify: request-without-address roundtrip + overlay appears during episode
and blocks interaction. Servers stopped after.

## 2026-11-14 (5) — RESULT: gate decoupled — generic bus-recovery interceptor, 36/36

Done, nothing committed. Config `wake:{feature,target}` → `recovery:{feature, event,
payload}` (payload passed VERBATIM, gate never inspects it); episode semantics
payload-agnostic: bus request RESOLVES → resume (retry parked, release held), REJECTS/
NO_HANDLER/timeout → fail episode (parked original response, held reject
`FEAT_GATE_RECOVERY_FAILED` — renamed from FEAT_GATE_WAKE_FAILED, last wake-specific
wording); gate states idle/recovering/resumed/failed; `.awake` check deleted. wake-up v2
serve handler now REJECTS on timeout/error (Error messages; bus wraps to error envelope);
success payload `{awake, attempts, elapsedMs, strategy}` stays informational; DOM events
unchanged; also fixed hang: noy-unreachable path now fails waiters. Spec + both bundles
mirrored + tests (10 gate, incl. "resolve value irrelevant") + docs/http-gate.md (401 →
refresh-token as second canonical use) + wake-up.md bus lines. **36/36** node tests.
Browser re-verified both paths on :5477: success — 503 → one bus recovery (request+
response) → retry 200, wire log `a 503 → HEAD 503 → HEAD 200 → a 200`; timeout (dead
backend) — bus request+error, parked RESOLVED original 503, held REJECTED
FEAT_GATE_RECOVERY_FAILED, badge "wake timeout". Servers stopped, ports free.

## 2026-11-14 (5) — PLAN: decouple http-gate from wake-up (generic bus-recovery interceptor)

User review: "gate config knows about some 'wake' thing" — coupling. Refactor (all
uncommitted, no consumer → edit in place): config `wake:{feature,target}` → neutral
`recovery:{feature, event, payload}`; gate semantics become payload-agnostic — bus
request RESOLVES → resume (retry parked, release held), REJECTS/NO_HANDLER/timeout →
episode failed (parked original response, held FEAT_GATE_WAKE_FAILED); no `.awake` field
check anywhere. wake-up v2 serve handler: rejects on timeout/error (bus wraps to error
envelope) instead of resolving awake:false; DOM events unchanged; success payload stays
informational. Spec + gate + wake-up v2 + tests + docs/http-gate.md (401→refresh-token
as the second canonical use) + wake-up.md bus line. Verify: full node suite + browser
chain incl. timeout path. This removes the LAST wake-specific knowledge from the gate:
wake-up is now just one recovery provider.

## 2026-11-14 (4) — RESULT: http-gate v1 + wake-up v2 shipped, 35/35 tests, browser-verified

Done, nothing committed (rule 5). Follow-ups (separate tasks): plst fetch-layer wiring,
`ng` namespace adapter when host consumes.
1. **spec/http-gate.md** — cross-framework contract: config schema (rules
   `{on:'ERROR', trigger:<status>, url_pattern?}` from host prior art — the sleeping
   signal is data, not hardcoded 503; wake `{feature, target}`; timeoutMs MUST exceed
   wake budget since the bus default is 5s); single-flight semantics (one wake/episode,
   hold-before-send, replay once in order, parked get ORIGINAL response on wake-fail,
   held reject FEAT_GATE_WAKE_FAILED, replayed failures never retrigger, fresh failure
   after a completed cycle = new episode); framework variants = NAMESPACES of one
   version, not versions.
2. **http-gate/v1/js-web** (src mirrored) — ONE consolidated file (bus-style, single
   script tag; deviates from the planned separate gate-core.js — the core is
   `featGate.createGate(config, deps)` in the same file, pure/no-DOM, evals in node for
   tests and is vendored by future ng/axios namespaces): browser adapter exposes
   `window.featGate.request` (fetch drop-in) + optional `autoPatch` of window.fetch +
   `FEAT_GATE_CONFIG` global; misconfig = pure passthrough. BUG found by tests: internal
   pendingWake rethrew with no consumer → unhandledRejection; fixed (finishWake only).
3. **wake-up/v2/js-web** (src mirrored, v1 untouched) — v1 behavior + `manual` attr
   (dormant: invisible, no auto-wake — interceptor-slot shape) + `featBus.serve('wake-up')`
   (payload target/mode/proxy/project, attrs fallback; concurrent requests join the
   in-flight wake; resolves `{awake, attempts, elapsedMs, strategy}` or
   `{awake:false, code:'TIMEOUT'|'ERROR'}` — awake:false RESOLVES, never rejects).
4. **docs** — http-gate.md (feature doc, spec wins), wake-up.md (trigger modes section:
   mounted vs interceptor slot, bus contract, manual attr, v2 row), know feature-slots
   `backend-request` slot entry.
5. **Tests** — back/test/http-gate.test.mjs (evals the shipped features/ bundle):
   9/9 gate + 26 existing = **35/35 green** (`node --test 'test/*.test.mjs'` in back/).
6. **Browser chain on :5477** (bus v1 + wake-up v2 manual + featGate, fake backend :5480
   asleep→awake): one bus wake (log: request+response), badge during wake → "awake",
   traffic sequence exactly per spec — `/api/a` 503 (parked) → HEAD poll 200 → a
   replayed 200 → held `late` released 200, in order. Servers stopped, ports free.
   Cleanup gotcha: another stale flask on :5477 (stale pid file) — kill by lsof PID.

## 2026-11-14 (4) — PLAN: http-gate feature (spec-first) + wake-up v2 bus trigger

User design discussion outcome: wake-up moves from app-init slot to a config-driven
error-interceptor slot (`backend-request`); the single-flight http-gate itself becomes a
feat feature; framework variants = namespaces of one version (spec-first), not versions.
Approved plan: (1) `back/spec/http-gate.md` — cross-framework contract (config schema from
../host InterceptorConfig prior art; single-flight hold/replay/no-retrigger semantics; bus
wiring; adapter responsibilities); (2) `http-gate/v1/js-web` — pure `gate-core.js`
(createGate(config, {request, wake})) + index.js exposing `window.featGate.request`
(fetch drop-in, optional auto-patch of window.fetch); (3) `wake-up/v2/js-web` — v1 kept +
`featBus.serve('wake-up')` (joins in-flight wake, resolves awake/timeout envelope) +
`manual` attr (resident dormant, no auto-wake); (4) docs/http-gate.md + wake-up.md trigger
modes + know feature-slots `backend-request` slot; (5) node:test contract tests for the
core + browser chain check on :5477 (fake 503-then-200 target), stop server after.
feat only; plst wiring + ng namespace later.

## 2026-11-04
- **Task**: bootstrap the project — a runtime web-component library ("lib of features"):
  all versions accessible at once (`feat_URL/{feature}/v{n}/`), separate per-feature bundles
  loaded independently on demand, future feature-toggle without page reload, web-components so
  any framework works. Backend router in Python for Timeweb VH. First feature:
  `version-display`.
- **Plan**: Flask app (`app.py`) serving `features/` — `/<feature>/v<n>/` → `index.js`
  (text/javascript + CORS `*`), `/<feature>/v<n>/<file>` (traversal-guarded by
  send_from_directory), `/<feature>/latest` → 302, `/manifest.json` (versions + latest per
  feature — toggle groundwork), `/healthz`. Feature `features/version-display/v1/index.js`:
  `deploy-info` custom element, attribute-driven (version/project/namespace/commit/repo),
  shadow DOM bottom-right badge, one-liner + click to expand, silent without a real version.
  Vision documented in `~/know/entries/feat.md`.
- **Status**: Done, nothing committed. Live-verified: venv + Flask on :5099 — `GET /version-display/v1/` and `…/index.js` → 200 `text/javascript` + CORS `*`; `/latest` → 302 to `v1/`; `/manifest.json` → correct body; `/healthz` ok; `…/v1/../../app.py` → 404 (traversal guarded); fake feature 404. Multi-version check with a temp test-feature (v1+v3): manifest lists both, `latest` → `v3/`, gap versions fine; temp dir removed. `node --check` on index.js clean. Dev server stopped afterwards (rule 4).

## 2026-11-04 (2)
- **Task**: add a simple index page at `/` listing features, their versions, and the exact
  script paths to connect them — also doubles as a deploy smoke test.
- **Plan**: `GET /` in app.py renders a small inline-HTML page (no template engine): table of
  feature / versions / latest / `<script src>` path, served from the same manifest logic.
  Verify live with Flask, then stop it.
- **Status**: Done (committed locally: "restructure to pipeline shape", "pipeline shape: back/ + pyproject, cache-control headers" — pyproject auto-bumped 0.0.1→0.0.3 via hooks; no -d, no push). Layout: back/{app.py,requirements.txt,features/,pyproject.toml}, build/ (githooklib file:../../githooklib, hooks active via ../githooklib/hooks realpath), master branch. Cache-Control live-verified: /version-display/v1/ → immutable 1y; /latest, /manifest.json, / → no-cache. Flask re-verified from back/ layout.
- **Status**: Done. `GET /` renders inline HTML (no template engine): per feature — name, link to `/latest`, table of version → `<script src="/<feature>/v<n>/">` connect snippet (escaped), plus a manifest.json link. Live-verified on :5099: 200 text/html, feature heading, latest link and the escaped script path for v1 all present; server stopped. Nothing committed.

## 2026-11-04 (3)
- **Task**: restructure to pipeline shape: app → `back/` (+ pyproject.toml version, no package.json), `build/` with local githooklib (`file:../../githooklib`), branch master; router gains Cache-Control (versioned URLs immutable 1y, /latest + /manifest.json no-cache).
- **Status**: Done (committed locally: "restructure to pipeline shape", "pipeline shape: back/ + pyproject, cache-control headers" — pyproject auto-bumped 0.0.1→0.0.3 via hooks; no -d, no push). Layout: back/{app.py,requirements.txt,features/,pyproject.toml}, build/ (githooklib file:../../githooklib, hooks active via ../githooklib/hooks realpath), master branch. Cache-Control live-verified: /version-display/v1/ → immutable 1y; /latest, /manifest.json, / → no-cache. Flask re-verified from back/ layout.

## 2026-11-04 (4)
- **Event**: first real VH-back deploy of feat failed in the slave workflow — `ssh: connect to host vh328.timeweb.ru port 22: Connection timed out` x5, runner IP 20.51.206.83. Envs/key/dist-resolution all fine (failure is TCP, before auth) — NOT a key problem.
- **Diagnosis**: identical signature to the 2026-11-03 plst@web failure (then 172.172.237.185). Verified now: port 22 open 3/3 from the user's machine, and 20.51.206.83 IS in GitHub's official actions ranges (api.github.com/meta). Conclusion: Timeweb drops inbound SSH from GitHub/datacenter IP ranges; affects BOTH VH deploy workflows (web + back). Host-side fix required.
- **Status**: reported to user; options — Timeweb panel/support (SSH source restrictions, DC-range blocking), or a deploy path that avoids inbound SSH (pull-based). No code change; the workflows are correct.
- **Resolution (same day)**: re-triggering the deploy fixed it — new runner IP 4.242.196.92 connected on attempt 1, rsync synced the whole app, passenger restart ran. So the Timeweb SSH block is per-IP flakiness (some runner IPs pass, some are dropped), not a range-wide ban; re-dispatch = new IP = the fix. Recorded as a gotcha in know/entries/deploy-slave.md. feat is now deployed to the VH slot.

## 2026-11-04 (5)
- **Bug 1**: python app rsynced into `feat` but the panel site serves `feat/public_html` — path is per-project data, not code: feat's `REVERSED_PROXY_SLOT` in safe must be set to `feat/public_html` (plst works because its value `plst` matches its site root). No new env needed; user updates the value in safe.
- **Bug 2**: no WSGI entry — added `back/index.wsgi` (Passenger convention: exposes `application`, imports the Flask app). Host-side note: the panel's python env must have flask installed (pip install -r requirements.txt in the slot).
- **Status**: index.wsgi added and committed (bump rides); deploy with -d after the safe path fix.
- **2026-11-05**: re-deploy attempt after HOSTING_SLOT_PATH change: runner 20.172.6.71 DROPPED (Timeweb SSH flakiness, 3rd occurrence). Also noticed: `Deploy target: …:feat` — HOSTING_SLOT_PATH resolved EMPTY, so the safe row isn't reaching the slave .env for this namespace/stage; user to verify the row (stage DEPLOY, namespace back) before re-trigger. IP ledger started in know/entries/deploy-slave.md (3 dropped, 1 ok).

## 2026-11-06
- **Task**: evolve feat into a unified "feature" model with namespaces + add groundwork for
  backend (Node.js) consumers. Discussion decisions:
  - **No runtime toggle anywhere.** Toggle = deploy-time (what's in the published tree IS the
    enabled set) AND, per consumer, its own config (which features/namespaces it loads) —
    toggling is a property of the consuming project, not of this lib.
  - **Namespaces are path parts, not constants**: `/<feature>/v<n>/<ns>/…` where `<ns>` is
    free-form (e.g. `js-web`, `js-node`, `py`). One version = one feature version that may ship
    several namespace implementations simultaneously. Router validates `<ns>` by charset only.
  - **`/manifest.json` removed** — its 3 jobs are gone: versions → `/latest/<ns>` 302, enabled →
    deploy set, langs → namespace paths. Human discovery stays on `/` index page. A machine
    listing can be regenerated later if something actually consumes it.
  - **Layout**: `src/<feature>/v<n>/<ns>/index.<ext>` (source of truth) mirrors
    `back/features/<feature>/v<n>/<ns>/` (published, plain copy for now).
  - **`version-display` converted** to new style: `v1/js-web/index.js`; old `/<feature>/v<n>/`
    (no ns) URLs phase out — clients reconnect via `/<feature>/latest/<ns>`.
  - **`test/` at repo root**: real consumer apps (Angular, Node.js, …) that connect to feat;
    seeded with README this pass, apps are follow-up tasks.
  - Follow-up (not this pass): Node.js express host app (boot-time `/<f>/latest/<ns>` resolve →
    fetch → disk cache → `import()`, narrow ctx registry — its config is its toggle).
- **Plan**: 1) record plan here; 2) create `src/` + move version-display into
  `src/version-display/v1/js-web/`; 3) rewrite `back/app.py` routes (ns-aware, remove manifest,
  index page with namespaces); 4) seed `test/README.md`; 5) live-verify on :5099, stop server;
  6) record status.
- **Status**: Done, nothing committed. Layout: `src/` created (source of truth) and
  `back/features/` now a plain publish of it — `version-display/v1/js-web/index.js` (old
  `v1/index.js` moved, no-ns URLs dead). `back/app.py` rewritten: `PATH_SEGMENT_RE`
  (`[a-z0-9][a-z0-9-]*`) validates feature + ns (ns = free-form path part, not a constant),
  `/<f>/v<n>/<ns>/` serves the namespace's single `index.*` (none→404, multiple→500),
  `/<f>/v<n>/<ns>/<file>` passthrough w/ traversal guard + `text/x-python` mime added,
  `/latest/<ns>` → newest version containing that ns, bare `/latest` → 302 only when
  unambiguous (else 404 w/ hint), `/manifest.json` removed, `/` lists feature/version/ns with
  script snippets (js*) and GET links (others). `test/README.md` seeded at repo root (Angular +
  Node host planned; consumer = its own feature toggle list). Live-verified on :5099 (started
  via `nohup .venv/bin/python -c "from app import app; app.run(port=5099, use_reloader=False)"`
  — plain `python app.py` ignores --port and binds 5000, which macOS ControlCenter holds):
  entry 200 text/javascript + immutable 1y + CORS *; explicit index.js 200; `/latest/js-web`
  and bare `/latest` → 302 `/version-display/v1/js-web/`; `/latest/py` 404; old `/v1/` 404 and
  old `/v1/index.js` 308→404; `/manifest.json` 404; fake feature / bad-charset feature or ns /
  `../../app.py` / `%2e%2e` / `%2e%2e%2f` all 404; `/latest` = no-cache; `/` 200 with snippet.
  Temp multi-lang feature: `v1/py/` → 200 `text/x-python`, `v1/js-node/` → 200
  text/javascript, `/latest/py` + `/latest/js-node` → correct 302s, bare `/latest` with 2 ns →
  404, two `index.*` in one ns → 500; temp dirs removed afterwards (404 re-verified), then
  server stopped (rule 4). Follow-up: Node.js express host (boot-time
  `/latest/<ns>` resolve → fetch → disk cache → `import()`, ctx registry — its config = its
  toggle), Angular consumer in `test/`.

## 2026-11-06 (2)
- **Task**: 1) move `src/` under `back/`; 2) build a simple Angular consumer app in `test/`
  that loads the `version-display` feature, and install Playwright to test it.
- **Plan**: 1) record here; 2) `git mv src back/src` (publish stays `back/src/` →
  `back/features/` plain copy — still manual, no build step yet), update any root references;
  3) scaffold `test/angular/` via Angular CLI (no routing/ssr, standalone, css);
  4) app loads the feature via script tag `http://127.0.0.1:5099/version-display/latest/js-web`
  + `<deploy-info>` in the template with `CUSTOM_ELEMENTS_SCHEMA`; 5) add `@playwright/test`
  with a webServer config that boots BOTH the flask router (:5099, cwd `back/`) and
  `ng serve` (:4200), chromium installed; 6) e2e asserts the shadow-DOM badge renders the
  one-liner and the detail table expands on click; 7) run tests, ensure servers stopped,
  record status.
- **Status**: Done, nothing committed. 1) `src/` moved to `back/src/` (was untracked → plain
  `mv`, not `git mv`); `diff -r back/src back/features` = in sync (plain copy publish, still
  manual). 2) `test/angular/` scaffolded: `@angular/cli@latest` → **Angular 22.2**, TS 6.0,
  standalone, npm. Feature wired: `index.html` loads
  `http://127.0.0.1:5099/version-display/latest/js-web` as a plain script tag; `app.html`
  uses `<deploy-info project="feat" namespace="angular-test" version="1.2.3" …>`;
  `app.ts` sets `schemas: [CUSTOM_ELEMENTS_SCHEMA]` — note Angular 22 rejects `schemas` on
  `ApplicationConfig` (TS2353), it belongs on `@Component.schemas` (NG8001 told us).
  Playwright: `@playwright/test@1.65` + chromium (Chrome for Testing 158, ~290MB cache),
  `test:e2e` script, `playwright.config.ts` boots BOTH servers (flask via
  `.venv/bin/python -c "from app import app; app.run(port=5099…)"` cwd `back/`,
  reuseExistingServer; `ng serve` :4200, reuseExistingServer:false). Test
  `e2e/feature.spec.ts`: asserts the page fetched `:5099/version-display/latest/js-web` AND
  `:5099/version-display/v1/js-web/` (redirect chain), badge in the open shadow root
  (`#badge` → `feat@angular-test v1.2.3` — Playwright pierces shadow DOM), click expands
  `#detail`. Result: **1 passed (4.3s)**; flask access log shows the 302→200 chain. Playwright
  stopped both servers afterwards (4200/5099 free, no dev processes — rule 4 satisfied).
  Run e2e with `cd test/angular && npm run test:e2e`.

## 2026-11-06 (3)
- **Task**: Angular app must load the feature **via runtime request** the way a real app
  would in prod — no baked `<script src>` in index.html.
- **Plan**: 1) record here; 2) add `src/app/feat-loader.ts`: `FeatLoader` service +
  `FEAT_BASE_URL` InjectionToken (factory = dev URL `http://127.0.0.1:5099`; prod provides
  its own host) — `load(feature, ns)` does `fetch(base/<f>/latest/<ns>)` (follows 302),
  takes `res.url` (final immutable versioned URL), dedupes via module-level Set, injects
  `<script>` and awaits onload/onerror; 3) `App` loads `version-display/js-web` in
  `ngOnInit` and displays the resolved URL on the page; 4) remove script tag from
  `index.html`; 5) re-run e2e (same assertions still hold: network chain + shadow badge +
  click); 6) record status + manual run recipe.
- **Status**: Done, nothing committed. New `test/angular/src/app/feat-loader.ts`:
  `FEAT_BASE_URL` InjectionToken (dev factory `http://127.0.0.1:5099`; prod provides its own
  host) + `FeatLoader.load(feature, ns)` = `fetch(base/<f>/latest/<ns>)` with
  `redirect: 'follow'` → `res.url` (final immutable versioned URL) → dedupe via
  module-level `loaded` Set → inject `<script>` and await onload/onerror → return resolved
  URL. `App.ngOnInit()` loads `version-display/js-web`, shows the resolved URL on the page
  (`#feature-url`); `<script>` tag removed from `index.html`. e2e now waits on
  `#feature-url` (first attempt raced: `goto` resolved before the async fetch, network
  array empty — fixed by asserting loader output first, which guarantees both requests
  fired) and additionally asserts the displayed URL = `…/v1/js-web/`. **1 passed (2.5s)**;
  flask log shows 302 `/latest/js-web` → 200 `/v1/js-web/`; Playwright stopped both servers
  (4200/5099 free). Manual run ("like prod"): terminal 1
  `cd back && .venv/bin/python -c "from app import app; app.run(port=5099, use_reloader=False)"`,
  terminal 2 `cd test/angular && npm start`, open http://localhost:4200 — the badge appears
  only after the runtime fetch resolves. e2e: `cd test/angular && npm run test:e2e`
  (boots both servers itself).

## 2026-11-07
- **Task**: extend `version-display` to show serf-provided deploy envs:
  - **initial (collapsed) state**: show ONLY `TAG_VERSION`, format `v1.2.3.4.5.6`
    (serf: `TAG_VERSION=` `git_tag` input → `.env`);
  - **full info (expanded table)**: `TECH_STACK` (new serf detect-tech-stack step) +
    'slave repo' (`TARGET_GIT_REPO` from safe) + 'slave source' (`TARGET_GIT_USER` from safe),
    alongside the existing project/namespace/version/commit/repo.
  - Values reach the browser as attributes on `<deploy-info>` — the consuming page's job
    (server renders them from `.env`); the feature only displays.
- **Plan**: 1) record here; 2) NEW `back/src/version-display/v2/js-web/index.js` (v1 is
  published — never edited in place): attrs `tag-version, tech-stack, slave-repo,
  slave-source` added; badge = `v<tag-version>` only (fallback to old one-liner when no tag);
  silent when neither tag nor real version (dev-version check kept); expanded table lists
  every present attr except `tag-version` (it's the badge); 3) publish copy →
  `back/features/version-display/v2/`; 4) angular consumer passes the new attrs
  (tag-version `1.2.3.4.5.6`, tech-stack `angular`, slave-repo/slave-source samples);
  5) e2e: `/latest/js-web` now resolves to **v2**, badge asserts `v1.2.3.4.5.6`, detail
  asserts the new rows; 6) run e2e, stop servers, record status.
- **Status**: Done, nothing committed. `back/src/version-display/v2/js-web/index.js` (v1
  untouched, still published): attrs `tag-version, tech-stack, slave-repo, slave-source` added;
  **badge = only `normalizeTag(tag-version)` → `v1.2.3.4.5.6`** (prepends `v` if serf's
  `git_tag` lacks it), fallback to v1's `project@namespace vversion` one-liner when no tag,
  silent when neither tag nor real version (v1 dev-version rule kept); expanded table lists
  `project, namespace, version, commit, repo, tech-stack, slave-repo, slave-source` — labels
  rendered with spaces (`tech stack`, `slave repo`, `slave source`), tag row excluded (it IS
  the badge); single `esc()` at insertion point (no mixed escaped/unescaped branches).
  Published copy in sync (`diff -r` clean), `node --check` OK. Angular consumer
  `app.html` passes sample serf values (`tag-version="1.2.3.4.5.6" tech-stack="angular"
  slave-repo="artserf/feat" slave-source="artserf"`) with a comment that a real app renders
  these attrs server-side from `.env` (serf writes `TAG_VERSION`/`TECH_STACK`/`SLAVE_REPO` +
  safe's `TARGET_GIT_USER`/`TARGET_GIT_REPO`). e2e updated: `/latest/js-web` → **v2**,
  badge asserts `v1.2.3.4.5.6`, detail asserts `tech stack`/`slave repo`/`slave source` rows
  + values, and `not.toContainText('tag version')`. Config: `reuseExistingServer:
  !process.env.CI` for :4200 (user runs `ng serve` manually for the prod-like flow; CI boots
  its own). **1 passed**. User had BOTH servers running manually (ng serve :4200 + flask
  :5099) — left running deliberately (their session, rule 4 applies to servers I start).

## 2026-11-07 (2)
- **Bug**: `https://feat.twc1.net/healthz` → nginx 404; `/` → nginx 403.
- **Diagnosis (probed live, read-only)**: the site serves the deployed app dir as a STATIC
  site — Passenger/WSGI never runs. Evidence: `/index.wsgi` → 200 RAW SOURCE with
  `etag`/`accept-ranges` (nginx static module); `/features/version-display/v2/js-web/index.js`
  → 200 static (files ARE in docroot — today's rsync landed correctly); 404 pages are
  nginx's ("not found on this server", not werkzeug's), `/` 403 = no index.html + autoindex
  off. `app.py`/`.env` 403 = nginx deny rules (`.py`, dotfiles) — cannot conclude .env
  exists. `/back/app.py` 404 → app files are at docroot root, not under back/. CONCLUSION:
  host-side panel misconfig (site type = static), NOT nginx routing and NOT app code.
  Logs can't show anything until Passenger executes the app — current evidence already
  pinpoints the misconfig.
- **Plan**: 1) record here; 2) add the requested logs for the NEXT round: `index.wsgi`
  basicConfig(stderr) + try/except around import → `logging.exception(...)` + re-raise (so a
  broken import lands in the panel/Passenger log instead of being invisible), startup banner
  with features dir + feature list; `app.py`: per-request access log line
  (`method path → status`) at INFO to stderr; 3) local verify (import wsgi + one boot/curl/kill
  cycle — stop server after, rule 4); 4) report panel checklist to user (host action, I have
  no panel access): site → app type Python/Passenger, startup file `index.wsgi`, install
  flask in panel env, restart, then curl /healthz; note minor exposure (requirements.txt,
  pyproject.toml, index.wsgi downloadable).
- **Status**: Done, nothing committed. `back/index.wsgi`: basicConfig(stderr) +
  try/except around import → `logging.exception("WSGI import FAILED …")` + re-raise (import
  crash now lands in Passenger/panel log instead of vanishing) + startup banner
  (`WSGI app loaded OK — features_dir=… features=[…]` / `NONE (check deploy!)`).
  `back/app.py`: root-logger basicConfig when run standalone, `log_request` after_request
  (`GET /healthz -> 200` per request → stderr) + dev-server startup banner with feature list.
  Verified locally: `runpy.run_path('index.wsgi')` → banner + `application loaded: app`;
  boot/curl/kill on :5098 (user's :5099 untouched) → healthz 200, latest 302→200, /nope 404,
  all visible in `[feat]` log lines; :5098 stopped after (rule 4). USER ACTION (host-side,
  I have no panel access) to make /healthz work: Timeweb panel → site feat.twc1.net →
  application type must be **Python (Passenger)** (currently static — that's the whole bug),
  startup file `index.wsgi`, install flask into the panel python env
  (`pip install -r requirements.txt` in the slot), restart, then
  `curl -f https://feat.twc1.net/healthz` + check panel log for the `[feat] WSGI app loaded OK`
  banner. Note: `requirements.txt`, `pyproject.toml`, `index.wsgi` are downloadable (minor
  info leak); `.py`/`.env` are already 403'd by nginx rules.

## 2026-11-07 (5) — RESULT: "Forbidden" on / — no Passenger on this host at all; wsgi-script .htaccess is the real serving pattern

Follow-up to (4): user saw Apache "Forbidden" on `https://feat.twc1.net/`. Probes: `/` 403,
`/healthz` 404, `/index.wsgi` **200 RAW SOURCE** — all iso-8859-1 (Apache static, no app
execution). Host investigation: NO passenger module anywhere (no binary, no apache mod, no
process); the only WSGI site that works here is **pyxy**, and it doesn't use Passenger either
— its `.htaccess` uses Apache's `wsgi-script` handler: `AddHandler wsgi-script .wsgi` +
rewrite `^(.*)$ → /index.wsgi/$1` when the file doesn't exist, `index.wsgi` chmod 755
(the handler runs it like CGI). The `touch tmp/restart.txt` convention is a Passenger
thing and is a no-op here — restarts happen because mod_wsgi re-imports when the script
changes (mtime) or by panel action.

**Fix applied and LIVE-verified:**
- Host: wrote `feat/public_html/.htaccess` (pyxy's pattern verbatim) + `chmod 755 index.wsgi`.
  Immediately after: `/healthz` → **200** (Flask, utf-8), `/version-display/latest/js-web` →
  **302 → /v2/js-web/**, `/v1/js-web/` → 200 text/javascript with
  `cache-control: public, max-age=31536000, immutable` + `access-control-allow-origin: *`,
  `/latest` → `cache-control: no-cache`. The whole feat contract works on production.
- Repo: `back/.htaccess` added (same content) and `index.wsgi` mode set 755 so rsync
  (`-rltgoD` preserves perms) ships both on every deploy. `.py`/`.env` stay blocked by the
  nginx rules; `.wsgi` source being fetchable is now moot (the URL executes the app, only
  reachable as `/index.wsgi/<path>` which the app routes).
- know deploy-slave entry updated: Timeweb VH serves python via wsgi-script htaccess, not
  Passenger; restart.txt is best-effort/no-op.

Nothing committed (rule 5).

## 2026-11-07 (4) — RESULT: pip-less host solved with slot venv; only the panel site-type is left

Done, nothing committed (rule 5).
- **`back/requirements.txt`**: `flask>=3.0` → `flask>=2.0` (pip's Requires-Python metadata
  resolves Flask 2.0.3 on the host's py3.6, latest 3.x locally — no upper pin needed).
- **`back/index.wsgi`**: appends `venv/lib/python*/site-packages` to sys.path when `venv/`
  exists in the slot (pyxy pattern — verified: host-side import logs
  `venv site-packages appended` + `WSGI app loaded OK — features=['version-display']`).
- **`back/app.py`**: `-> list[int]` / `-> list[str]` quoted as strings — py3.6 can't parse
  PEP-585 generics (and `from __future__ import annotations` needs 3.7+, so string literals
  are the only 3.6-safe form). Found live on the host (`TypeError: 'type' object is not
  subscriptable`), not by review.
- **serf `deploy.yml` VH-python pip step**: creates `venv` in the slot when missing with
  `python3 -m virtualenv -p "$(command -v python3)" venv` → `virtualenv -p …` → `python3 -m venv`
  (plain `-m venv` is broken on this host: no ensurepip; bare `virtualenv` picks python2 —
  both hit live), then `venv/bin/pip install -r requirements.txt` first, old fallbacks kept.
- **Host fixed for now (SSH over jump)**: `venv` built in `feat/public_html`,
  Flask 2.0.3 + Werkzeug 2.0.3 + Jinja2 3.0.3 installed, `tmp/restart.txt` touched.
- **Verified live**: wsgi imports OK on the host shell. **`https://feat.twc1.net` still
  serves the slot STATIC** (`/index.wsgi` → 200 raw source) — the panel site type is still
  not Python/Passenger, so restart.txt is a no-op. Curl fails from this Mac only because
  the local resolver can't resolve `feat.twc1.net` (dig @1.1.1.1 → 185.114.247.197 works;
  `curl --resolve` pinned OK). **USER ACTION (panel, no access from here): site feat.twc1.net
  → application type Python (Passenger), startup file `index.wsgi`** — then
  `curl -f https://feat.twc1.net/healthz` should be 200 and the panel log should show the
  `[feat] WSGI app loaded OK` banner. Next `-d` deploy will also pass the pip step by itself.
- Temp key copies pulled from safe for the SSH session were deleted after use.

## 2026-11-07 (4) — PLAN: deploy fails — "No module named pip" on the VH host (python 3.6.9)

**Event:** `-d` deploy rsynced fine (via jump), then died at the new pip step:
`/usr/bin/python3: No module named pip; pip3: command not found; pip: command not found` —
workflow correctly did NOT restart; previous (static) state keeps serving.

**Probed live over the jump host (read-only):** host shell python is `/usr/bin/python3` = **3.6.9**,
no pip/ensurepip anywhere; `flask>=3.0` in requirements.txt couldn't install even with pip
(flask 3 needs py≥3.8). **Same box already has the proven pattern**: `~/pyxy/public_html/venv`
(created by `virtualenv`, which exists at `/usr/bin/virtualenv`) holds pip 21.3.1 + Flask 2.0.3,
and pyxy's `index.wsgi` does `sys.path.append(…/venv/lib/python3.6/site-packages)`.

**Plan:**
1. `back/requirements.txt`: `flask>=3.0` → `flask>=2.0` (no upper pin — pip's Requires-Python
   metadata picks 2.0.3 on the 3.6 host, latest 3.x locally).
2. `back/index.wsgi`: insert `venv/lib/pythonX.Y/site-packages` into sys.path when `venv/`
   exists next to the slot (pyxy pattern), before importing app.
3. serf VH-python workflow: pip step prefers slot `venv/bin/pip`, creating `venv` first with
   `python3 -m virtualenv` / `virtualenv` fallback (plain `python3 -m venv` is broken here —
   no ensurepip).
4. Immediate fix on the host (I have SSH): scp updated requirements.txt + index.wsgi, create
   `~/feat/public_html/venv`, `venv/bin/pip install -r requirements.txt`, touch restart,
   curl `/healthz`.
5. Record results here + plst/DECISIONS.md; know entries updated.

## 2026-11-07 (3) — manual pip one-timer → pipeline-managed
- **Change (in serf, see serf/DECISIONS.md 2026-11-07)**: serf's generated VH-python
  `vh-deploy.yml` now runs `pip install -r requirements.txt` in the slot over the deploy SSH
  (after rsync, before restart; failure = job error, NO restart → previous app keeps serving).
  So the checklist item "install flask into the panel env" from (2) is now automated —
  next `-d` deploy installs deps itself. Only remaining manual host step: panel app type =
  Python/Passenger + startup file `index.wsgi`. know entries (deploy-slave, feat) updated.

## 2026-11-07 (6) — dynamic deploy-info v3 + manifest.json back (requested from plst integration)

plst wanted the integration dynamic (user: "i dont like that we know a lot about its work").
Discovery: the live router had **no /manifest.json** (docstring even said "No manifest"; the
know entry was stale — it described the pre-pipeline standalone app.py). Re-added it, plus a
new **v3** element that makes consumers one-attribute-thin. No router changes otherwise;
v1/v2 untouched (verified live: v1 200 immutable, latest 302).

1. `back/app.py`: `GET /manifest.json` → `{features: {<name>: {versions: [vN…], latest: vN}}}`
   (after_request default = no-cache; CORS `*`). Docstring updated (manifest is real again).
2. `features/version-display/v3/js-web/` — split contract:
   - **index.js = stable shell**, defines `<deploy-info>` once (`customElements.get` guard —
     a web-component class can never be redefined, which is WHY logic upgrades ride a module
     instead of a new script). Attributes: `src` (runtime JSON endpoint
     `{version, project, namespace, commit, repo}`), `manifest` (feat manifest URL),
     `refresh` (poll seconds, default 300, 0=off), legacy direct attrs still honored;
     precedence direct attr > src > defaults; `project` falls back to hostname's first label;
     silent without a real version (0.0.0(.0)), unchanged.
   - **render.js = swappable logic** (ES module, `export function render(shadowRoot, data)`,
     markup = v2's). The shell adopts the manifest's `latest` render.js at connect and
     re-adopts on every poll when `latest` moves — toggle without consumer redeploy, no
     element redefinition. The built-in fallback renderer inlined in index.js must stay
     byte-compatible with render.js markup (degrades to the same UI on any fetch failure).
3. **Live-proven end to end** (browser, local feat :5000 + plst back :3299): element fetched
   the version from plst's `/api/version` (real `1.0.16.0.0.27` read from plst's build/.env),
   derived project from hostname, adopted the latest render module, and **hot-swapped to a
   temporary v4 renderer within one 1s poll cycle without reload**; v4 removed after the test.
   `node --check` + module import clean; v1/v2 regression-checked.

Consumer contract now (see know/entries/feat.md):
`<script src="https://feat.twc1.net/version-display/v3/js-web/"></script>` +
`<deploy-info src="/api/version" manifest="https://feat.twc1.net/version-display/manifest.json">`.
Nothing committed (rule 5); **user step: `-d` commit on feat** — plst's badge stays dark until
v3 is live.

## 2026-11-07 (7) — PLAN: SDD seed — spec/ + server features (logging, db-diag) from plst

plst is rewriting its backend to python and wants feat to be the canonical, spec-driven home
of reusable server modules. feat gains `back/spec/` (markdown contracts) and two features with
`js-node` namespaces ported from plst's `back/src/lib` (logging = logger + ext-log, db-diag),
plus node:test contract tests (run `node --test back/test/`; NO package.json — it would flip
githooklib versioning from pyproject to npm). Python implementations arrive later for back-py.
plst vendors the js-node bundles via `back/scripts/sync-features.mjs` and proves them with its
own 121-test suite. RESULT below.

### RESULT — SDD seed in place: spec/ + logging + db-diag, 26/26 contract tests

Done, nothing committed (rule 5). `back/spec/` (logging.md, db-diag.md — contracts with
consumer-vendoring sections), `features/logging/v1/js-node/` (logger.js, ext-log.js + d.ts;
index.js is router-entry only, NOT vendored) and `features/db-diag/v1/js-node/` (dbDiag.js +
d.ts) — verbatim ports of plst's back/src/lib, same export names. `back/test/` — 26 node:test
contract tests, **26/26 green** (`node --test 'back/test/*.test.mjs'`; NO package.json in
back/ — it would flip githooklib versioning from pyproject to npm). Router live-checked:
`/logging/v1/js-node/` 200, `/db-diag/v1/js-node/` 200, extra-file route 200. One design
improvement: `checkDatabase` lazy-imports mysql2 at CALL time (feat has no node_modules;
missing package → classified `unknown` verdict naming the dep, not a load crash) — the module
itself is dependency-free apart from node:net. Consumer (plst) vendored via its
`features:sync` script and proved the port with its full 121-test backend suite + tsc.
README rewritten: SDD rules, namespaces, spec-first workflow. Python implementations (`py/`
namespaces) arrive with plst's back-py.

## 2026-11-08 (2) — PLAN: version-display v4 — badge shows only the version
User request from plst: initial badge state = version only, no project. v4 = v3's shell
(index.js, fallback renderer renamed and aligned) + render.js with one-liner `v<version>`;
project (and namespace/commit/repo) become click-expand rows. RESULT below.

### RESULT — version-display v4: badge one-liner = version only
`features/version-display/v4/js-web/` — index.js shell as v3 (fallback renderer renamed to
renderV4 and aligned), render.js: one-liner `'v' + version`, rows now lead with `project`.
node --check + module import clean; 26/26 js-node contract tests unaffected. Verified through
plst's slot flow in a real browser (local feat): badge `v1.0.17.0.0.28`, expand shows
project/namespace. Not deployed — next feat `-d` commit ships it; consumers pinning v3 keep the
old one-liner (contract intact).

## 2026-11-13 — PLAN: (1) new feature `wake-up` v1 js-web; (2) per-feature docs routes

User request: port noy/back's wake logic to a sharable feat web-component (snapdeploy
cold-start), loaded in a frontend's INIT slot; plus docs routes per feature (.md source of
truth, rendered with Shoelace + marked.js via CDN), and a know entry `web-lifecycle-slots`.
Scope: feat only — plst wiring is a separate later task. User choices: wake runs client-side
direct by default; noy-proxy mode only when consumer passes mode="noy" + proxy attrs
(mapped from their build-time envs FEAT_WAKE_UP_THRU_NOY / NOY_BACK_URL); docs = .md files
rendered on a styled page.

Plan:
1. features/wake-up/v1/js-web/index.js (src mirrored to features/, version-display-v1
   style: IIFE, customElements guard, shadow DOM): element <wake-server>; attrs target /
   mode(direct|noy) / proxy / project / interval(3000) / timeout(185000). Direct mode =
   browser port of noy wakeSnapDeploy (POST snapdeploy.dev/api/public/wake/<sub>, swallow
   failures, then HEAD-poll target; awake = status in {200,204,301,302,401,403,404} and
   not 503). Noy mode = GET {proxy}/make-wake-request?target=...&app=. Events:
   wake-start / wake-awake / wake-timeout (detail attempts/elapsedMs/strategy). Badge UI:
   state + spinner + attempts + elapsed.
2. back/docs/<feature>.md x4 (wake-up, version-display, logging, db-diag) with a fixed
   template: How it works / Environments / Inputs / Outputs & triggers / Lifecycle slot /
   Consumers / Versions.
3. app.py (py3.6-safe): GET /docs (index), GET /docs/<feature> (HTML page, Shoelace +
   marked.js from CDN, fetches the .md client-side), GET /docs/<feature>.md (raw,
   text/markdown, no-cache); manifest gains docs URL per feature; "/" links /docs.
4. know/entries/web-lifecycle-slots.md + README index line.

## 2026-11-13 — RESULT: wake-up v1 + docs routes shipped locally, browser-verified

1. **wake-up v1** — `back/src/wake-up/v1/js-web/index.js` mirrored to `back/features/`.
   Element `<wake-server>`: attrs target/mode(direct|noy)/proxy/project/interval(3000)/
   timeout(185000). Direct = browser port of noy wakeSnapDeploy (wake ping swallow-then-
   poll; awake = status≠503 ∈ {200,204,301,302,401,403,404}; target must send CORS on
   HEAD — plst back reflects any origin). Noy mode = GET {proxy}/make-wake-request.
   Events wake-start/awake/timeout; badge UI with live attempts/elapsed. node --check ok.
   NOTE from testing: attrs must be set via setAttribute (property assignment doesn't
   reflect) — documented implicitly by attribute-driven design.
2. **docs** — `back/docs/{wake-up,version-display,logging,db-diag}.md` (fixed template:
   How it works / Environments / Inputs / Outputs & triggers / Lifecycle slot / Consumers
   / Versions). Routes in app.py (py3.6-safe): GET /docs (index), GET /docs/<feature>
   (HTML, Shoelace 2.20.1 + marked 12 from CDN, fetches the .md), GET /docs/<feature>.md
   (raw, text/markdown). manifest.json entries gain "docs": "/docs/<feature>"; "/" index
   links docs per feature.
3. **know** — entries/web-lifecycle-slots.md created + README index line (slots concept,
   app-init/app-version semantics, plst reference impl).
Verified: local flask — /docs 200, /docs/wake-up 200 (browser: markdown + shoelace alert
rendered), /docs/wake-up.md 200 text/markdown, /docs/missing 404, /wake-up/v1/js-web/ 200,
manifest lists wake-up + docs keys. Browser test on /docs (same origin): mounted
<wake-server target=/healthz interval=1000> → wake-start then wake-awake {attempts:1,
elapsedMs:3, strategy:'snapdeploy'}, badge "awake". First /docs 404 was a stale feat
process on :5000 (old code) — restart fixed it. NOT committed — user ships with -d.
Pending next: plst app-init slot wiring (separate task, user deferred).

## 2026-11-13 (2) — PLAN: feature contract spec + bus v1 (new event interface, from scratch)

User reviewed host/au bus prior art: keep best practices (addressable envelope, correlation
id, event store idea), drop the old integration (no ASK_*/_DONE, no shared BehaviorSubject —
impossible across separate script bundles anyway). New interface design:

Envelope {id, contract:1, kind: signal|request|response|error, from, to, event, payload,
reqId?, ts}; addresses feature@version | host | *; kebab events; JSON payloads. Helper API
(window.featBus, stateless, transport = CustomEvents on document): signal / request(to,
event, payload, {timeoutMs}) / serve(event, handler) / on(pattern) / log() ring buffer.
Error envelopes {code: TIMEOUT|NO_HANDLER|HANDLER_ERROR, message}.

Deliverables: docs/feature-contract.md (spec), features/bus/v1/js-web (helper, IIFE
conventions like wake-up), know/feature-slots.md contract section → pointer to spec.
Verify: node --check, flask routes, browser test (serve+request roundtrip, TIMEOUT and
NO_HANDLER paths, log buffer). Nothing committed.

## 2026-11-14 (3) — PLAN: docs dark mode (dark default, toggle, persisted)

User request: add dark-mode to /docs pages, dark by default. Plan: in `back/app.py`
DOCS_PAGE + docs_index — dark palette as default body styles (bg #16161a / text #ddd,
dark borders/code bg), `body.light` overrides; Shoelace theme link gets an id and swaps
dark.css/light.css on toggle; a small vanilla toggle button in the nav (persists in
localStorage `feat-docs-theme`, default dark). Verify: flask boot on :5477, curl /docs +
/docs/wake-up contain dark.css + toggle, browser check that dark renders + toggle works,
stop server (rule 4).

## 2026-11-14 (3) — RESULT: docs dark mode shipped (dark default + toggle), browser-verified

Done, nothing committed. `back/app.py` DOCS_PAGE + docs_index: dark palette default
(bg #16161a / text #ddd, dark borders + code bg #26262c, links #7ab0ff), `body.light`
overrides; Shoelace theme `<link id='sl-theme'>` swaps dark.css/light.css with the mode;
nav button toggles + persists in localStorage `feat-docs-theme` (default dark, shared by
both pages). Browser-verified on :5477: wake-up page loads dark (body.dark, dark.css,
bg rgb(22,22,26), md rendered) — screenshot confirmed readable dark UI; toggle → light
(white bg, light.css, saved=light), persists across reload; toggled back → dark saved;
/docs index picks the same theme (saved=dark). Gotcha hit AGAIN: an orphaned Werkzeug
reloader child (from the earlier `python app.py` debug run, parent killed) still held
:5477 serving OLD code — first curl showed no dark markers; killed child PID, restarted,
all green. LESSON: `app.run(debug=True)` spawns a reloader child that outlives
`kill <parent>` — kill the process group or run with use_reloader=False. Server stopped,
port free (rule 4). Playwright role=button click timed out twice in IAB (hit-target
quirk) — verified toggle via element.click() in evaluate instead; real handler exercised.

## 2026-11-14 (2) — RESULT: wake-up badge width jitter fixed

Done, nothing committed. `wake-up/v1/js-web/index.js` (src + features mirror, edited in
place — v1 never committed/deployed): badge font was already mono; the jitter was digit
COUNT growth. Elapsed now `toFixed(1).padStart(4)` (`" 1.3s"…`" 9.9s"`…`"20.0s"` — verified
in node, all 4 chars), tries `padStart(2)` (`" 9"`/`"10"`), `.meta` gained
`white-space: pre` so mono padding renders. `node --check` OK, src/features in sync for
wake-up (pre-existing features-only extras: db-diag, logging, version-display v3/v4).
Note: elapsed ≥100s (timeout is 185s default) still grows one char — per user's xx.x spec.
Follow-up same day (user request): widened to padStart(5) = `xxx.x` — covers the full 185s
default timeout (`"  1.3s"` … `"185.0s"`, all 5 chars, verified in node; mirrored + checked).

User report: while waking, the badge content jumps left↔right as numbers grow (1.3 vs 20.0).
Font is already mono; the jitter is the digit COUNT changing. Fix in
`back/src/wake-up/v1/js-web/index.js` (v1 is local-only, never committed/deployed → edit in
place, no version bump): pad elapsed to fixed `xx.x` (toFixed(1).padStart(4)) and attempts
to 2 digits (padStart(2)), `white-space: pre` on .meta so the mono padding renders; mirror
src → features; node --check both.

## 2026-11-14 — RESULT: backend dev port now 5477, e2e green (stale v2 spec fixed to v4)

Done, nothing committed (rule 5). Changes:
1. `back/app.py`: `app.run(debug=True, port=5477)` — plain `python app.py` now binds 5477
   itself (old gotcha "binds 5000, held by macOS ControlCenter" resolved).
2. Angular consumer port refs 5099 → 5477: `playwright.config.ts` (webServer command +
   port + comment), `src/app/feat-loader.ts` (FEAT_BASE_URL dev factory), `test/README.md`.
3. PRE-EXISTING staleness found+fixed while verifying: `e2e/feature.spec.ts` still expected
   version-display **v2** (spec last run 2026-11-07, before v4 shipped 2026-11-08).
   Updated to v4 contract: `/latest/js-web` → `/v4/js-web/`, badge = `v1.2.3` (v4 shows
   version only; tag-version/tech-stack/slave attrs are v2-era and ignored by v4's shell —
   `DATA_KEYS = [version, project, namespace, commit, repo]`), detail rows
   project/namespace/commit/repo, asserts NO 'tech stack'/'tag version' rows.
   Note: `app.html` still passes tag-version/tech-stack/slave attrs (harmless — ignored)
   and its copy says "shows only the tag version" (cosmetically stale for v4) — left as is.
Verified: e2e **1 passed** (flask log: `GET /version-display/latest/js-web 302` →
`GET /version-display/v4/js-web/ 200` through :5477); `python app.py` booted directly →
`curl :5477/healthz` = ok; all servers stopped after (4200/5099/5477 free — rule 4).

## 2026-11-14 — PLAN: backend dev port 5099 → 5477

User request: change the backend server port to 5477. `back/app.py` `__main__` currently
runs `app.run(debug=True)` (Flask default 5000; dev flows pass `port=5099` explicitly).
Plan:
1. `back/app.py`: `app.run(debug=True, port=5477)` — `python app.py` now binds 5477 itself.
2. Update every `:5099` in the angular consumer: `playwright.config.ts` (webServer command
   + port + comment), `src/app/feat-loader.ts` (FEAT_BASE_URL dev factory),
   `e2e/feature.spec.ts` (url assertions), `test/README.md` (dev URL convention).
3. Verify: run e2e (`cd test/angular && npm run test:e2e`) — boots flask on 5477 itself and
   asserts the full load chain through the new port; stop servers after (rule 4).

Prior sessions: `DECISIONS-archive.md` (rotated 2026-11-14).
