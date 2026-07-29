# Ticket 266 — Yuna — Compose authenticated provider provenance into activation preflight

## Blocker

Provider collector emits authenticated `wordle-provider-inventory/v2` plus structured HMAC receipt, while activation preflight accepts separate caller-authored schema-v3 inventory and plain digest. Preflight can therefore claim `providerDerived=true` without verifying Ticket 262 evidence.

## Goal

Make activation preflight consume and verify authenticated provider evidence end-to-end.

## Acceptance

- Explicit CLI inputs for provider inventory, structured receipt, signed native evidence, expected nonce/identity, and operational phase inventory as needed.
- Verify Ticket 262 receipt/native evidence before translating or composing fields.
- Bind every overlapping project/environment/service/deployment/artifact/manifest/replica/database identity into the preflight canonical receipt; mismatches fail closed.
- `providerDerived=true` is impossible unless verification passed.
- Caller-authored claims alone, plain self-hashes, stale/mixed receipts, missing native evidence, or schema-v2 passed directly as schema-v3 all fail.
- Permanent cross-lane tests exercise the production CLI, not only helpers.
- No live provider calls or secrets.
