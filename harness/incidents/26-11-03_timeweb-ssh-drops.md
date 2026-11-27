# 26-11-03 — Timeweb drops inbound SSH from GitHub Actions IPs

**Symptom:** VH deploy workflows (rsync from GitHub runners) failed
intermittently at connect. **Root cause:** Timeweb network filtering dropped
inbound SSH from GitHub Actions IP ranges. **Fix:** retries at the workflow
level; the known IP ledger lives in `know/entries/deploy-slave.md`. Affects
every VH-hosted project's serf deploy (feat, noy, stat-web consumers).
