# Ticket 206 — Railway Live-Schema Fleet-Proof Independent QA — Response

Task: Ticket 206 — Railway Live-Schema Fleet-Proof Independent QA
Agent: Jasmine (QA)
Verdict: **PASS**

Ticket 205 closes the Railway CLI 5.27.1 live-status schema compatibility blocker without weakening exact fleet proof. Ticket 207 may proceed only under its own provider-compatibility checkpoint, PR, and CI authorization. This PASS does not authorize hosted access, provider mutation, deployment, lifecycle transition, merge, or release.

## Acceptance criteria checked

- Permanent sanitized Railway 5.27.1 fixture with nullable status count, one `RUNNING`, one `REMOVED`, and configured regional count one.
- Numeric `numReplicas` cross-check against region sum, exact RUNNING count, and operator expectation.
- Missing, empty, malformed, zero, negative, fractional, unsafe, contradictory, and nonnumeric regional configuration.
- All-removed, missing, extra, duplicate, blank, and noncanonical serving identities.
- Exact `RUNNING` serving semantics and exact `REMOVED` terminal semantics; unknown, transitional, failed, missing, null, lowercase, and legacy `SUCCESS` instance states fail closed.
- Rollout overlap, extra successful deployment, nonexact `deploymentStopped`, linked/scoped disagreements, truncation, and contradictory counts.
- Proof binding for exact serving replica IDs, regional allocation, and deterministic inventory digests.
- Closed sanitized provider-error allowlist and hostile error-code collapse.
- Canonical provider/operator/PostgreSQL/API/contracts/build/typecheck/Prisma/workspace/security/diff gates.

## Evidence / result

### Live-schema compatibility

`apps/api/test/fixtures/railway-status-5.27.1-live-sanitized.json` contains only sanitized placeholder scope, deployment, replica, and host identities. It locks:

- `numReplicas: null`;
- one `RUNNING` replica;
- one stale `REMOVED` replica;
- exact successful, unstopped deployment identity;
- exact environment/service scope;
- canonical public health host.

The adapter accepts this only when a complete positive `multiRegionConfig` supplies cardinality one. It does not infer a default count.

### Independent adversarial verification

Temporary QA suite: **5/5 passed**.

It independently proved:

1. Nullable and numeric live counts both succeed only when RUNNING count, regional sum, and expected count agree.
2. The returned observation contains only the exact serving replica ID and exact sorted region allocation.
3. Replica-ID, regional-allocation, and full inventory digests equal an independently canonicalized SHA-256 calculation.
4. Missing/null/array/empty region config; null entries; zero, negative, fractional, unsafe, string counts; malformed region names; and count contradictions fail closed.
5. Expected-count disagreement returns `railway_replica_count_mismatch`.
6. All-removed fleets, extra RUNNING rows, duplicates across RUNNING/REMOVED, blank/noncanonical IDs, and every nonexact state fail closed.
7. Rollout overlap, missing/true/null/string/numeric `deploymentStopped`, and linked/scoped terminal/count disagreements fail closed.
8. Recognized provider errors remain on a closed allowlist; hostile and secret-shaped codes are rejected.

### Canonical focused suite

`pnpm test:speed-lifecycle-operator`: **36/36 passed**.

This preserved:

- cancellation-ignoring Railway command serialization;
- scope/deployment/artifact/replica/region exactness;
- public-origin/NAT64/mixed-DNS fencing and address pinning;
- absolute deadlines;
- dry-run zero-write behavior;
- approval/confirmation boundaries;
- lease identity and regional allocation checks;
- stable sanitized provider errors.

### PostgreSQL integration

Fresh operator integration: **50/50 passed across ten disposable schemas**.

Covered migrations, dry-run zero writes, hostile lease sets, exact schema/index checks, append-only audit protection, rollback on audit failure, guarded creator serialization, close/open separation, drain and generation acknowledgement, rollback symmetry, and Standard availability.

Every `ticket195_*` schema was dropped. Final matching schema count: **0**. Final granted advisory-lock count: **0**.

### Broader gates

- Full API: **199/199 passed**.
- Contracts: **24/24 passed**.
- API typecheck: passed.
- Web typecheck: passed.
- Workspace build: passed across all applicable projects.
- Workspace validation: **9 packages passed**.
- Prisma validate/generate: passed.
- Production API startup smoke: passed; `/readyz` returned `status=ok`.
- Secret scan: passed across **282 source/config files**.
- `git diff --check`: passed.
- Static controller search found no public operator/activation endpoint.

## Commands run + exit codes

```text
pnpm exec node --import tsx --test /tmp/ticket206-jasmine-adversarial.test.ts
  exit 0 — 5/5

pnpm test:speed-lifecycle-operator
  exit 0 — 36/36

SPEED_OPERATOR_ITERATIONS=10 pnpm test:postgres:speed-lifecycle-operator
  exit 0 — 50/50 across ten disposable schemas

pnpm test  # apps/api
  exit 0 — 199/199

pnpm test  # packages/contracts
  exit 0 — 24/24

pnpm typecheck  # apps/api
  exit 0

pnpm typecheck  # apps/web
  exit 0

pnpm build
  exit 0

pnpm validate:workspace
  exit 0 — 9 packages

pnpm db:validate && pnpm db:generate
  exit 0

pnpm smoke:api:prod-start
  exit 0 — production startup and /readyz passed

pnpm secret-scan
  exit 0 — 282 files

git diff --check
  exit 0
```

## Browser / visual evidence

Not applicable. Ticket 205 changes backend/operator parsing, proof validation, and tests only; no rendered UI or browser route changed.

## Findings

No release-blocking defect reproduced.

Non-blocking coverage recommendations:

- Permanently pin exact expected digest values for the live fixture rather than only hash shape.
- Add permanent direct cases for fractional/unsafe regional counts, duplicate IDs shared across RUNNING/REMOVED, all nonexact `deploymentStopped` values, and more linked/scoped field disagreements. These cases passed the independent suite against current code.
- Consider a combined sanitized fixture for all relevant status/config/deployment command responses, not status alone, to detect future provider schema drift.

## Required fixes / owner

None for Ticket 206.

## Residual risks

- Compatibility is deliberately pinned to exact Railway CLI **5.27.1**. Any different CLI version or future schema must fail closed and receive a new compatibility review.
- No authenticated Railway query or hosted database access occurred during this QA; this verifies the permanent sanitized fixture and local operator proof behavior.
- Ticket 207 still owns the exact checkpoint/PR/CI review. Ticket 203/204 lifecycle operations remain separately approval-gated.
- Ticket 205 changes remain in a shared dirty worktree; the checkpoint must commit only the exact reviewed artifacts and intentional communication updates.

## Cleanup

- Removed `/tmp/ticket206-jasmine-adversarial.test.ts`.
- Confirmed zero disposable `ticket195_*` schemas and zero granted advisory locks.
- Confirmed no Ticket 206/operator/API QA process remained; the only `pgrep` match was the cleanup command itself.
- Production smoke reused and left the pre-existing local PostgreSQL/Redis dependencies running as documented; no new project dependency ownership was introduced.
- No Railway, hosted database, deployment, provider mutation, lifecycle transition, or merge occurred.
