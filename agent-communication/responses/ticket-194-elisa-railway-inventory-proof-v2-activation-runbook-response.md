# Ticket 194 — Railway Inventory-Proof and V2 Activation Runbook — Response

Task: Ticket 194 — Railway Inventory-Proof and V2 Activation Runbook
Agent: Elisa (architect)
Status: Complete — architecture/runbook only; no hosted operation authorized or performed

## Design output

Created:

```text
docs/2026-07-17-railway-inventory-proof-v2-activation-runbook.md
```

The runbook converts Ticket 186's abstract provider-proof requirement into an operator-bound, implementation-ready Railway protocol.

## Core decisions

### Canonical Railway identity

```text
releaseId = railway:deployment:<RAILWAY_DEPLOYMENT_ID>
```

For Git deployments:

```text
artifactIdentity = git:<full lowercase 40-hex RAILWAY_GIT_COMMIT_SHA>
```

Each Railway capability lease will also carry project, environment, service, deployment, replica, region, and artifact identity derived from Railway-provided runtime variables.

The current Wave U compatibility baseline on fetched `origin/main` is:

```text
e81e211e8995d594559d5cc2d33c88a7730ef2de
```

This is not the activation target. Ticket 198 must use the future full Ticket 197 merge/deployment SHA.

### Trusted operator boundary

- local repository command;
- minimal allowlisted operator-only Nest context, never normal `AppModule`;
- no capability heartbeat, reconciler, gameplay worker, timer, controller, or HTTP listener;
- startup assertion that runtime workers are absent;
- existing operator Railway CLI OAuth session;
- hosted DB credential injected only into the local process;
- no Railway credential stored in the hosted API;
- `--apply` required for mutations;
- dry-run is read-only by default.

### Provider evidence

The verifier will prove:

- exact project/environment/service IDs;
- target deployment is the sole settled `SUCCESS` deployment;
- prior deployments are inactive;
- full immutable Git SHA or image digest;
- exact provider replica count;
- exact fresh target lease cardinality;
- distinct Railway replica IDs;
- zero fresh non-target lease;
- matching activation phase/generation;
- schema, dictionary, reconciler, and Standard readiness.

Unknown statuses, partial pages, raw mutable tags, short SHAs, ambiguous metadata, missing counts, or schema drift fail closed.

### Freshness and anti-replay

Provider evidence is bracketed by hosted PostgreSQL `clock_timestamp()` reads:

```text
maximum provider acquisition interval: 15 seconds
maximum age at transition:             20 seconds
```

Apply always refetches evidence. Proof IDs are UUIDs, single-use, generation/phase/scope bound, and persisted in an append-only activation audit only when the transition commits.

### Atomic transition boundary

Within one serializable transaction:

1. lock activation authority;
2. validate phase/generation and fresh unused provider proof;
3. compare exact fresh lease set and provider identities;
4. verify drain when opening;
5. change phase/generation;
6. append audit;
7. commit together.

The current external verifier call followed by a separate transaction is explicitly insufficient and must be replaced for operator activation.

### Separate approval gates

Approval A permits only:

```text
v1_open -> closing_to_v2
```

After close, fresh evidence must prove drain and closing-generation lease acknowledgement.

Approval B permits only:

```text
closing_to_v2 -> v2_open
```

Open never follows close automatically.

### Rollback

- Integrity uncertainty: explicitly approved `v2_open -> disabled`.
- Lifecycle rollback: `v2_open -> closing_to_v1`, drain, then `closing_to_v1 -> v1_open`.
- Never roll Railway back to an uninstrumented binary while v2 rows exist.
- Provider rollback remains a separate provider mutation.

## Acceptance mapping

### Exact Railway identity mapping

Satisfied by deployment-ID `releaseId`, full immutable artifact identity, and provider fields on every fresh lease.

### Target, previous deployment, and replica proof

Satisfied by exact scoped provider inventory, sole target `SUCCESS`, inactive-status allowlist, unknown-status rejection, authoritative service replica count, and exact fresh lease count.

### Freshness, anti-replay, audit, and sanitization

Satisfied by DB-clock brackets, short proof age, single-use proof IDs, canonical digests, append-only audit, no raw provider metadata/config, and explicit redaction rules.

### Operator-bound credentials

Satisfied by existing Railway CLI OAuth plus local hosted-DB injection. A project token is fallback only and is never hosted.

### Existing transition logic without public endpoint

Satisfied by a local Nest application context and operator-only service that calls the transaction-bound transition path. No public route is allowed.

### Separate close/open transitions

Satisfied by distinct commands, confirmations, approvals, proofs, transactions, and audit rows.

### Drain, acknowledgement, rollback, and cleanup

Satisfied by explicit eligible-v1 queue query, exact generation acknowledgement, bounded waiting, query-only drain, disabled/rollback paths, and credential/temp-file cleanup.

## Implementation handoff

### Freya — Ticket 195

Implement:

- provider-derived release/artifact/replica identity;
- additive lease fields and append-only activation audit;
- strict Railway CLI adapter;
- read-only verifier and sanitized output;
- DB-clock-bracketed `speed_provider_inventory_proof_v2`;
- transaction-bound operator close/open/disable/rollback;
- exact confirmations and approval references;
- no HTTP exposure;
- mocked Railway and disposable-PostgreSQL tests.

### Jasmine — Ticket 196

Independently verify parsing, artifact identity, inventory status, replicas, freshness, anti-replay, lease cardinality, generation races, close/open separation, drain, rollback, zero-write dry-run, audit atomicity, sanitization, Standard isolation, and no public endpoint for at least ten hostile clean-schema runs.

### Yuna — Tickets 197 and 198

- Ticket 197: checkpoint merge/deploy only after QA PASS and approval; remain `v1_open`.
- Ticket 198: dry-run, Approval A, close, drain evidence, Approval B, open, post-open read-only evidence. No gameplay smoke.

## Provider documentation evidence

Official Railway references inspected on 2026-07-17:

- <https://docs.railway.com/integrations/api>
- <https://docs.railway.com/integrations/api/manage-deployments>
- <https://docs.railway.com/integrations/api/manage-services>
- <https://docs.railway.com/cli>
- <https://docs.railway.com/variables/reference#railway-provided-variables>

Also inspected current Railway CLI source to confirm that deployment-list JSON includes deployment ID, status, creation time, and metadata, and that environment configuration exposes replica configuration. Raw environment configuration is therefore prohibited from logs/evidence.

## Verification

```text
# git fetch --quiet origin main
origin/main = e81e211e8995d594559d5cc2d33c88a7730ef2de

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
PASS (no output)

# pnpm secret-scan
Secret scan passed (267 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo,
.cache, tmp, docs, agent-communication.
```

Markdown is excluded by the repository scanner, so the new runbook and response were also manually searched for credential/token material and incomplete markers. No secret value is present; all selectors and credentials remain placeholders or variable names.

## Files changed

```text
docs/2026-07-17-railway-inventory-proof-v2-activation-runbook.md
agent-communication/responses/ticket-194-elisa-railway-inventory-proof-v2-activation-runbook-response.md
agent-communication/tickets/ticket-194-elisa-railway-inventory-proof-v2-activation-runbook.md
agent-communication/tickets/ticket-195-freya-operator-bound-railway-inventory-verifier.md
agent-communication/index.md
```

## Approval boundaries

Ticket 194 authorizes no hosted action.

Explicit future approval remains required for:

1. Ticket 197 merge/deploy/migration;
2. Ticket 198 close transaction;
3. Ticket 198 open transaction after drain evidence;
4. any provider token/configuration mutation;
5. disable, rollback, provider rollback, or hosted gameplay smoke.

## Scope confirmation

No application implementation, migration, deployment, provider setting change, token creation, hosted database mutation, lifecycle transition, dictionary mutation, or gameplay smoke occurred.
