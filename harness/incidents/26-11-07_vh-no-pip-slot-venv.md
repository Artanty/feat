# 26-11-07 — "No module named pip" on VH python 3.6.9

**Symptom:** dependency install failed on the host. **Root cause:** host
python has no pip and no write access to site-packages. **Fix:** slot-local
virtualenv provisioned by the serf VH-python workflow (rsync + venv + wsgi
restart). Local dev unaffected (own venv, port 5477).
