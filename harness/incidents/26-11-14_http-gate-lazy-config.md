# 26-11-14 — http-gate js-ext config captured at load

**Symptom:** js-ext (Chrome MV3) http-gate used stale config. **Root cause:**
config object closed over at script load; MV3 service workers reload. **Fix:**
read config lazily at match time (v2). General MV3 rule for every js-ext
feature.
