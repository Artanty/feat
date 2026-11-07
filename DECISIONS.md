# DECISIONS

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

## 2026-11-07 (3) — manual pip one-timer → pipeline-managed
- **Change (in serf, see serf/DECISIONS.md 2026-11-07)**: serf's generated VH-python
  `vh-deploy.yml` now runs `pip install -r requirements.txt` in the slot over the deploy SSH
  (after rsync, before restart; failure = job error, NO restart → previous app keeps serving).
  So the checklist item "install flask into the panel env" from (2) is now automated —
  next `-d` deploy installs deps itself. Only remaining manual host step: panel app type =
  Python/Passenger + startup file `index.wsgi`. know entries (deploy-slave, feat) updated.
