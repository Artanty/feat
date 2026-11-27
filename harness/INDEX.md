# harness/ — the working knowledge of this project

Layers (load only what a task needs):

- `core/` — always-true facts. Read the relevant one when a task touches that area.
- `features/` — one file per feature family: what it does, where the code lives,
  the decisions behind it. Read before changing that feature. (Public API docs
  stay in `back/docs/` — these files link to them.)
- `incidents/` — one file per field bug: symptom → root cause → fix, named
  `YY-MM-DD_keywords.md` (fix date). `ls incidents/` reads chronologically.
- `tasks/` — queued not-yet-started tasks; deleted/moved when done.
- The live session log is `harness/DECISIONS.md` (read it first; per AGENTS.md).
  Older history lives in the root `DECISIONS-archive.md` (kept, never deleted).

## core/
- `architecture.md` — layout, hosting (Timeweb VH), run commands, routes, deploy.
- `hard-rules.md` — SDD/versioning rules, env naming, loader constraints, deploy order.

## features/
- `loader.md` — backend-slots loader v1–v4: named slots, remote resolution, catalog.
- `thru.md` — py request pass-through blueprint (v1–v3).
- `req.md` — js-node env-recipe request executor (secrets stay server-side).
- `wake-up.md` — <wake-server>: snapdeploy/render/noy strategies (v1–v4).
- `http-gate.md` — window.featGate bus-recovery interceptor (v1–v2).
- `redeploy.md` — retrigger-last-deploy button (v1–v3, thru transport).
- `bus.md` — featBus messaging + the host↔feature contract.
- `get-updates.md` — /get-updates runtime-info endpoint feature (v1–v2).
- `version-display.md` — <deploy-info> badge (v1–v5, js-web + sdui).
- `global-loading.md` — blocking loader driven by bus signals (v1).
- `vendored-utilities.md` — logging, db-diag, theme-changer.

## incidents/
- `26-11-03_timeweb-ssh-drops.md` — VH deploy IPs dropped by Timeweb.
- `26-11-06_vh-forbidden-no-passenger.md` — root "/" 403; wsgi-script is the pattern.
- `26-11-07_vh-no-pip-slot-venv.md` — host python 3.6.9 without pip.
- `26-11-14_http-gate-lazy-config.md` — MV3 config captured at load.
- `26-11-19_thru-v3-har-body.md` — body dropped without content-type.
- `26-11-23_redeploy-stale-attrs.md` — attrs closed over on element reuse.

## tasks/
- `wake-and-fallback-feature.md` — queued: noy wake-and-call as a feat feature.

## Cross-project
Shared rules (DECISIONS workflow, git/commits, naming):
`/Users/artyomantoshkin/server/know/entries/rules.md`. Related know entries:
`feat.md`, `feature-slots.md`, `deploy-slave.md`.

## DECISIONS.md
- Live session log (plan → result per session); old sessions distill into
  `features/`/`core/` when this grows. Pre-harness history (2026-11-03 → 11-21)
  stays in the root `DECISIONS-archive.md`.
