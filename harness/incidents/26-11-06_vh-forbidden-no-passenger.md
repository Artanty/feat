# 26-11-06 — "/" 403 Forbidden on bring-up (no Passenger on the host)

**Symptom:** feat served 403 on `/` after first deploy. **Root cause:**
assumed Passenger-style hosting; the Timeweb VH slot only does Apache
`wsgi-script`. **Fix:** `AddHandler wsgi-script .wsgi` + rewrite to
`/index.wsgi` in `.htaccess`, entry `back/index.wsgi` (with a venv
site-packages shim). Pattern reused by noy and every python VH project since.
