# test — real consumer apps for feat

Home for real apps that connect to feat and exercise its features end to end.
Each app is its own project under this folder; each app keeps **its own list**
of which features/namespaces it loads — toggling a feature happens in the
consumer (its config → redeploy), never in this library.

## Planned apps

- **angular/** — Angular app consuming web features (e.g. `<deploy-info>`)
  via `/<feature>/latest/<ns>` URLs.
- **node/** — Node.js/Express host: at boot resolves
  `/<feature>/latest/<ns>`, fetches the bundle, caches to disk, `import()`s it,
  and registers it through a narrow ctx API (interceptors/services as plain
  functions). Its config file is its feature toggle.

## Conventions

- Features are fetched from a running feat router (`back/app.py`), default
  dev URL `http://127.0.0.1:5099`.
- Namespaces are free-form path parts (`js-web`, `js-node`, `py`, …) — an app
  requests the namespace that matches its runtime.
- Bundles are immutable at versioned URLs; `/latest/<ns>` is the only URL a
  consumer should resolve at boot.

## Status

Seed only — no apps built yet (follow-up tasks).
