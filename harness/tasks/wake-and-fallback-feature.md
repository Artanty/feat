# Task: noy wake-and-fallback as a feat feature

Queued 2026-11-27 (owner request). Not started.

## Goal

Make noy's wake-and-fallback (`/wake-and-call`: wake a sleeping target, then
POST a callback with a JSON body — see `../noy/back/app.py` wake_and_call)
available THROUGH feat, so consumers get it as a feature instead of talking to
noy bare.

Owner's framing: "it can be req feat, or wake-up, or all these things can be
one feat with diff strategies."

## Options to weigh (SDD: spec first, then pick)

1. **req recipe(s)** — cheapest: env rows
   `FEAT_REQ_WAKE_CALL_TARGET = <noy>/wake-and-call` + param passthrough.
   Fits req's "backend capability, secrets server-side" doctrine, but req is
   synchronous — the caller still waits out the wake (fine for always-on
   consumers, wrong for Vercel-limited ones).
2. **wake-up v5** — extend the existing feature: js-web keeps the button/
   bus role, add a js-node strategy `mode="noy-call"` mirroring the existing
   `mode="noy"` (v4) but using /wake-and-call (wake + callback instead of
   wake + wait).
3. **one unified feature with strategies** — wake-up generalized:
   strategies render/snapdeploy/poll/noy/noy-call selectable per consumer
   namespace (js-web button, js-node fire-and-forget helper, py blueprint?).
   More surface; justify only if (1)+(2) feel fragmented.

## Known consumers / requirements

- **flow** (Vercel, 10s): fire-and-forget wake-and-call for cold-safe dispatch
  deferral AND stat-telemetry replay (`back/src/defer.ts` fireNoyWakeAndCall
  — would become a consumer of this feature, or stay direct?). Server-side
  consumer → needs a js-node (vendored) or py namespace, or keeps calling noy
  directly (then the feat feature is for web/browser consumers only — decide).
- Secrets rule: tokens ride in the callback BODY, never in noy's query string
  (VH access logs record URLs) — must survive any feat wrapping.
- noy is itself occasionally cold (Passenger spawn) — v4-style retry of the
  waker applies.

## Related

- `features/wake-up.md`, `features/req.md`, `features/thru.md`.
- flow's harness: `../flow/harness/features/deferred-dispatch.md`.
- noy DECISIONS 2026-11-27 (/wake-and-call entry).

Delete this task file when done; distill the outcome into the feature's
harness file + back/spec + back/docs.
