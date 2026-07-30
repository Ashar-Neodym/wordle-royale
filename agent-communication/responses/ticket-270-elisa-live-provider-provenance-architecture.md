# Ticket 270 — Elisa — Live provider provenance architecture

Status: **LOCKED**

## Trust claim

Live evidence is collector-attested evidence from authenticated TLS/provider APIs or pinned absolute CLI executables. It is not provider-signed evidence. A verifier-issued challenge binds a random nonce, run ID, expiry, expected identities, exact collection plan, allowed hosts, source/artifact expectations, and authorized collector key.

## Versions

- `wordle-provider-challenge/v1`
- `wordle-provider-live-evidence/v2`
- `wordle-provider-inventory/v3`
- `wordle-provider-receipt/v3`
- collector `wordle-royale/provider-provenance@3`

Legacy mock-native v1 plus inventory/receipt v2 remains fixture-only. Mixed/downgrade paths fail.

## PostgreSQL

Two independent methods are required for one physical primary: Railway control-plane metadata and fixed read-only direct SQL. Observation IDs/methods differ; physical node IDs may match or be null. Observation count never implies replica count.

## G3 order

Challenge/key verification → collector signature → operation allowlist/bounds/digests → inventory v3 derivation → receipt v3 → global isolation → PostgreSQL method agreement → operational mapping → atomic nonce consumption → DB/public probes → `providerDerived=true`.

No hosted action is authorized.
