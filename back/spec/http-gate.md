# http-gate — feature spec (SDD contract)

When to use: an app's traffic hits a recoverable failure (a sleeping snapdeploy backend,
an expired auth token) and a FEATURE on the bus can fix the cause — then the app's
requests must pause and retry once the fix lands, without every caller knowing about it.
http-gate is that interceptor: on a config-matched failure it makes ONE bus request to a
declared **recovery provider**, parks failed requests, holds new ones before send, and
replays everything when the provider answers. Canonical providers: feat `wake-up` v2
(503 → wake the container), a future auth feature (401 → refresh token) — the gate knows
neither by name.

Spec-driven rule: **this file is the contract**. The tests (`back/test/http-gate.test.mjs`)
pin it; an implementation in any language/framework passes when it satisfies both. Framework
variants are NAMESPACES of one version (`js-web` today; `ng`/axios adapters later), not
separate versions — v2 of the gate logic is v2 in every namespace.

## Concepts

- **Gate** — one instance per app, wrapping the app's HTTP pipeline.
- **Rule** — config row deciding which failures are recoverable (data, not code —
  prior art: host's `InterceptorConfig`).
- **Recovery provider** — any feature serving a bus event; resolve = cause fixed,
  reject = give up. The gate is payload-agnostic.

## Config

    {
      rules:    [{ on: 'ERROR', trigger: 503, url_pattern: 'api/' }],
      recovery: { event: 'wake-up', payload: { target: '…' } },
      timeoutMs: 200000        // recovery budget; MUST exceed the provider's own timeout
    }

- `rules[].on` — `'ERROR'` (a readable HTTP failure status) or `'NETWORK'` (v2: the
  transport REJECTED — fetch TypeError). NETWORK exists because a sleeping backend may
  not answer CORS preflights: preflighted cross-origin calls then die as network errors
  (status 0) before any status could be read — found live on plist.twc1.net, where a
  simple GET got a readable 503 while `x-user-id`-preflighted calls on the same backend
  were opaque. Consumers usually declare both rules.
- `rules[].trigger` — HTTP status number, ERROR rules only. The recoverable signal is
  DATA (snapdeploy = 503, expired auth = 401), not hardcoded — a consumer's config decides.
- `rules[].url_pattern` — optional regex the request URL must match; missing = all URLs.
- `recovery.event` / `.payload` — bus event of the provider and its payload
  (`featBus.request(recovery.event, recovery.payload)` — requests are addressed by
  EVENT name, the bus routes to the first serve() handler).
- `recovery.payload` — passed through VERBATIM; the gate never inspects or alters it.
- `timeoutMs` — the bus request timeout; the bus default is only 5000ms, a recovery can
  run minutes (a wake ~3 min), so this MUST cover the provider's budget.

## Loading signals

While an episode runs the gate signals `global-loading-start` (on begin) and
`global-loading-end` (on finish, resume OR fail) via an injected `deps.signal(name)`
(the js-web adapter wires it to `featBus.signal`). The signals are a UI HINT: feature
`global-loading` renders a blocking backdrop on them; without it the gate still works.
`deps.signal` is optional and may throw freely — recovery is never endangered by UI.

## Episode semantics (single-flight) — the heart of the contract

1. **One recovery per episode.** The FIRST matching failure starts ONE bus request and
   stores the pending promise. Concurrent matching failures park on that same promise —
   they never start a second.
2. **Hold before send.** Requests issued while an episode is in flight are NOT sent;
   they are queued (they would only pile failures onto the broken backend).
3. **Resolve → resume.** When the bus request RESOLVES, parked and held requests are
   re-sent once, in original order (parked first, then held). The gate does not inspect
   the resolved payload.
4. **Reject → fail the episode.** On reject, NO_HANDLER, or timeout: parked requests
   settle with their ORIGINAL outcome (the response for ERROR-parked, the transport
   error for NETWORK-parked); held requests reject with
   `{code: 'FEAT_GATE_RECOVERY_FAILED'}` (they were never sent, so they have no own failure).
5. **No loops.** A replayed request that fails again does NOT retrigger the recovery
   (it settles with its response). A fresh matching failure after a completed episode
   may start a NEW episode (the cause came back — e.g. the backend slept again).
6. **Pass-through.** Everything else (non-matching failures, all successes, network
   errors) behaves exactly like the unwrapped pipeline; the gate never alters responses.

## Core API (framework-agnostic, `featGate.createGate` in index.js)

    createGate(config, deps) -> gate
    deps: { request(url, init) -> Promise<Response>,          // the REAL transport
            recover() -> Promise<any>,                        // typically featBus.request
            signal?(name) }                                   // UI hints (loading), optional
    gate.request(url, init) -> Promise<Response>              // the gated entry point

- Pure JS state machine: idle → recovering → (resumed|failed); no DOM, no fetch, no bus —
  the js-web adapter (same file, browser-only block) injects fetch/featBus and exposes
  `window.featGate.request`; a future ng/axios namespace vendors the same file and calls
  `featGate.createGate` with its own deps (the file evals in node: root falls back to
  globalThis, the adapter block skips without a document).
- `gate.request` is the only public call; `gate.state()` ('idle'|'recovering'|'resumed'|'failed')
  exists for tests/diagnostics.
- Misconfigured gate (no rules / missing recovery address / missing deps) = pure
  passthrough — a feature must never break the hosting page.

## Consumer contract (adapter responsibilities)

The ONLY host-specific part is the pipeline hook. An adapter must:

- route every app request through `gate.request` (js-web: pass `featGate.request` instead
  of fetch, or set `autoPatch: true` to wrap `window.fetch`; ng: an HttpInterceptor; axios:
  an adapter/interceptor calling the same core),
- feed config as build-time data (global `window.FEAT_GATE_CONFIG` or init arg — never a
  runtime fetch, per the feature contract),
- pick a recovery provider that honors resolve=resume / reject=give-up (wake-up v2 does:
  it resolves on awake, rejects on timeout).

Edit HERE, re-publish to `features/`; never edit a published version dir in place.
