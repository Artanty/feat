# redeploy — feature spec (SDD contract)

When to use: a frontend needs a "retrigger this project's last deploy run" button without
knowing anything about the machinery behind it (flow, tokens, the feat `req` recipe
engine). `redeploy` is a js-web BUTTON feature: the hosting app gives it an endpoint URL
(`src`) and the project identity; what serves `src` is invisible to the app.

Spec-driven rule: **this file is the contract**. Tests (`back/test/redeploy.test.mjs`)
pin it. Single namespace: **js-web** (the backend side of this capability is a feat `req`
recipe — spec/req.md — mounted in the project's back; `src` is the only coupling point).

## Element

`<redeploy-button>` — custom element per feat feature-contract (attrs strings-only,
kebab-case; unknown ignored; missing required → renders NOTHING).

## Attributes

| attr | required | meaning |
|---|---|---|
| `src` | yes | backend endpoint URL (a req recipe route, e.g. `https://safe-back/api/req/redeploy`) |
| `project` | yes | project name (repo), e.g. `safe` |
| `namespace` | yes | project namespace, e.g. `web` — combined into `project@namespace` |
| `token-key` | no | localStorage key whose value is sent as `X-Totp-Auth` on the click request — for hosts whose session header lives in storage but is attached to their own HTTP stack, not global fetch |

## Behavior

1. On connect: if any required attr is missing/empty → render nothing (no button, no
   error UI — the host stays clean). Otherwise render one `⟳ Redeploy` button and fire
   `feat:ready`.
2. On click (disabled while pending): `POST {src}` with JSON body
   `{"project": "<project>@<namespace>"}`; transient status in the button title —
   success: `deploy retriggered` (or upstream detail), error: upstream error text
   (mirrored by the req recipe) — cleared after a few seconds.
3. On completion fire `redeploy:done` (CustomEvent, `detail` = JSON
   `{ok: boolean, project, response?}` — response is the parsed upstream JSON when
   parseable, else the raw text).
4. No runtime envs, no fetching beyond the click, no assumptions about auth beyond the
   optional `token-key` header.
5. Styles inline + theme-agnostic (uses currentColor/inherit); the button must fit both
   dark and light hosts.
