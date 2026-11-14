# version-display

`<deploy-info>` — a small badge showing the hosting app's version / commit / repo, with an
expandable detail table. First feat feature.

## How it works

Single-file web component (v1/v2) or shell + swappable renderer (v3/v4): `index.js`
defines `<deploy-info>` once; v3+ fetches `/manifest.json`, imports the latest version's
`render.js` ES module, and re-imports it when `latest` changes — so the badge can be
hot-swapped without redeploying consumers. Data comes from a JSON endpoint (`src`
attribute) or direct attributes. Version `0.0.0(.0)` renders nothing (dev builds stay
clean).

## Environments

None at runtime. The hosting frontend injects its **build-time** values as attributes —
in plst, `TAG_VERSION` is sed-injected into the web build and passed as `version`.

## Inputs (attributes)

| attribute | meaning |
|---|---|
| `src` | JSON endpoint returning `{version, project, namespace, commit, repo}` |
| `manifest` | feat `/manifest.json` URL (v3+; enables latest-renderer adoption + polling) |
| `refresh` | manifest re-check interval, seconds (default 300, `0` = off) |
| `version`, `project`, `namespace`, `commit`, `repo` | direct data; precedence direct > `src` > defaults; `project` falls back to hostname's first label |

## Outputs & triggers

None — display only. v3+ polls the manifest on `refresh` and hot-swaps its renderer when
`latest` changes.

## Lifecycle slot

`app-version` — rendered in the app's header/footer chrome.

## Consumers

| project | language | notes |
|---|---|---|
| plst | js-web (React web) | `FeatureSlot slot="app-version"`; badge dark until feat deploys v4 |
| plst | web-angular | local TAG_VERSION badge, no feat load yet |

## Versions

- **v1** — single-file `<deploy-info>`, direct attributes, click-to-expand table.
- **v2** — `src` JSON endpoint support, precedence rules.
- **v3** — shell + `render.js` module, `/manifest.json` adoption, hot-swap polling; live-proven.
- **v4** — one-liner shows `v<version>` only; project/commit moved into the detail rows.
  Built, **not yet deployed**.
