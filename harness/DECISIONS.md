# DECISIONS — feat (live session log)

Plan → result, newest first. Distill old sessions into `harness/features/`
and `harness/core/` when this grows. Pre-harness history (2026-11-03 →
2026-11-21, ~1170 lines) lives in the root `DECISIONS-archive.md` — never
delete it.

## 2026-11-27 — harness v2 conversion + queued wake-and-fallback task

- Converted to the layered knowledge base (know harness-v2 checklist,
  reference ../tabs ../flow): `core/` (architecture, hard-rules),
  `features/` (loader, thru, req, wake-up, http-gate, redeploy, bus,
  get-updates, version-display, global-loading, vendored-utilities),
  `incidents/` (6 distilled from the archives), `tasks/`, INDEX, this log.
  Root `DECISIONS.md` deleted (content distilled); `DECISIONS-archive.md`
  kept as history. `AGENTS.md` replaced with the know-rules delegation
  block. NOT committed (reorg commit pending owner).
- Queued `tasks/wake-and-fallback-feature.md` (owner request): expose noy's
  /wake-and-call through feat — options recorded there (req recipe vs
  wake-up v5 vs one unified strategies feature).

## 2026-11-26 — catalog + loader v4 (latest thread, distilled)

- Catalog (feat.json per version + GET /catalog.json), loader v4
  (`FEAT_<ID>_VERSION` pin + pre-mount required-env validation; js-node ns
  hardcoded), tik@back get-updates consumer. Node 152/152, py 5/5; e2e on
  :5477/:3202. Phase 2 spec (safe feat tab, project_feats link table,
  red-line env validation, migrate safe off loader v1) still queued in the
  SDD specs. NOT committed at the time; see git for the shipped state.
