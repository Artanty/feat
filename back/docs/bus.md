# bus

`window.featBus` — the reference implementation of the feature contract's messaging half:
envelope routing, request/reply with correlation ids, timeouts, error codes, log buffer.

## How it works

Stateless helper over CustomEvents on `document` (event `feat-bus`, `detail` = the
envelope). No shared instance between bundles, no load order: whichever copy loads first
defines `window.featBus`; later copies of the same contract version are no-ops. Full spec:
[feature-contract](/docs/feature-contract).

## Environments

None.

## Inputs (API)

```js
featBus.signal(event, payload, {from, to})               // broadcast a signal
featBus.request(to, event, payload, {timeoutMs = 5000, from})  // → Promise<payload>
featBus.serve(event, (payload, from) => result)          // answer requests; returns unsubscribe
featBus.on(pattern, handler)                             // "*", "signal:<event>", "request:<event>", "from:<address>"
featBus.log()                                            // last 200 envelopes
```

## Outputs & triggers

Envelopes on the `feat-bus` CustomEvent: kinds signal / request / response / error;
requests are routed to the first `serve()` handler for the event; no handler → immediate
`error` `{code: "NO_HANDLER"}`; handler throw → `HANDLER_ERROR`; no answer in time →
Promise rejects `{code: "TIMEOUT"}`. Passive `on()` listeners see everything.

## Lifecycle slot

Background/`app-init` (load early; features that need request/reply depend on it —
though features must degrade silently when it is absent, per contract).

## Consumers

| project | language | notes |
|---|---|---|
| plst | js-web (React web) | planned: load in app-init slot alongside wake-up |

## Versions

- **v1** (2026-11-13) — contract 1: envelope + kinds + reqId correlation, serve/on API,
  NO_HANDLER/TIMEOUT/HANDLER_ERROR, 200-entry log ring buffer.
