# wake-up

`<wake-server>` — wakes a sleeping PaaS container (snapdeploy first) straight from the
browser and shows its state while the cold start runs.

## How it works

Browser port of noy/back's `wakeServer.js` snapdeploy strategy, extended in v3 with a
URL-parsed wake 'way' (strategy):

1. **Strategy detection** (v3) — parsed from the `target` hostname, no option to pass:
   `*.onrender.com` → `render` · `sub.containers.snapdeploy.app|dev|somdip.dev` →
   `snapdeploy` · anything else → `poll` (generic plain polling). The resolved strategy is
   reported in `wake-awake` / the bus result.
2. **Wake ping** — snapdeploy strategy only: `POST
   https://snapdeploy.dev/api/public/wake/<subdomain>` (`*.containers.somdip.dev` hosts
   use `containers.somdip.dev`). Plain HTTP GETs don't wake these containers; this
   replicates the platform's own wake-page script. `render` and `poll` hosts have no wake
   API — the poll request itself triggers the cold start. Any ping failure (even 429) is
   swallowed — the poll decides.
3. **Poll loop** — `HEAD target` every `interval` ms (js-ext: `HEAD <base>/healthz`).
   Awake = status ≠ 503 (the sleeping wake-page response) and status ∈
   {200, 204, 301, 302, 401, 403, 404} — an auth-rejecting server is an awake server.
   Network errors keep polling until `timeout`.
4. **`mode="noy"`** — instead of doing the work itself, the component calls noy/back's
   `GET {proxy}/make-wake-request?target=…&app=…` which wakes (and waits) server-side;
   the component reads `{request: "completed", wake: {awake, attempts, elapsedMs, strategy}}`.
   v4: a network rejection from the proxy (no HTTP response — e.g. noy is itself a cold
   Timeweb VH Passenger app that fails fast at ~50ms while spawning) is RETRIED every 3s
   within the wake budget; "noy unreachable" only after the budget ends.

The target must send CORS headers on `HEAD` (plst's backend reflects any origin) — that is
what makes the real status readable cross-origin.

## Environments

The component never reads envs at runtime; the hosting frontend maps its **build-time**
envs to attributes:

| env | attribute | effect |
|---|---|---|
| `FEAT_WAKE_UP_THRU_NOY=true` | `mode="noy"` | wake via noy proxy instead of client-side |
| `NOY_BACK_URL` | `proxy` | noy base URL, required when `mode="noy"` |
| backend URL of the app being woken | `target` | the snapdeploy app URL |

## Inputs (attributes)

| attribute | default | meaning |
|---|---|---|
| `target` | — (required) | URL to wake, e.g. `https://plst-….containers.snapdeploy.app` |
| `mode` | `direct` | `direct` (client-side) or `noy` (proxy via noy/back) |
| `proxy` | — | noy base URL, used only in `noy` mode |
| `project` | — | stat/history label passed to noy as `app` (`noy` mode only) |
| `interval` | `3000` | poll interval, ms |
| `timeout` | `185000` | wake budget, ms (~3 min, matches snapdeploy's wake page) |
| `manual` | off (v2) | stay dormant on connect — wake only via bus requests |

## Outputs & triggers

Custom events (bubble; host pages gate their API calls on `wake-awake`):

- `wake-start` — `{target, mode}`
- `wake-awake` — `{attempts, elapsedMs, strategy}` (`"snapdeploy"`, `"render"`, `"poll"`,
  `"noy"`, or noy's own strategy)
- `wake-timeout` — `{attempts, elapsedMs [, wake]}`

Visible output while waiting: a compact badge — state (waking… / awake / wake timeout /
wake error), pulsing dot, attempts, live elapsed seconds.

## Trigger modes (v2)

- **mounted** (v1 behavior, default) — the element wakes on connect. Fits the `app-init`
  slot, but POSTs the snapdeploy wake API on EVERY page load, awake or not — that API is
  rate-limited.
- **interceptor slot** (v2, recommended) — set `manual` and pair with the
  [http-gate](/docs/http-gate) feature: the element stays resident but dormant (invisible,
  zero pings); wakes happen only when the app's own traffic proves sleep (a 503), called
  over the bus:

      featBus.request('wake-up', { target, mode?, proxy?, project? },
                      { timeoutMs: >= wake budget })
        → resolves { awake: true, attempts, elapsedMs, strategy }
        → rejects on timeout/error (Error with message; bus wraps it into an error envelope)

  Concurrent requests join the in-flight wake (single-flight): N callers = one wake cycle.
  Contract per spec/http-gate.md: resolve = traffic may resume, reject = give up. Bus
  default timeout is 5s; a wake runs minutes, so always pass `timeoutMs`.

## Lifecycle slot

- `app-init` (mounted mode) — wakes once at boot, before meaningful API traffic.
- `backend-request` (manual mode) — resident/dormant; activated on demand by http-gate
  when a config-matched failure arrives. Preferred for snapdeploy (no unconditional wake
  pings). See know/entries/feature-slots.md.

## js-ext namespace (v2)

Chrome MV3 extension consumers (service worker / popup) have no document and no shared
window: no custom elements, no CustomEvents bus transport. The `js-ext` bundle is the
same v2 wake core as a plain module — attach it to `globalThis.featWakeUp`. MV3 CSP
(`script-src 'self'`) forbids loading it from the feat host at runtime, so consumers
**vendor** the file (js-node pattern), e.g. plst copies it into `ext/vendor/feat/`.

- `featWakeUp.wakeServer(base, opts)` → Promise — resolves
  `{awake: true, attempts, elapsedMs, strategy}`, rejects on timeout/error.
- `opts`: `{mode ('direct'|'noy'), proxy, project, interval (3000), timeout (185000),
  onState(state, detail)}`. `onState` mirrors the js-web events for UI rendering:
  `'waking'` `{target, mode}` · `'awake'` `{attempts, elapsedMs, strategy}` ·
  `'timeout'` `{attempts, elapsedMs}` · `'error'` `{message}`.
- Single-flight: concurrent calls for the same target join the in-flight wake; a call
  for a different target while one runs rejects immediately.
- Direct mode polls `HEAD <base>/healthz` (the lightweight probe), not the bare origin.

## Consumers
| stat | js-web (React web) | v4 manual + http-gate; wakes the Render back via noy (render way, URL-parsed, cold-noy retry) |

| project | language | notes |
|---|---|---|
| plst | js-web (React web) | planned: wake the snapdeploy backend on page load (wiring pending) |
| plst ext | js-ext (Chrome MV3) | vendored; popup wakes the snapdeploy backend on cold start |

## Versions

- **v1** (2026-11-13) — first release: direct (client-side snapdeploy wake) + noy proxy
  mode, event contract, badge UI.
- **v2** (2026-11-14) — interceptor-slot shape: `manual` attr (resident, dormant),
  `featBus.serve('wake-up')` with single-flight join, fixed-width badge counter.
- **v3** (2026-11-15) — URL-parsed wake way: `*.onrender.com` → render strategy, unknown
  hosts → poll; snapdeploy wake POST fires only for snapdeploy hosts. No new attributes.
- **v4** (2026-11-16) — noy mode survives a cold noy (TW VH fast-fail): make-wake-request
  network failures retried every 3s within the wake budget; bus payload proxy/project now
  reach runNoy (v3 read only attributes).
