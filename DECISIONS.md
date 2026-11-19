# DECISIONS

## 2026-11-19 (2) — RESULT: thru v2 shipped (CORS preflight), py 68 / node 77

Done, nothing committed. `src+features thru/v2/py/`: copy of v1 + explicit `OPTIONS /thru`
preflight (echoes Access-Control-Request-Headers, fallback Content-Type; Max-Age 600) +
ACAM/ACAH setdefault on every response; user-agent `feat-thru/2`; main route
`provide_automatic_options=False`. GOTCHA: Flask's AUTOMATIC OPTIONS handler SHADOWS an
explicit OPTIONS rule on the same URL (automatic wins the werkzeug match) — the first
test run failed with ACAH=Content-Type until the flag landed. `app.py` dogfood bumped
v1→v2 (test_client smoke: OPTIONS /thru → 200 + header echo, no dev server left
running). Tests `test/test_thru_v2_py.py` (6: preflight echo, fallback, response CORS
headers, v1 POST-body contract, GET, 502 envelope) — py suite **68/68**, node suite
77 pass / 0 fail. docs/thru.md: preflight section, v2 row, chat@web consumer row.
NOT deployed — needs feat's `-d` (user); chat@web wiring tracks in chat/DECISIONS.md.


## 2026-11-19 (2) — PLAN: thru v2 (py) — CORS preflight so browsers can POST /thru

Consumer need: chat@web (deployed on the Timeweb VDS) cannot reach its Render-hosted
chat/back from the user's network; it will route API calls through feat's thru (the
stat THRU_URL transport). chat needs POST /thru with a JSON body — targetHeaders carries
auth headers (X-Totp-Auth/X-Relay-Key/X-TG-Token) and targetBody carries Russian-text
bodies that would blow URL limits as GET query params. A cross-origin JSON POST is
preflighted, and v1 answers OPTIONS only via Flask's automatic OPTIONS — no
Access-Control-Allow-Headers → the browser kills the preflight and the POST never flies
(stat dodged this by using GET-only).
Plan (v2 — v1 is published, never edit in place):
1. `back/src/thru/v2/py/` — copy v1; add an explicit `OPTIONS /thru` preflight route:
   ACAO `*`, ACAM `GET, POST, OPTIONS`, ACAH = echo the request's
   Access-Control-Request-Headers (fallback `Content-Type`), Access-Control-Max-Age 600.
   `after_request` additionally sets ACAM/ACAH on every thru response. Version comment
   bump; user-agent `feat-thru/2`.
2. Mirror to `back/features/thru/v2/py/`; `back/app.py` dogfood import v1 → v2.
3. `back/docs/thru.md`: preflight section + v2 row + chat consumer row.
4. `back/test/test_thru_v2_py.py` (load the SHIPPED v2 copy by path): OPTIONS echoes
   requested headers (ACAH/ACAM/ACAO/Max-Age), ACAH present on POST responses, POST
   body-form + GET still behave per v1 contract. Run py + node suites.
5. NOT deployed — needs feat's `-d` (user); the chat/web consumer wiring is tracked in
   chat/DECISIONS.md.

## 2026-11-19 — PLAN: origin tracking per feature + collapsible list on `/`

User request: remember which addresses (origins) use each feature — caught at the
routing level — and show a collapsible unique-address list per feature on `/`.
Plan (app-level like the dark-mode change, NOT a new library feature):
1. `back/app.py`: origins tracker — a `before_request` hook matching feature URLs
   (`/<feature>/v<n>/…` and `/<feature>/latest…`); origin = `Origin` header, fallback
   `Referer` parsed to scheme+host; no header → no record. Store
   `back/logs/origins.json` as `{feature: {origin: {count, last}}}` — load at start,
   write atomically (tmp+rename) ONLY when a new origin/feature appears, tolerate
   write errors. Thread lock. `back/logs/origins.json` added to .gitignore.
2. `/` index: per feature, after the versions table, a `<details><summary>` with the
   origin count and a `<ul>` of unique origins sorted by last-seen desc.
3. Tests `back/test/test_origins_py.py` — flask test_client + temp store: Origin
   recorded, Referer fallback, no-header skipped, dedupe (count increments), 404
   feature not recorded, index page shows the details list. Run full py suite.

## 2026-11-19 — RESULT: origin tracking shipped locally, py suite 62/62

Done, nothing committed. `back/app.py`: `before_request` hook matches feature URLs
(`FEATURE_URL_RE`, v<n>/latest, feature dir must exist) → origin from `Origin` header
(normalized to scheme+host) with `Referer` fallback; no header = no record.
`OriginTracker` persists `back/logs/origins.json` `{feature: {origin: {count, last}}}`
(atomic tmp+os.replace, written only on NEW-origin events, thread lock, load-fault
tolerant). `/` renders per feature a `<details><summary>used by N origins</summary>`
list (sorted last-seen desc, count + last timestamp) after the versions table.
`back/logs/origins.json` gitignored. Tests `test/test_origins_py.py` (9): full py
suite **62/62**. Gotcha: hook must be registered AFTER `app = Flask(...)`; unknown
features are recorded by the hook before the handler 404s → dir-exists check in the
hook. NOT deployed (needs `-d;`). Note: versioned URLs are cache-immutable in
browsers, so unique origins accrue mostly via /latest + manifest + first loads.


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

## 2026-11-16 — PLAN: wake-up v4 — noy mode survives a cold noy (TW VH)

User HAR (stat.twc1.net 10:44): feat warm now works (manifest retry → scripts loaded),
gate fired the wake, but `noy.twc1.net/make-wake-request` died FAST at 47ms (status 0) —
noy is a cold Passenger app on TW VH too (see know timeweb-vh-request-timeouts). v3's
runNoy is a single fetch: one fast network failure = permanent "noy unreachable".
Plan (v4 — v3 published, never edit in place):
1. Copy v3 → v4 (js-web + js-ext). runNoy wraps its fetch in a retry loop: on network
   rejection (no HTTP response = cold/waking noy), retry every 3s while the existing
   wake budget (`timeout`, default 185s) lasts; only then "noy unreachable". Any actual
   HTTP response is processed exactly as before. attempts++ per try.
2. Mirror to back/features, wake-up.md (How-it-works noy bullet + v4 row), contract: 4.
3. Tests: v4 ext suite (copy of v3's) + noy-cold retry test (network errors then success)
   + noy-never-wakes timeout test. Suite green.
4. stat consumer: feat.ts wake-up row v3 → v4 (logged in stat DECISIONS).

## 2026-11-16 — RESULT: wake-up v4 shipped locally (noy cold retry), 77/77

Done, nothing committed. v4 in src+features (js-web + js-ext): runNoy fetch wrapped in a
retry loop — network rejection (cold TW-VH noy, fail-fast ~50ms) retried every 3s within
the wake budget, "noy unreachable" only at budget end; any HTTP response handled as
before. js-web runNoy(target, overrides) now receives the bus payload proxy/project (v3
read only attributes — latent bug, attrs happened to be set). contract: 4. Docs wake-up.md
(noy bullet + v4 row + stat consumer row → v4). Tests: wake-up-ext-v4.test.mjs (13, incl.
noy-cold retry + noy-never-wakes budget) — suite **77/77**. Local flask manifest:
wake-up latest v4, route 200; in-page eval defines the element. NOT deployed —
feat.twc1.net 404s on /wake-up/v4/js-web/ until feat's `-d` (verified live); consumer
stat web pins v4 in feat.ts (needs its own `-d` after feat's).

## 2026-11-16 (2) — PLAN: new feature `thru` v1 (py) — backend request pass-through

User intent: any backend should be able to pass outer requests through itself (origin:
noy make-request; needed e.g. because the user's local network can't reach Render —
stat@web could route via a thru-hosting backend). The feature moves to feat as a shared,
slot-injectable backend feature — python servers first (Flask). Future: a language-agnostic
backend skeleton ("framework but simpler") once more backend features exist.

Plan:
1. `back/src/thru/v1/py/` + mirrored to `back/features/thru/v1/py/` (namespace `py`,
   like logging/db-diag): standalone `thru.py` exposing a Flask **Blueprint** `thru_bp`
   (route `GET|POST /thru`): query `target` (required, http/https only — SSRF guard),
   `method` (default GET), `body` (url-encoded JSON), `timeout_s` (default 30).
   Implementation via stdlib urllib (zero deps for any consumer). Response MIRRORS the
   upstream: same status, content-type, body + `X-Thru-Elapsed-Ms`; CORS `*`
   (after_request) — browser consumers are the point. Optional `THRU_ALLOWED_HOSTS`
   (comma allowlist) + `THRU_DISABLED=true` envs.
2. First consumer = feat itself (dogfood): `back/app.py` registers thru_bp; verify on
   :5477/thru. noy (python now) can adopt later; stat web may route gatedFetch via a
   thru host — separate later step.
3. `back/docs/thru.md` (how it works, envs, slot `backend-thru`, consumers, versions).
4. `back/test/test_thru_py.py` — flask test_client + mocked _fetch: happy path, method
   passthrough, missing target, bad scheme, timeout error, allowlist, disabled.
5. know `feature-slots.md`: add **backend slots** section — `backend-thru` slot semantics
   (HTTP-layer injection, config flag `FEAT_THRU=true` in the project's deploy env decides
   injection; serf vendoring = future pipeline step) + the backend-skeleton vision note.

## 2026-11-17 (2) — RESULT: v5 js-web shipped locally (details above badge)

Done, nothing committed. features/version-display/v5/js-web/{index.js,render.js} copied
from v4: shadow DOM order flipped — detail table FIRST, badge LAST (table uses
margin-bottom: 4px), so the fixed bottom-right badge never moves on expand; details grow
upward. Fallback renderer in index.js (renamed renderV5) kept markup-compatible with
render.js. Shell/manifest/adopt-latest logic unchanged (same stable <deploy-info> class;
manifest auto-discovers v5 → /latest/js-web consumers pick it up after deploy).
Verified: node --check both, module import OK, stub-render asserts detail-before-badge +
margin-bottom. NOT deployed — needs `-d;`. v5 sdui envelope got the same flip earlier
this session.

## 2026-11-17 (2) — PLAN: version-display v5 js-web — details above badge

User request: add js-web to v5 (like v4) with the expand-upward behavior just applied to
the v5 sdui envelope. In v4 the detail table renders AFTER the badge in the shadow DOM,
so expanding moves the badge up (host grows from its bottom anchor). v5 fix: DOM order
flipped — detail table FIRST, badge LAST (table margin-bottom instead of margin-top), so
the badge never moves and details appear above it.
Plan: copy v4 js-web {index.js, render.js} into features/version-display/v5/js-web/,
flip the order in render.js AND in the inlined fallback renderer of index.js (they must
stay markup-compatible), bump v4→v5 comments/names, node --check both. No src/ mirror
(v3/v4 established the features-only pattern for this feature).

## 2026-11-17 — RESULT: v5 sdui details expand upward — done

Envelope items reordered: namespace-details text now FIRST, badge text SECOND (keeps its
tap action + accessibility). Collapsed state is unchanged visually (details text is
empty string); on expand the wrap-content container grows upward from its bottom-right
anchor instead of shifting the badge. JSON validated. Envelope-only edit, no tests.

## 2026-11-17 — PLAN: version-display v5 sdui — details expand upward

User issue: badge is fixed bottom-right; on click, details render AFTER the badge text
in the container items → the block grows downward (position shifts/overflows). Fix:
reorder items in the v5 sdui envelope — details text first, badge text second, so the
bottom-anchored container grows upward. Envelope-only edit in back/features (v5 sdui
lives only there, no src mirror, no published-version conflict — same in-progress v5).

## 2026-11-16 (2) — RESULT: thru v1 shipped (py) + feat dogfood, 45 py / 77 js

Done, nothing committed. `src+features thru/v1/py/{thru.py,__init__.py}`: Flask Blueprint
thru_bp, route GET|POST /thru (target/method/body/timeout_s), stdlib-urllib _fetch,
mirrors upstream status+content-type+body + X-Thru-Elapsed-Ms, CORS * after_request,
502 envelope on connect errors, 400s (missing target / non-http scheme / bad method),
THRU_ALLOWED_HOSTS allowlist (403), THRU_DISABLED (503). Docs docs/thru.md (slot
`backend-thru`, config flag FEAT_THRU=true, consumers feat(dogfood)/noy/stat candidates).
feat app.py dogfoods it (importlib-by-path from features/, register thru_bp) — live
verified on :5477 (thru→manifest 200, bad scheme 400), server stopped after.
Tests test/test_thru_py.py (9): py suite 45/45, js suite 77/77. Test gotcha: lambda
param `body` shadowed the fake's closure body — bind fakes via default args.
know feature-slots.md gained the Backend slots section (backend-thru + skeleton vision).
Pending decisions for the user: wire noy's make-request onto thru (dedupe), stat@web
fallback routing via a thru host, serf-side vendoring when FEAT_THRU=true.

## 2026-11-19 (3) — PLAN: thru v3 — body dropped when caller supplies content-type
Live bug (chat.twc1.net HAR 2026-11-20 00:14): verify POST relayed with correct
targetBody `{"code":"464913",...}` + targetHeaders content-type:application/json →
upstream 400 "code must be a 6-digit string". Cause in _fetch: `if body and method
!= "get" and "content-type" not in headers: data = body.encode()` — data is only
attached when the caller did NOT send content-type; chat always does → every chat
POST body silently dropped. stat's GET-form never passes content-type → never hit.
The v2 tests missed it: fake_fetch replaces _fetch, and the drop lives INSIDE _fetch.
Plan (v3 — v2 published/deployed on feat+noy, never edit in place):
1. src/thru/v3/py: `if body and method != "get": data = body.encode("utf-8")` +
   `headers.setdefault("content-type", "application/json")` (send the body ALWAYS;
   default the content-type only when absent). Mirror to features/, dogfood v2→v3.
2. Tests: _fetch unit with monkeypatched urlopen asserting Request.data == body
   bytes WITH caller content-type present (the regression), plus the bodyless-GET
   case. Docs v3 row.
3. noy vendors v3 (chat's THRU_URL host — needs noy's -d; feat's -d not urgent for
   chat since THRU_URL=noy).

## 2026-11-19 (3) — RESULT: thru v3 shipped (body always sent), py 73 / node 77
Done, nothing committed. src+features thru/v3/py: `_fetch` attaches the body
whenever `body and method != "get"` — v2/v1 attached it only when content-type was
ABSENT, dropping every POST body of callers that send content-type (chat@web, every
call). user-agent feat-thru/3. app.py dogfood v2→v3. Tests test_thru_v3_py.py (5):
the regression unit on the REAL _fetch (monkeypatched urlopen: Request.data == body
bytes WITH caller content-type), content-type setdefault when absent, bodyless GET,
blueprint-level body-form pass-through, preflight still answers. py **73/73**, node
77/0. GOTCHA (why v2 tests missed it): fake_fetch replaces _fetch and the drop lived
INSIDE _fetch. docs/thru.md v3 row. noy vendored v3 + verified locally (echo server
received the full verify-shaped body) — see noy DECISIONS. feat's -d NOT urgent for
chat (THRU_URL=noy); rides the next feat deploy.

