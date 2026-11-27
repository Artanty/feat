# http-gate

Docs: `back/docs/http-gate.md`; spec: `back/spec/http-gate.md`; code:
`back/features/http-gate/v1 (js-web), v2 (js-web, js-ext)`;
src in `back/src/http-gate/`.

`window.featGate` — browser-side single-flight recovery interceptor over
featBus: on a config-matched failure (`{on:'ERROR', trigger:503}` / v2
`{on:'NETWORK'}`) it parks failed requests, holds new ones before send, fires
ONE bus recovery request (e.g. wake-up), replays parked/held once (loop
guard). Config `timeoutMs` default 200000 — MUST exceed the provider's budget
(bus default is only 5s).

Decisions: v2's NETWORK rule came from a prod HAR diagnosis; js-ext config
must be read lazily (MV3 captures-at-load bug — incidents/26-11-14). Server
side has NO equivalent — it's web-only by design.
