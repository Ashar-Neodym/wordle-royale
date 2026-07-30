# Provider provenance inventory and receipt

Ticket 262 provides an **offline, read-only verification boundary** for mocked native Vercel, Railway, and PostgreSQL evidence. It makes no network calls, reads no provider credentials, and mutates no provider state. Evidence must use `wordle-provider-native-evidence/v1`: each provider/environment response is an adapter-specific Ed25519-signed envelope. The collector pins each mocked adapter's public key and derives the sanitized inventory from the authenticated payload; an inventory supplied by a caller is never accepted as evidence.

## Security and transport

```sh
pnpm provider-provenance collect \
  --snapshot /secure/native-evidence.json \
  --expected-identities /secure/expected-identities.json \
  --expected-nonce challenge-from-verifier \
  --inventory /transport-a/inventory.json \
  --receipt /transport-b/receipt.json \
  --key-file /secure/receipt-hmac-key \
  --key-id operator-key-v1

pnpm provider-provenance verify \
  --snapshot /secure/native-evidence.json \
  --expected-identities /secure/expected-identities.json \
  --expected-nonce challenge-from-verifier \
  --inventory /transport-a/inventory.json \
  --receipt /transport-b/receipt.json \
  --key-file /secure/receipt-hmac-key
```

The expected identity file is an out-of-band exact map of `preview` and `production`, then `vercel`, `railway`, and `postgresql`, containing each adapter's expected identity fields. The nonce is also supplied out of band. Native evidence defaults to a five-minute maximum age and 30-second future-clock tolerance. `--now ISO` exists only for deterministic offline replay/tests.

The HMAC key file must contain at least 32 bytes and is never emitted. Snapshot, inventory, and receipt paths must be distinct; inventory and receipt should use independent transport channels. Output files are canonical JSON with mode `0600`. `collect` produces no stdout. `verify` emits only `VALID`.

The v2 receipt binds the canonical strict inventory digest and the complete authenticated native-evidence digest, plus collector/schema/key identities. Verification requires the native snapshot, re-authenticates every adapter envelope, checks freshness/nonce/expected identities, independently re-derives the inventory, and compares both digests.

## Activation-preflight composition

The production durable-auth activation preflight consumes this boundary directly. Its explicit inputs are the v2 inventory, structured v2 receipt, signed native snapshot, expected identity map, expected nonce, protected receipt-key file, and a separate schema-v3 operational phase inventory. Authentication completes before database code is loaded, public probes begin, or any provider field is translated.

The operational run ID/nonce, collection time, source and artifact identity, Railway project/environment/service/deployment, Vercel project/deployment, and production/preview PostgreSQL database IDs must agree exactly. The canonical preflight artifact embeds the complete sanitized provider inventory and receipt, thereby binding all remaining Vercel/Railway artifacts and manifests/attestations and every PostgreSQL cluster/database/replica/schema observation. A caller-authored phase inventory or plain digest is never sufficient for `providerDerived=true`.

## Strict inventory guarantees

`validateInventory` and receipt verification fail closed on unknown/omitted fields and validate all collector, identity, variable, artifact, manifest, observation, and provenance fields. Provider values never enter inventory or receipt. Only variable name, required policy, and `absent`, `explicitly-empty`, `non-empty`, or `masked-unknown` state are retained. Required variables must be `non-empty`.

Vercel and Railway artifacts carry deployment ID, independent artifact digest and trimmed nonblank derivation. Their manifest/attestation binds both artifact digest and deployment ID. Preview and production cannot reuse an artifact. Vercel and Railway source Git SHAs agree within each environment without being used as artifact identities.

Isolation is global rather than same-field-only: no identity/resource ID in preview may occur anywhere in production, even under another provider or field. PostgreSQL cluster, database, and every replica ID participate in that check. At least two PostgreSQL observations must independently agree on cluster, database, and schema digest.

## Permanent hostile checks

`scripts/provider-provenance.test.mjs` permanently exercises all six independent-QA blocker classes recorded in `scripts/fixtures/provider-provenance-hostile.json`: strict inventory shape, authenticated native origin, bounded freshness and challenge binding, deployment/artifact/manifest linkage, global isolation (including replica and cross-provider collisions), and trimmed nonblank derivations. It also covers variable-state preservation, required-variable failure, canonical separate outputs, evidence tampering, and non-disclosure.

```sh
pnpm test:provider-provenance
pnpm typecheck:provider-provenance
pnpm secret-scan
```
