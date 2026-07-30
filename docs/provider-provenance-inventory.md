# Provider provenance inventory and receipt

The repository has two deliberately separate provenance lanes.

## Production live lane (v3)

Production activation uses these exact versions:

- `wordle-provider-challenge/v1`
- `wordle-provider-live-evidence/v2`
- `wordle-provider-inventory/v3`
- `wordle-provider-receipt/v3`
- collector identity `wordle-royale/provider-provenance@3`

`scripts/provider-provenance-live-core.mjs` is the offline schema, derivation, and verification core. It performs no network, process, provider, or database collection. The collector and protected-key/transport implementation are intentionally outside Ticket 272.

A verifier challenge binds the challenge ID, run ID, nonce, bounded issue/expiry window, authorized Ed25519 collector key ID, exact expected identities and source/artifact expectations, exact PostgreSQL subjects, and an eight-operation collection plan with allowed target hosts. The protected challenge ID/run ID/nonce/key ID must also be supplied out of band. The evidence and receipt have independent collector signatures and bind canonical challenge, evidence, and inventory digests. The replay interface is an atomic `consume(nonce) -> boolean`: it is called only after the complete bundle verifies (and, in G3, after operational mapping), and false rejects replay before any database or public probe.

All schemas reject unknown and omitted fields. Live verification rejects fixture/native-v1 evidence, v2 inventories/receipts, mixed challenge/run/nonce/key identities, stale challenges, signature changes, operation changes, duplicate evidence digests, and caller-authored inventory changes.

### Honest PostgreSQL subject observations

Each environment has one PostgreSQL **subject**, not a replica list or inferred topology count. Exactly two independent observations are required:

1. `railway-control-plane`
2. `postgres-direct-sql`

Observation IDs, challenge operation IDs, and methods are unique and exact. Evidence digests are globally unique. `physicalNodeId` is nullable and may be identical in both observations; observation cardinality never means replica cardinality. The strict schema has no replica role, replica label, or replica count field.

Both observations must carry the exact challenge-bound project/environment/service/deployment/cluster/database/database-name/schema/schema-digest/endpoint scope. Field provenance distinguishes values observed by a method from values bound from the protected challenge or direct connection configuration. Both methods must classify the endpoint as `direct`; `pooler` is rejected.

The direct SQL observation proves the database name, schema name, and schema digest using only the fixed `wordle-postgresql-subject-readonly/v1` operation. Its exact query and SHA-256 digest are exported as `POSTGRES_SQL` and `POSTGRES_SQL_DIGEST`; the fixed query reads an ordered schema manifest which the Ticket 273 collector must canonicalize and hash, while only the digest enters evidence. Sanitized facts are limited to database/schema/schema digest, hashed server address, bounded server port, and `isInRecovery=false`. Arbitrary SQL or process collection is not implemented.

## Legacy fixture lane (v2)

`scripts/provider-provenance-core.mjs`, `scripts/provider-provenance-fixture.mjs`, and their old tests remain unchanged as the deterministic Ticket 262 mock-native fixture lane (`native-evidence/v1`, inventory/receipt v2, collector v2). Preflight can use it only when the caller explicitly selects `fixture-v2-test-only`. The production/default path requires `production-live-v3`; omitted, mixed, downgrade, and mock lanes fail before public or database adapters run.

The API CLI permits the fixture lane only when both `NODE_ENV=test` and `RUN_AUTH_PREFLIGHT_CLI_E2E=1` are set. Outside that controlled test seam it selects the production-v3 lane, so old fixture inputs cannot yield `providerDerived=true`.

## Verification

```sh
pnpm test:provider-provenance
pnpm test:provider-provenance:fixture-v2
pnpm test:provider-provenance:live-v3
pnpm test:auth:activation-tooling
pnpm typecheck:provider-provenance
pnpm secret-scan
```

The hostile live suite covers one-node positives, repeated/null physical node identity, every subject-scope mutation, duplicate IDs/methods/digests, missing SQL schema proof, fixed-query mutation, pooler confusion, challenge freshness/protected policy, key/signature mutation, mixed versions, receipt digest mutation, and replay ordering.
