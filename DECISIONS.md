# DECISIONS


--- rotated to DECISIONS-archive.md (2026-11-15, 793→current-thread-only) ---
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

## 2026-11-15 — PLAN: wake-up v3 — render 'way' via URL parsing (onrender.com)

User request: stat@back lives on Render free tier (`*.onrender.com`); extend wake-up
with a render wake way. The 'way' (strategy) is selected by PARSING the target URL —
no new attribute/option: `*.onrender.com` → `render`; snapdeploy containers pattern
(`sub.containers.snapdeploy.app|dev|somdip.dev`) → `snapdeploy`; anything else →
`poll` (generic fallback, replaces the hardcoded strategy='snapdeploy').

Plan (v3, new version — v2 is published/vendored by plst ext, never edit in place):
1. `back/src/wake-up/v3/{js-web,js-ext}/index.js` — copy v2, add `detectStrategy(target)`
   (URL hostname match). Direct mode: store strategy; fire the snapdeploy wake POST only
   when strategy==='snapdeploy' (render/poll hosts have no wake API — the poll itself
   triggers the cold start); `succeeded(strategy)` reports the detected way instead of
   hardcoded 'snapdeploy'. Everything else (single-flight, noy mode, bus, badge) unchanged.
2. Mirror both to `back/features/wake-up/v3/…` (manifest auto-discovers versions).
3. `back/docs/wake-up.md`: strategy-detection section, strategy values
   (`snapdeploy|render|poll|noy`), v3 in Versions.
4. `back/test/wake-up-ext-v3.test.mjs` — copy of v2 ext tests against the v3 bundle +
   new cases: onrender.com target → strategy 'render', NO wake POST; unknown host →
   'poll'. Run full suite.

## 2026-11-15 — RESULT: wake-up v3 shipped locally (render way via URL parsing), 64/64

Done, nothing committed. v3 in `back/src/wake-up/v3/{js-web,js-ext}/index.js` (copied
from v2, edited) + mirrored to `back/features/wake-up/v3/`. Changes: `detectStrategy(target)`
parses the target hostname — `*.onrender.com` → 'render', snapdeploy containers pattern →
'snapdeploy', else 'poll'; snapdeploy wake POST fires ONLY for snapdeploy hosts (render/poll
wake from the poll itself); `succeeded()` reports the detected strategy instead of hardcoded
'snapdeploy'; js-ext 'waking' onState detail gained `strategy`, `contract: 3`, `detectStrategy`
exported for tests. Docs `wake-up.md` rewritten How-it-works + strategy values + v3 row.
Tests: new `test/wake-up-ext-v3.test.mjs` (11) incl. detectStrategy unit (onrender.com,
fake-onrender-suffix host → poll), render no-wake-POST, poll fallback — suite **64/64**
(was 52 + new 11 + one v3 re-run of shared? — 53 existing + 11 = 64). Live check: flask dev
on :5477 shows manifest wake-up {latest: v3, versions: [v1,v2,v3]}, /wake-up/v3/{js-web,js-ext}/
200, /latest/js-web 302 → v3. Server stopped, port free (rule 4; python not python3 for
homebrew 3.14). NOTE: /latest now serves v3 — plst consumers on /latest get the render-aware
core automatically; v2 stays pinned-accessible. DECISIONS.md rotated this session (793 lines →
current thread only, rest appended to DECISIONS-archive.md).

## 2026-11-15 — PLAN: main-page dark mode (dark default)

User request: add dark mode to `/`, dark by default, matching the existing docs pages.
Plan: edit only `back/app.py`'s index response — dark default palette with `body.light`
overrides, a theme toggle beside the version badge, and the same `feat-docs-theme`
localStorage persistence/defaulting logic used by `/docs`. Verify the generated page and
toggle behavior with Flask/browser checks; run the existing test suite and stop any dev
server started for verification.

## 2026-11-15 — RESULT: main-page dark mode shipped locally

Done, nothing committed. `back/app.py` `/` now uses the same dark-default/light-optional
palette as the docs pages, with themed links, tables, code, and a toggle beside the version
badge. The toggle shares `feat-docs-theme` with `/docs`, defaults to dark, and persists the
selected mode. Verification: Flask test-client markup assertions passed; live-page JavaScript
checks passed for dark default, dark→light toggle, light persistence across reload, and return
to dark; `py_compile`, 36 pytest tests, and all 64 Node tests passed; `git diff --check` clean.
Desktop browser was unavailable, so behavior was verified against the live page with Node's
VM plus DOM/localStorage stubs rather than a visual browser. Flask verification server stopped;
port 5477 is free.

## 2026-11-15 (2) — RESULT: stat@web wired as js-web consumer (all 4 features)

stat web now loads wake-up v3 (manual, render way for stat-3lmc.onrender.com), bus v1,
global-loading v1, http-gate v2, version-display v4 as baked bootstrap slots from the feat
host (FEAT_URL env; local feat docs Consumers rows updated). Browser-verified against
local feat :5477 (see stat/DECISIONS.md 2026-11-15 (2)). feat itself unchanged — no
version bumps, docs-only edit.
