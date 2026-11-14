# global-loading

Full-screen blocking loader driven by bus signals — the visual half of "the app is
frozen while something pending blocks it". v1 pairs with http-gate: a recovery episode
(waking a sleeping backend) signals the loader around itself.

## How it works

Listens directly on the bus transport (CustomEvents on `document`), so it works with or
without the `bus` helper loaded and in any load order:

- signal `global-loading-start` → backdrop appears (counter-based: overlapping starts
  each count once; the backdrop hides when the last one ends)
- signal `global-loading-end` → decrement; hide at zero

The backdrop covers everything (`z-index` max), blocks all pointer interaction, and
shows a spinner + "loading…". Today http-gate emits the pair around every recovery
episode (spec/http-gate.md) — via `featBus.signal`, so `featBus.log()` shows them.

## Environments

None. No config, no attributes.

## Inputs

None (bus signals only — see above).

## Outputs & triggers

Purely visual; emits nothing.

## Lifecycle slot

None / invisible chrome. Mount once on app boot; it stays hidden until a start signal.

## Consumers

Any app using http-gate (indirectly — the gate emits the signals). Direct signaling is
part of the feature contract: any feature may send the start/end pair.

## Versions

- **v1** (2026-11-14) — first release: counter-based backdrop + spinner, transport-level
  listener (no featBus dependency).
