# architecture

feat = runtime feature library (spec-driven): serves versioned feature bundles
from `back/features/`; every version of every feature stays accessible;
consumers load at runtime (web components) or vendor files (server features).

## Layout

- `back/app.py` (~600 lines) — the whole Flask server. `back/features/` =
  published bundles (`<feature>/v<n>/<ns>/…`); `back/src/` = source for the
  web/sdui features that need a build; `back/spec/<feature>.md` = contracts
  (SDD); `back/docs/` = public per-feature docs; `back/logs/origins.json` =
  origin tracking.
- No web/ dir. `build/` only holds the githooklib commit pipeline seat.
  `test/angular` = consumer test.

## Routes

`/<feature>/v<n>/<ns>/` (+`/index.*`), `/<feature>/v<n>/<ns>/<file>`,
`/<feature>/latest/<ns>` (302), `/manifest.json`, `/catalog.json`, `/docs`,
`/healthz`, `/`, `/version.json`. CORS `*` on feature responses; versioned URLs
cached immutable, `/latest` + manifests no-cache. A namespace dir must contain
exactly one `index.*` (router 500s on ambiguity).

## Run / test

```bash
cd back
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/flask --app app run        # dev port 5477 (was 5099 until 2026-11-14)
node --test 'back/test/*.test.mjs'   # js contract tests
pytest back/test/test_catalog_py.py  # py tests
```

Stop the dev server when the task is done (AGENTS guideline).

## Hosting & deploy

- Timeweb VH, Apache `wsgi-script` via `back/index.wsgi` + slot `.htaccess`
  (NO Passenger on the host); python deps in a slot venv (host python has no
  pip). Namespace: `back`.
- Version source: `back/pyproject.toml` (githooklib ≥2.2.0 reads it natively);
  tags `v0.0.N.0.0.0`. Deploy = `-d` commit → flow → serf VH-python workflow
  (rsync + slot venv + wsgi restart).
- **Deploy order**: feat deploys FIRST when consumers load features from the
  feat host at boot — until then their slots stay dark (silent-fail by design).
