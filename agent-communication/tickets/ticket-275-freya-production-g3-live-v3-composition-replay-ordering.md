# Ticket 275 — Freya — Production G3 live-v3 composition and replay ordering

## Blocker

The shipped activation-preflight CLI selects production-live-v3 but cannot load committed live-v3 bundle/policy/keyring inputs. Standalone provenance verification consumes replay before G3 operational mapping.

## Scope

- Add strict protected CLI inputs for live bundle output root + run ID, challenge policy, approved collector keyring, and durable replay root.
- Load and cryptographically verify the committed flat live-v3 bundle without consuming replay.
- Pass challenge/evidence/inventory/receipt/key authorization to preflight core.
- Perform provider verification and operational mapping before DB/public probes.
- Atomically consume replay only after all provider-to-operational mapping succeeds and immediately before DB/public probes; mapping failure consumes nothing.
- A second valid attempt fails replay before probes.
- Production cannot accept fixture-v2, caller-authored inventory, `--now`, test clock, or test transport.
- Add shipped activation-preflight CLI E2E for the production-live-v3 lane with controlled adapters proving exact order, mapping failures, replay, and redaction.
- Preserve existing fixture-v2 local tests explicitly.

## Contract amendment

Ticket 271/274 TLS cases are conditional on a direct HTTP provider adapter. The shipped live collector is subprocess-only and must prove no HTTP/fetch adapter or production transport seam exists. If an HTTP adapter is added later, the complete TLS/redirect/authority matrix becomes mandatory before use.

## Verification

Production-live-v3 CLI E2E, provenance 89+, activation tooling, existing preflight PostgreSQL E2E, API/typecheck/workspace/secret/diff. No live network/provider/hosted database.
