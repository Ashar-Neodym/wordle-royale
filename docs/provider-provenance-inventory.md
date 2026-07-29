# Provider provenance inventory and receipt

Ticket 262 adds an **offline, read-only boundary** for provider evidence. The command does not import an SDK, make network calls, discover credentials, or mutate provider state. An operator must first export mocked/read-only responses into the strict `wordle-provider-snapshot/v1` shape. The strict adapters then derive inventory; callers cannot submit an inventory directly to `collect`.

## Security and transport

```sh
pnpm provider-provenance collect \
  --snapshot /secure/provider-snapshot.json \
  --inventory /transport-a/inventory.json \
  --receipt /transport-b/receipt.json \
  --key-file /secure/receipt-hmac-key \
  --key-id operator-key-v1

pnpm provider-provenance verify \
  --inventory /transport-a/inventory.json \
  --receipt /transport-b/receipt.json \
  --key-file /secure/receipt-hmac-key
```

The key file must contain at least 32 bytes. It is read only and is never emitted. Inventory and receipt paths must differ; use independent transport/channels in operation. Output files are canonical JSON with mode `0600`. `collect` produces no stdout. `verify` emits only `VALID` and also rejects required variables whose values are absent, explicitly empty, or masked/unknown.

The receipt HMAC binds:

- the canonical sanitized inventory digest;
- the canonical source-evidence digest (not the source content);
- collector and schema identity; and
- key identity.

Provider values never appear in inventory or receipt. Only variable name, policy (`required`), and one of `absent`, `explicitly-empty`, `non-empty`, or `masked-unknown` are retained. A provider `null`, omission inside an observed entry, ambiguous masked/value pair, unknown field, or duplicate entry fails closed.

## Snapshot contract

The top level is exactly:

- `schemaVersion`: `wordle-provider-snapshot/v1`
- `collectedAt`: ISO timestamp supplied by the evidence export
- `trackedVariables`: exact maps for `vercel`, `railway`, and `postgresql`
- `requiredVariables`: subsets of tracked names
- `providers`: exact provider maps, each containing `preview` and `production`

Adapters bind these observed identities:

| Adapter | Required identity/evidence |
| --- | --- |
| Vercel web | project, environment, deployment; source Git SHA; independent deployment artifact digest; build/runtime manifest digest or attestation; variable observations |
| Railway API | project, environment, service, deployment; source Git SHA; independent image/artifact digest; build/start/runtime manifest digest or provider-managed attestation; variable observations |
| PostgreSQL | project, environment, service, deployment; at least two replica observations agreeing on cluster, database and schema digest; variable observations |

Every preview identity must differ from its production counterpart. PostgreSQL cluster and database IDs must also differ. Vercel and Railway source Git SHAs must agree within each environment, while each provider's artifact digest remains independent and carries an explicit derivation. Every manifest/attestation includes `subjectArtifactDigest`, so a manifest cannot be substituted across deployments.

A digest is lowercase `sha256:<64 hex>`. A source revision is a separate 40-character lowercase Git SHA and is never accepted as an artifact identity.

## Mock fixtures and checks

`provider-provenance-fixture.mjs` creates harmless mocked provider evidence. `fixtures/provider-provenance-hostile.json` contains declarative hostile mutations for stale/mixed source identity, provider omission/null, artifact/manifest mismatch, replica disagreement, preview overlap, and manifest ambiguity. Tests also exercise empty versus absent state, masked required values, receipt tampering, separate output, and non-disclosure.

```sh
pnpm test:provider-provenance
pnpm typecheck:provider-provenance
pnpm secret-scan
```
