# wake-up

Docs: `back/docs/wake-up.md`; code: `back/features/wake-up/v1..v4/`
(js-web, js-ext; src in `back/src/wake-up/`).

`<wake-server>` web component waking sleeping PaaS containers. Strategies:
snapdeploy (POST wake API + HEAD-poll), render v3 (URL-parsed 'way'), poll;
v3 `mode="noy"` delegates to noy's `/make-wake-request`; v4 survives a COLD
noy (retries the wake request every 3s within the budget — Timeweb VH
Passenger apps can fail fast while spawning). Bus slot: dormant element woken
via `featBus.request('wake-up', {target, mode, proxy, project}, {timeoutMs ≥
wake budget})` with single-flight join.

Related: http-gate (canonical pairing 503 → wake-up), noy's /wake,
/wake-and-call. Queued: tasks/wake-and-fallback-feature.md.
