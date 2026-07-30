# Provider provenance inventory and receipt

The repository has two deliberately separate provenance lanes.

## Production live lane (v3)

Production activation uses these exact versions:

- `wordle-provider-challenge/v1`
- `wordle-provider-live-evidence/v2`
- `wordle-provider-inventory/v3`
- `wordle-provider-receipt/v3`
- collector identity `wordle-royale/provider-provenance@3`

`scripts/provider-provenance-live-core.mjs` is the offline schema, derivation, and verification core. `scripts/provider-provenance-live-collector-core.mjs` and `scripts/provider-provenance-live.mjs` add the production collector, Ed25519 keyring verifier, protected filesystem handling, process boundary, atomic publication, and durable replay ledger. Evidence is **collector-attested** evidence from provider-authenticated collection; it is not provider-signed evidence.

A verifier challenge binds the challenge ID, run ID, nonce, bounded issue/expiry window, authorized Ed25519 collector key ID, exact expected identities and source/artifact expectations, exact PostgreSQL subjects, and an eight-operation collection plan with allowed target hosts. The protected challenge ID/run ID/nonce/key ID must also be supplied out of band. The evidence and receipt have independent collector signatures and bind canonical challenge, evidence, and inventory digests. The replay interface is an atomic `consume(nonce) -> boolean`: it is called only after the complete bundle verifies (and, in G3, after operational mapping), and false rejects replay before any database or public probe.

All schemas reject unknown and omitted fields. Live verification rejects fixture/native-v1 evidence, v2 inventories/receipts, mixed challenge/run/nonce/key identities, stale challenges, signature changes, operation changes, duplicate evidence digests, and caller-authored inventory changes.

### Honest PostgreSQL subject observations

Each environment has one PostgreSQL **subject**, not a replica list or inferred topology count. Exactly two independent observations are required:

1. `railway-control-plane`
2. `postgres-direct-sql`

Observation IDs, challenge operation IDs, and methods are unique and exact. Evidence digests are globally unique. `physicalNodeId` is nullable and may be identical in both observations; observation cardinality never means replica cardinality. The strict schema has no replica role, replica label, or replica count field.

Both observations must carry the exact challenge-bound project/environment/service/deployment/cluster/database/database-name/schema/schema-digest/endpoint scope. Field provenance distinguishes values observed by a method from values bound from the protected challenge or direct connection configuration. Both methods must classify the endpoint as `direct`; `pooler` is rejected.

The direct SQL observation proves the database name, schema name, and schema digest using only the fixed `wordle-postgresql-subject-readonly/v1` operation. Its exact query and SHA-256 digest are exported as `POSTGRES_SQL` and `POSTGRES_SQL_DIGEST`; the pinned adapter is invoked with that query ID/digest and an explicit read-only transaction contract. The adapter canonicalizes the ordered schema manifest and returns only sanitized facts. Those facts are limited to database/schema/schema digest, hashed server address, bounded server port, and `isInRecovery=false`. Arbitrary commands, caller-provided argv, SQL, URLs, and environment variables are not accepted.

### Production collector and offline verifier

The live CLI deliberately has no `--now`, fixture, transport injection, command, SQL, token, or URL option. Its clock is the production clock.

```sh
pnpm provider-provenance:live collect \
  --challenge /protected/challenge.json \
  --policy /protected/challenge-policy.json \
  --plans /protected/operation-plans.json \
  --signing-key /protected/collector-ed25519.pem \
  --output-dir /protected/committed-bundles

pnpm provider-provenance:live verify \
  --output-dir /protected/committed-bundles \
  --run-id RUN_ID \
  --policy /protected/challenge-policy.json \
  --keyring /protected/approved-collector-keyring.json \
  --replay-dir /protected/consumed-nonces
```

Every CLI path must be absolute. Every input and signing file must be a no-follow, owner-owned regular file with mode `0600`. Output, executor-staging, and replay directories are owner-owned `0700`; committed JSON and replay markers are `0600`. Publication keeps the output root open with `O_DIRECTORY|O_NOFOLLOW` and uses its descriptor anchor even if its pathname is replaced. It creates the flat canonical names `RUN_ID.challenge.json`, `RUN_ID.evidence.json`, `RUN_ID.inventory.json`, and `RUN_ID.receipt.json` using `O_CREAT|O_EXCL|O_NOFOLLOW`, records each opened inode, writes and fsyncs it, then publishes `RUN_ID.commit.json` last. The canonical commit binds the exact component names and byte digests. Failure cleanup unlinks only a still-matching created inode and preserves unknown or raced replacements. The root is fsynced after components, commit, and cleanup. Verification receives the output root plus run ID, requires the canonical commit and exact run-prefixed set, and rejects partial, extra, replaced, or digest-mismatched bundles. Replay consumption remains descriptor-anchored and atomic with `O_EXCL`.

Operation plans use `wordle-provider-operation-plans/v1`. They pin absolute executable path and realpath, SHA-256, exact `--version` output, UID, and exact non-group/world-writable executable mode. The production runner snapshots the validated bytes before spawn and uses `shell:false`, fixed argv, closed stdin, a fixed minimal environment, timeout/SIGKILL, and independent stdout/stderr caps. Adapter failures expose fixed codes only; stderr and response snippets never enter evidence or CLI errors. Raw adapter bytes are bounded and SHA-256-addressed while structural allowlists copy only identity, artifact, variable state, and PostgreSQL observation facts into evidence.

The approved keyring uses `wordle-provider-collector-keyring/v1` and exact entries `{keyId, publicKeyPem, notBefore, notAfter, revokedAt}`. Key IDs must be unique at lookup, the key must be Ed25519 and active when evidence was collected, and any revoked entry is rejected. Rotation is performed by adding a distinct active key ID and issuing new challenges for it; duplicate IDs and unknown keys fail closed.

## Legacy fixture lane (v2)

`scripts/provider-provenance-core.mjs`, `scripts/provider-provenance-fixture.mjs`, and their old tests remain unchanged as the deterministic Ticket 262 mock-native fixture lane (`native-evidence/v1`, inventory/receipt v2, collector v2). Preflight can use it only when the caller explicitly selects `fixture-v2-test-only`. The production/default path requires `production-live-v3`; omitted, mixed, downgrade, and mock lanes fail before public or database adapters run.

The API CLI permits the fixture lane only when both `NODE_ENV=test` and `RUN_AUTH_PREFLIGHT_CLI_E2E=1` are set. Outside that controlled test seam it selects the production-v3 lane, so old fixture inputs cannot yield `providerDerived=true`.

## Verification

```sh
pnpm test:provider-provenance
pnpm test:provider-provenance:fixture-v2
pnpm test:provider-provenance:live-v3
pnpm test:provider-provenance:live-collector
pnpm test:auth:activation-tooling
pnpm typecheck:provider-provenance
pnpm secret-scan
```

The hostile live suite covers one-node positives, repeated/null physical node identity, every subject-scope mutation, duplicate IDs/methods/digests, missing SQL schema proof, fixed-query mutation, pooler confusion, challenge freshness/protected policy, key/signature mutation, mixed versions, receipt digest mutation, and replay ordering.
