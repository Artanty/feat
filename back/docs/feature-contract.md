# feature-contract

The contract between a hosting frontend and feat features. Every feature author and every
host implements against this page. The `bus` feature (any version) is the reference
implementation of the messaging half.

## How it works

A feature is a self-contained web component loaded from
`{baseUrl}/{id}/{version}/{namespace}/` into a named slot (see
know/entries/feature-slots.md). The host tells the feature things through **attributes**;
the feature tells the host (and other features) things through **events**. There is no
shared object, no shared module instance, no build-time coupling — features from different
bundles, versions and frameworks coexist because everything crossing the boundary is a
string or plain JSON.

## Environments

None. Features never read envs at runtime; the host maps its build-time envs to attributes
when mounting. (Open question, deferred: build-time vs runtime attrs — runtime data goes
through the bus request/reply pattern meanwhile.)

## Inputs (attributes — rule 1)

- Attributes are **strings only**, kebab-case names, set via `setAttribute` (property
  assignment does not reflect for custom elements).
- A feature must **ignore unknown attributes**.
- A missing required attribute = render nothing + log to console; never throw.
- Attributes are data IN, set once at mount; anything dynamic goes through the bus.

## Outputs & triggers (events — rules 2–4)

### Feature-local signals (rule 2)

Announcements fire as bubbling CustomEvents on the feature element:

- event name prefixed with the feature name (`wake-awake`, not `awake`) — two features
  never collide;
- `detail` is always a plain JSON-serializable object.

### Standard lifecycle signals (rule 3)

Every feature fires, as soon as it can:

- `feat:ready` — the feature finished initializing and is functional;
- `feat:error` — the feature failed (detail: `{message}`), then renders nothing.

Hosts (and the bus) listen for these to tell "loaded and idle" from "crashed" — silent-fail
is for mount errors, not for pretending features are alive.

### The bus (rule 4): envelope, kinds, addresses

All request/reply and cross-feature messaging travels as one envelope — today on a
CustomEvent (`feat-bus`) on `document`, `detail` = the envelope:

```json
{
  "id": "9b1c…",          // uuid — every message (logging/dedupe/replay)
  "contract": 1,          // envelope version; old features stay readable forever
  "kind": "signal | request | response | error",
  "from": "wake-up@v1",   // feature@version (the config row identity) | "host"
  "to": "host",           // optional for requests — routed by event; "*" = broadcast
  "event": "get-user",    // kebab-case, one dialect everywhere
  "payload": { },         // plain JSON only
  "reqId": "3f2a…",       // request/response/error only — the correlation
  "ts": 1710612345678
}
```

- **signal** — fire-and-forget announcement. No reply expected.
- **request** — wants an answer. The helper assigns `reqId`, caller gets a Promise.
  **Addressed by event name**: `serve()` is keyed by event and the first handler wins,
  so `to` is optional (kept for directed requests / log readability). Requests with
  `to: "*"` are announcements — never answered.
- **response** — same `reqId`, `payload` is the answer.
- **error** — same `reqId`, `payload = {code, message}` with stable codes:
  `TIMEOUT` (no answer within the budget), `NO_HANDLER` (nobody serves this event),
  `HANDLER_ERROR` (a handler threw). Old requesters degrade by code, not by parsing prose.

`kind` + `reqId` replace older conventions (`ASK_*` names, reply-by-other-name, `_DONE`)
— the reply is findable by correlation, not by naming rules.

### The helper API (provided by the `bus` feature)

```js
featBus.signal(event, payload)                          // broadcast a signal envelope
featBus.request(event, payload, {timeoutMs = 5000, to?}) // → Promise<payload>, rejects {code, message}
featBus.serve(event, handler)                           // answer requests: (payload, from) => result; returns unsubscribe
featBus.on(pattern, handler)                            // "*", "signal:<event>", "request:<event>", "from:<address>"; returns unsubscribe
featBus.log()                                           // ring buffer of recent envelopes (debugging)
```

Typical host side: `featBus.serve('get-user', () => session.user)`.
Typical feature side: `const user = await featBus.request('get-user')`.

The helper is stateless (no shared instance to load-order-depend on); only the convention
is shared. If `featBus` is absent, features must work without request/reply (announce via
plain signals, degrade silently).

## Lifecycle slot

Applies to all slots (app-init, app-version, header/footer/background, future ones).

## Consumers

| project | language | notes |
|---|---|---|
| feat | js-web | `bus` v1 = reference implementation of this contract |
| plst | js-web (React web) | app-init/app-version slots (adopting) |

## Versions

- **contract 1** (2026-11-13) — envelope + kinds + reqId correlation + error codes +
  attr/event rules + feat:ready/feat:error. Prior art folded in from host/au MFE bus
  (addresses, correlation id, event store); the shared-singleton transport was replaced
  by DOM events on purpose (separate bundles share no module instance).
