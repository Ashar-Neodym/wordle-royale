# Ticket 186 — Mixed-Version Speed Lifecycle Activation Contract — Response

Task: Ticket 186 — Mixed-Version Speed Lifecycle Activation Contract
Agent: Elisa (architect)
Status: Complete — architecture/deployment contract only
Date: 2026-07-17

## Design output

- `docs/2026-07-17-mixed-version-speed-lifecycle-activation-contract.md`

## Root decision

Use PostgreSQL as the shared activation authority and enforce identity at both application and database write boundaries.

Exact identities:

```text
controlProtocol=speed_lifecycle_activation_gate_v1
v1=speed_ready_v1_match_created_20s
v2=speed_ready_v2_first_ack_90s
```

Exact phases:

```text
v1_open
closing_to_v2
v2_open
closing_to_v1
disabled
```

Rollout has two separately gated phases:

1. Deploy gate-aware v1+v2 compatibility code/schema while shared creation remains v1.
2. Close Speed creation, drain eligible v1 queue work, prove the serving fleet, then atomically open v2.

## Why both fleet proof and database guards are required

Capability leases cannot detect an uninstrumented old process. Provider deployment inventory cannot stop a hidden/stale process from attempting a write. Therefore activation requires:

- Railway target release/previous-deployment/replica inventory proof;
- fresh shared capability leases matching that inventory;
- application readiness agreement;
- database triggers that reject incompatible Speed ticket/match inserts.

After v2 activation, a stale Wave T process can fail a Speed request but cannot create null/v1 work. Standard is outside the guard predicates.

## Shared persistence

Add canonical activation state:

```text
key=speed_1v1
protocol=speed_lifecycle_activation_gate_v1
phase=v1_open
activeCreationVersion=v1
generation=1
```

Add capability leases:

```text
heartbeatIntervalMs=10_000
leaseTtlMs=30_000
releaseId=immutable build/commit/image revision
```

Add `MatchmakingTicket.readyLifecycleVersion`:

```text
Speed null = legacy v1
Speed explicit v1 = gate-aware compatibility work
Speed explicit v2 = activated Wave U work
Standard = null and unaffected
```

The migration seeds v1, never v2. Missing control state fails Speed closed instead of defaulting to v1.

## Database enforcement matrix

| Shared phase | Old/null write | Explicit v1 | Explicit v2 |
|---|---:|---:|---:|
| `v1_open` | allow | allow | reject |
| `closing_to_v2` | reject | reject | reject |
| `v2_open` | reject | reject | allow |
| `closing_to_v1` | reject | reject | reject |
| `disabled` | reject | reject | reject |

Apply this to new Speed queue tickets and Speed matches. Terminal cleanup updates remain allowed.

Ticket identity, both claimed ticket versions, match identity, active identity, and activation generation must agree in the pairing transaction.

## Mixed-version behavior

### Old Wave T binary

- Safe to create null/v1 during `v1_open`.
- Rejected by DB during closing or `v2_open`.
- Must be absent from serving provider inventory before v2 opens.

### New compatibility binary

- Supports v1, v2, legacy reconciliation, and gate protocol.
- Registers/renews a shared capability lease.
- Defaults creation safely to shared v1 before activation.
- Reads shared authority in every Speed join/pair transaction.
- Reconciles persisted v1/v2 independently of current creation state.

### Unsupported/stale gate-aware binary

- Closes Speed readiness/catalog/endpoints locally.
- Continues Standard.
- Never falls back to a process-local lifecycle default.

## Activation sequence

### Phase A

- Apply additive migration and seed `v1_open`.
- Deploy compatibility code.
- Old/new rolling overlap creates only v1/null-equivalent work.
- Prove target Railway deployment is active, prior deployments stopped, replica count known, and fresh target leases match exactly.

### Phase B1 — close/drain

Separately approved transaction:

```text
v1_open -> closing_to_v2
activeCreationVersion -> null
generation -> next
```

Require:

- zero eligible queued v1 Speed tickets;
- no in-flight guarded creation transaction;
- target leases fresh and observing closing generation;
- provider inventory still target-only;
- schema/dictionary/reconciler healthy.

Matched tickets and existing v1 matches may continue because compatibility code reconciles them by persisted identity.

### Phase B2 — open v2

Separately approved transaction:

```text
closing_to_v2 -> v2_open
activeCreationVersion -> speed_ready_v2_first_ack_90s
generation -> next
```

Recheck queue drain, leases, release, replicas, and generation atomically.

### Phase B3

Observe all target instances acknowledge v2 generation and confirm catalog/readiness before any separately authorized hosted gameplay smoke.

## Readiness/catalog

Speed closes on missing, malformed, closing, unsupported, stale-lease, schema, dictionary, or reconciler state.

A Speed-only activation disagreement must not make the entire API globally unready when Standard/core remain usable. Catalog advertises Speed `queueEnabled=false` during closing or disagreement. Cached catalog state never authorizes writes.

## Worker compatibility

Workers select logic by persisted lifecycle identity—not active creation identity—and continue:

- legacy null/v1 reconciliation;
- explicit v1 reconciliation;
- explicit v2 reconciliation;
- existing generation-fenced completion.

Unknown persisted identity is skipped and reported unhealthy; never guessed or backfilled.

## Rollback

- Emergency `disabled` closes only new Speed creation.
- Never directly flip `v2_open -> v1_open`.
- Use `closing_to_v1`, drain eligible v2 queue work, retain gate-aware v1+v2 compatibility code, repeat fleet proof, then reopen v1.
- Never roll back to uninstrumented Wave T code while v2 rows exist.
- Do not drop additive schema/guards while lifecycle rows exist.

## Required implementation tests

- Old null/new explicit-v1 overlap under `v1_open`.
- Atomic closing waits for in-flight guarded insert.
- All Speed creation rejects while closing.
- Old null/v1 rejects and new v2 succeeds under `v2_open`.
- Generation changes leave no incompatible/stranded ticket.
- Ticket/match versions must agree.
- Missing/corrupt control and stale lease close Speed.
- Existing v1/v2 rows reconcile under all phases.
- Standard succeeds throughout.
- Activation refuses queue/lease/release/replica mismatch.
- Rollback is drain-first and compatibility-preserving.
- Ten consecutive clean-schema hostile mixed-version runs.

## Implementation handoff

### Freya / Ticket 187

- Implement control/lease/ticket schema and write guards.
- Seed v1 only.
- Bind mode-scoped readiness/catalog and transaction-locked creation authority.
- Persist explicit identity in gate-aware tickets/matches.
- Add mixed old/new, trigger, generation, drain, rollback, and PostgreSQL tests.
- Do not execute hosted activation.

### Yuna / Tickets 180–181

- Treat compatibility deployment/migration and v2 activation as separate approval gates.
- Prove provider inventory against leases.
- Never activate based on one health request or lease.
- Do not mutate provider settings merely to satisfy missing evidence without approval.

### Jasmine / Ticket 188

Independently verify schema/trigger completeness, mixed binaries, drain, stale processes/leases, generation CAS, persisted-version reconciliation, Speed-only closure, catalog/readiness truth, rollback, ten clean runs, and spoiler/secret safety.

## Verification

```text
# date +%F
2026-07-17

# CI=true pnpm typecheck
$ pnpm validate:workspace
$ node scripts/validate-workspace.mjs
Workspace scaffold validation passed (9 workspace packages).

# git diff --check
Passed with no output.

# pnpm secret-scan
Secret scan passed (257 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Ticket 186 changes architecture/workflow Markdown only, so no implementation, PostgreSQL, migration, or browser test was added or run. The arithmetic helper requested for lease/drain-derived values was not authorized by the execution environment; the contract therefore records only the chosen base constants and query-based drain criteria, without claiming derived timing output. Because the repository scanner excludes `docs` and `agent-communication`, the new Markdown was manually kept free of credentials, connection strings, cookies, provider tokens, dictionary answers, answer hashes/salts, and hosted user identifiers.

## Approval/mutation gates

No new timing/product approval is needed. The v1/v2 meanings are already approved.

Future explicit approvals are required for:

1. checkpoint merge/deploy/migration that creates/seeds the shared control and guards;
2. separate hosted control-row activation from v1 open through closing to v2 open;
3. provider configuration changes, only if existing Railway metadata cannot supply immutable release/replica proof;
4. hosted rollback-only guard probe or gameplay smoke.

## Scope confirmation

- No application code was implemented.
- No migration was created or executed.
- No control row, lease, trigger, provider setting, feature flag, deployment, or hosted data was changed.
- Existing unrelated Wave U working-tree modifications were preserved and are not attributed to Elisa.
