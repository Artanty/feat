# redeploy

Docs: `back/docs/redeploy.md`; code: `back/features/redeploy/v1..v3/js-web/`.

"Retrigger last deploy run" button for stat's run cards (slot
`run-retrigger`). v1 direct mode; v2 moved the transport into the feature via
thru (`thru` attr, `timeout-s` default 120 — stat web carries NO retrigger
knowledge, doctrine fix 2026-11-23); v3 reads all attrs lazily at click time
(React reuses the element — stale-project bug, incidents/26-11-23). Consumers:
stat `feat.ts` pins v3; the slot loads from the feat host at runtime, so a feat
deploy fixes consumers without stat redeploying.

Never edit a published version in place — v2 shipped in tag 0.0.44 and stays.
