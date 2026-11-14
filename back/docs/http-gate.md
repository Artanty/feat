# http-gate

`window.featGate` — single-flight bus-recovery interceptor. On a config-matched failure
(a 503 from a sleeping snapdeploy backend, a 401 from an expired token) the gate makes
ONE bus request to a declared **recovery provider**, parks failed requests, holds new
ones before send, and replays everything when the provider resolves. The gate is
payload-agnostic — it knows nothing about waking or auth; [wake-up v2](/docs/wake-up)
is just one provider (`resolve` = traffic may resume, `reject` = give up).

The cross-framework contract (config schema, episode semantics) is the spec:
`spec/http-gate.md` — this page summarizes; the spec wins.

## How it works

1. Request goes through `featGate.request(url, init)` (fetch drop-in, or `autoPatch`
   wraps `window.fetch`).
2. A response matching a rule (`on: 'ERROR', trigger: 503, url_pattern?`) is
   recoverable: the FIRST such failure starts one bus request
   (`featBus.request(recovery.event, recovery.payload)` — addressed by event name);
   concurrent failures park on it; new requests are held BEFORE send. During the
   episode the gate signals `global-loading-start`/`global-loading-end`
   ([global-loading](/docs/global-loading) shows a blocking backdrop).
3. The bus request resolves → parked + held requests retry once, in order.
   Rejects / NO_HANDLER / timeout → parked requests settle with their original
   response; held requests reject `{code: 'FEAT_GATE_RECOVERY_FAILED'}`.
4. Retried failures never retrigger the recovery (loop guard); a fresh matching failure
   after a completed episode starts a new one.

Canonical uses: 503 → `wake-server@v2` `wake-up` (sleeping container); 401 → an auth
feature's `refresh-token` (same shape, different provider). Framework variants are
namespaces of one version (`js-web` today; `ng`/axios adapters later), sharing the pure
core `featGate.createGate(config, deps)`.

## Environments

Config is build-time data (a global, never a runtime fetch — the feature contract):

    window.FEAT_GATE_CONFIG = {
      rules:    [{ on: 'ERROR', trigger: 503, url_pattern: 'api/' }],
      recovery: { event: 'wake-up', payload: { target: 'https://…containers.snapdeploy.app' } },
      timeoutMs: 200000,   // MUST exceed the provider's budget (bus default is only 5s)
      autoPatch: true,     // optional: wrap window.fetch
    };

The hosting frontend maps its envs (`FEAT_WAKE_TRIGGER_STATUS`, backend URL → payload
target) at build time.

## Inputs (config)

| key | default | meaning |
|---|---|---|
| `rules[]` | — (required) | `{on: 'ERROR', trigger: <status>, url_pattern?}` — the recoverable signal is data |
| `recovery.event` | — (required) | bus event the provider serves (requests route by event) |
| `recovery.payload` | `{}` | passed to the provider VERBATIM; the gate never inspects it |
| `timeoutMs` | `200000` | bus request timeout; keep above the provider's own budget |
| `autoPatch` | off | replace `window.fetch` with the gated one |

## Outputs & triggers

- `featGate.request(input, init)` — the gated fetch (drop-in signature).
- Bus traffic is observable via `featBus.log()`; the gate itself is invisible UI-wise
  (wake-up v2's badge shows the wake).
- Misconfigured gate (no rules / no recovery address) = pure passthrough.

## Lifecycle slot

`backend-request` — the error-activation slot in the host's HTTP layer. The host routes
its requests through the gate; http-gate + wake-up v2 (`manual`) fill the slot together.
See know/entries/feature-slots.md and `/docs/wake-up` (trigger modes).

## Consumers

| project | language | notes |
|---|---|---|
| plst | js-web (React web) | planned: route fetch layer through the gate (wiring pending) |

## Versions

- **v1** (2026-11-14) — first release: config rules (ERROR/status), single-flight
  park/hold/retry, loop guard, payload-agnostic bus recovery (event-addressed),
  loading signals, fetch drop-in + autoPatch.
- **v2** (2026-11-14) — `{on: 'NETWORK'}` rule: transport rejections (fetch TypeError)
  can be declared recoverable. Found live on plist.twc1.net: preflighted calls against
  a sleeping snapdeploy die as network errors (CORS preflight unanswered), so a 503-only
  rule never fires. Parked NETWORK requests reject with their original error if the
  recovery fails. Consumers typically declare `[{on:'ERROR',trigger:503},{on:'NETWORK'}]`.
