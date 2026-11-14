# DECISIONS archive

Prior threads moved from DECISIONS.md (rotated 2026-11-14). Never delete history.

## 2026-11-13 (3) — RESULT: feature-contract spec + bus v1 shipped locally, browser-verified

1. docs/feature-contract.md — full spec: envelope {id, contract:1, kind signal|request|
   response|error, from, to, event, payload, reqId?, ts}; addresses feature@version|host|*;
   kebab events; error codes TIMEOUT|NO_HANDLER|HANDLER_ERROR; attr rules; feature-local
   signals + standard feat:ready/feat:error; featBus API; migration note (kind+reqId
   replaces ASK_*/_DONE; DOM transport replaces shared BehaviorSubject on purpose).
   docs/bus.md added (per-feature docs template).
2. features/bus/v1/js-web (src mirrored) — window.featBus: signal/request/serve/on/log,
   200-entry ring buffer, contract guard (same version = no-op). BUG FOUND+FIXED during
   browser test: onReply matched the requester's OWN request envelope (same reqId) and
   instantly rejected with the request payload — fixed by ignoring kind==='request'.
   Second trap: /bus/v1/js-web/ is cache-immutable, so retesting a fixed v1 needed a
   ?bust= query — lesson: never hot-edit a published version in dev either, bump vN.
3. know feature-slots.md contract section → summary + pointer to /docs/feature-contract.
Verified in browser (clean page, cache-busted): roundtrip resolve {name, askedBy, echo};
NO_HANDLER immediate; HANDLER_ERROR {code,message:'kaboom'}; TIMEOUT {code, 400ms} via
hanging handler; signal 'signal:wake-awake' on() pattern + envelope log. Routes: /docs/
feature-contract 200, .md 200 text/markdown, /bus/v1/js-web/ 200. NOT committed.
