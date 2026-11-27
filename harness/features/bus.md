# bus / feature-contract

Docs: `back/docs/bus.md`, `back/docs/feature-contract.md`; code:
`back/features/bus/v1/js-web/` (src in `back/src/bus/`).

The host↔feature contract (mount lifecycle, messaging) and `window.featBus` —
its reference implementation: envelope routing, request/reply with timeouts,
log buffer. js-web only (the contract's frontend half); backend-slots is the
server half (see loader.md). Consumers of the bus: http-gate, wake-up,
global-loading, version-display sdui.
