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
