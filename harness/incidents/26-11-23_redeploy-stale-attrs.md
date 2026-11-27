# 26-11-23 — redeploy sent the PREVIOUS run's project

**Symptom:** clicking redeploy after switching stat run cards deployed the
previously selected project. **Root cause:** v2 read the web-component attrs
once at connectedCallback; React updates attrs on the reused element without
remounting. **Fix:** redeploy v3 — all attrs read lazily at click time.
General rule for React-hosted custom elements.
