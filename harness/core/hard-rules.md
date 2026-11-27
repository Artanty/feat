# hard-rules

- **SDD/versioning**: `back/spec/<feature>.md` is the contract; NEVER edit a
  published version dir — new behavior = new `v<n>/`. All versions stay
  accessible simultaneously. A namespace dir contains exactly one `index.*`.
- **Naming** (know rules 3–4): kebab-case feature names shared by ALL
  namespaces; env IDs UPPER_SNAKE (`FEAT_<ID>_MOUNT` / `_SLOT` / `_VERSION`),
  the `-`↔`_` translation lives ONLY in the backend-slots loader (≥ v2).
  Collision audit: no mounted env ID may be an underscore-prefix of another
  (`FEAT_GET_` vs `FEAT_GET_UPDATES_`) — on collision rename the SHORTER.
- **Features live in feat only** — never copy feature code into consumers; a
  consumer vendors exactly one file pair: `features/loader.js` (+ d.ts).
  Features arrive by CONFIG at boot: `FEAT_URL` + `FEAT_<ID>_SLOT` (required
  toggle — absent = dormant) + optional `FEAT_<ID>_MOUNT` path override.
  Consequence: a feat deploy updates consumers without them redeploying.
- **Loader platform rule**: the js-node namespace is the loader's identity,
  hardcoded — never serf/env knowledge.
- **Secrets**: thru/req recipes come from env rows, never caller-supplied
  targets (req v2 caller-template was rejected for secret-exfiltration risk).
  Unset `FEAT_REQ_*_TARGET` ref → 500 — rename prod env rows together with
  docs refs.
- **Timeweb VH quirks**: no Passenger (wsgi-script .htaccess is the pattern),
  no pip on host python (slot venv), SSH from GitHub Actions IP ranges
  sometimes dropped (see incidents).
- Don't commit unless asked; deploy decisions (`-d`) are the owner's.
