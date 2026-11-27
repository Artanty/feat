# loader (backend-slots)

Docs: `back/docs/backend-slots.md`; spec: `back/spec/backend-slots.md`;
code: `back/features/loader/v1..v4/js-node/`.

The ONE file pair consumers vendor (`features/loader.js` + d.ts); everything
else resolves remotely. Version history (decisions):

- v1 — initial backend-slots loader; id regex rejects underscores.
- v2 / v2.1 — underscore env-ID support (`-`↔`_` translation lives only here);
  REMOTE resolution: local-first `features/<id>/<id>.js`, else `FEAT_URL` →
  manifest → latest → fetch js-node main → import via data: URL; silent-fail
  per feature.
- v3 — named slots: `FEAT_<ID>_SLOT` required toggle (absent = dormant),
  `_MOUNT` optional path override; features export kind 'route'|'middleware';
  host anchors via `feat.slot('<name>')`.
- v4 (2026-11-26) — `FEAT_<ID>_VERSION` pin + pre-mount required-env
  validation via the shared catalog fetch; js-node ns hardcoded (platform
  rule). Paired with the catalog (feat.json per version + GET /catalog.json).

Naming rules and collision audit: `core/hard-rules.md`, know rules 3–4.
