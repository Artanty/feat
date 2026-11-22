# redeploy

`features/redeploy/v1` (`js-web` namespace) — the "retrigger this project's last deploy
run" BUTTON: a web component the hosting frontend mounts in a FeatureSlot. The host gives
it an endpoint URL and the project identity; the machinery behind the endpoint (flow,
tokens, the feat `req` recipe engine) is invisible to the host. Spec-first:
`back/spec/redeploy.md` is the contract, `back/test/redeploy.test.mjs` pins it.

## How it works

```html
<script src="{FEAT_URL}/redeploy/v1/js-web/"></script>
<redeploy-button src="https://safe-back/api/req/redeploy"
                 project="safe" namespace="web"></redeploy-button>
```

- On click: `POST {src}` with `{"project": "<project>@<namespace>"}`; disabled while
  pending; ok/error (upstream's own, mirrored) transiently in the button title. Optional
  `token-key` attr: localStorage key sent as `X-Totp-Auth` (hosts whose session header
  their own HTTP stack adds — global fetch bypasses Angular interceptors, hence the attr).
- Events out: `feat:ready` on connect, `redeploy:done` (`{ok, project, response}`).
- Required attr missing → renders nothing. No runtime envs; styles inline,
  theme-agnostic.
- `src` typically routes to a feat `req` recipe in the project's back (docs/req.md) —
  e.g. `FEAT_REQ_REDEPLOY_*` rows pointing at flow `/retrigger`. The button is the
  js-web half of the capability; the recipe is the js-node half.

## Environments

None — features never read envs at runtime; `src` is an attribute.

## Lifecycle slot

Frontend slot **`project-header`** (projects tab → active/opened project header,
know/entries/feature-slots.md). Mounted via a FeatureSlot wrapper; attrs come from the
opened project (runtime data the slot carries).

## Consumers

| project | notes |
|---|---|
| safe | first resident of the `project-header` slot (web FeatureSlot + local config) |
| stat | `run-retrigger` slot in DeployTab run header — v2 with `thru=FEAT_URL/thru` (stat back sleeps on Render; direct POST dies on the unanswered CORS preflight) |

## Versions

- **v2** (2026-11-23) — optional `thru` + `timeout-s` attrs: the click routes through
  a feat thru route (`GET <thru>?target=<src>&method=post&body=…&timeout_s=…`) for
  sleeping/cold src backends — the thru knowledge lives in the feature; hosts pass only
  URLs as config attrs. Direct mode unchanged.
- **v1** (2026-11-21) — js-web `<redeploy-button>`: src/project/namespace attrs, POST +
  mirrored feedback, `redeploy:done`/`feat:ready` events.
