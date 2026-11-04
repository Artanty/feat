# feat — runtime web-component library

Pipeline-shaped: python app in `back/` (versioned via `back/pyproject.toml`, githooklib ≥2.2.0
reads it natively — no package.json), `build/` holds the githooklib seat. Tags look like
`v0.0.N.0.0.0`; deploys via the standard serf pipeline (VH hosting, namespace `back`).

Serves versioned web-component bundles from `features/`. Every version of every feature is
accessible at all times; consumers load exactly what they need at runtime:

```html
<script src="https://feat_host/version-display/v1/"></script>
<deploy-info version="1.0.27.0.0.10" project="plst" namespace="web" commit="fix player"></deploy-info>
```

## Layout

```
features/<feature>/v<n>/index.js     canonical bundle (URL: /<feature>/v<n>/)
features/<feature>/v<n>/<other>      extra chunks/assets of that version
```

Routes: `/<feature>/v<n>/` and `…/index.js`; `/<feature>/v<n>/<file>`;
`/<feature>/latest` (302 to newest); `/manifest.json`; `/healthz`.
Feature responses are `Access-Control-Allow-Origin: *` — consumers live on other hosts.

## Run locally

```bash
cd back
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/flask --app app run
```

## Deploy (Timeweb VH, manual for now)

Flask is WSGI — Passenger-compatible on Timeweb shared hosting. rsync the project (minus
`.venv`, `__pycache__`) into the slot; point the Passenger app at `app.py`. The serf pipeline
does not cover this project (it is python-shaped, not web/back) — deploy manually until a
python branch exists there.
