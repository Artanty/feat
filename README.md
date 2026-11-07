# feat — runtime feature library (spec-driven)

Pipeline-shaped: python app in `back/` (versioned via `back/pyproject.toml`, githooklib ≥2.2.0
reads it natively — no package.json), `build/` holds the githooklib seat. Tags look like
`v0.0.N.0.0.0`; deploys via the standard serf pipeline (VH hosting, namespace `back`).

Serves versioned feature bundles from `features/`. Every version of every feature is accessible
at all times; consumers load exactly what they need at runtime (web components) or vendor
specific files (server features):

```html
<script src="https://feat_host/version-display/v3/js-web/"></script>
<deploy-info version="1.0.27.0.0.10" project="plst" namespace="web" commit="fix player"></deploy-info>
```

## Layout

```
back/spec/<feature>.md                SDD contract: the behavior, versioned by review
back/features/<feature>/v<n>/<ns>/    one dir per version, one subdir per namespace
  js-web/  web-component bundles (entry index.js served at /<feature>/v<n>/<ns>/)
  js-node/ plain-ESM node modules + .d.ts (consumers VENDOR selected files, see specs)
  py/      python implementations (arrive with plst's back-py)
back/test/*.test.mjs                  contract tests for the js-node namespaces:
                                      `node --test 'back/test/*.test.mjs'`
```

A namespace is free-form (`js-web`, `js-node`, `py`, …); the ns dir must contain exactly one
`index.*` entry file (the router 500s on ambiguity).

Routes: `/<feature>/v<n>/<ns>/` and `…/index.*`; `/<feature>/v<n>/<ns>/<file>`;
`/<feature>/latest/<ns>` (302 to newest version shipping that ns); `/manifest.json`; `/healthz`.
Feature responses are `Access-Control-Allow-Origin: *` — consumers live on other hosts.
Versioned URLs are cached immutable; `/latest` + `/manifest.json` are no-cache.

## SDD rules

- **The spec in `back/spec/<feature>.md` is the contract.** Tests pin it; any-language
  implementations pass when they satisfy spec + tests.
- Never edit a published version dir in place — new contract/behavior = new `v<n>/`.
- Server features: consumers vendor the js-node files named in the spec's Consumer contract
  (plst: `npm run features:sync` in `back/`). Edit HERE, re-sync there.

## Run locally

```bash
cd back
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/flask --app app run
```

## Deploy (Timeweb VH via the pipeline)

Deploy = `-d` commit → flow → serf VH-python workflow (rsync + slot venv + wsgi restart).
Serving is Apache `wsgi-script` via the slot `.htaccess` (no Passenger on Timeweb VH); see
know/entries/feat.md for the serving pattern and gotchas.
