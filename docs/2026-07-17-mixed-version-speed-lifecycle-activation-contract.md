# Mixed-version Speed lifecycle activation contract — Wave U-Fix

Date: 2026-07-17
Owner: Elisa
Ticket: 186 — Mixed-Version Speed Lifecycle Activation Contract
Status: implementation decision lock; no deployment, migration execution, activation, or hosted mutation

## 1. Executive decision

Use PostgreSQL as the shared source of truth and enforce lifecycle identity at **both** the application and database write boundaries.

The rollout is not “deploy code that writes v2.” It is a two-phase protocol:

1. **Compatibility phase:** migrate schema/guards and roll out gate-aware binaries while shared creation remains v1.
2. **Activation phase:** close Speed creation, drain eligible v1 queue work, prove the serving fleet is gate-aware/v2-capable, then atomically open v2 creation.

Exact identities:

```text
controlProtocol=speed_lifecycle_activation_gate_v1
v1=speed_ready_v1_match_created_20s
v2=speed_ready_v2_first_ack_90s
```

Exact activation phases:

```text
v1_open
closing_to_v2
v2_open
closing_to_v1
disabled
```

The database guard is the safety backstop for a hidden or stale old process: once shared state is `v2_open`, an old binary's null/v1 Speed ticket or match insert is rejected inside its transaction. Therefore mixed serving versions may cause a Speed-only availability failure, but cannot create mixed lifecycle rows. Standard writes are outside every activation predicate and remain available.

Provider deployment completion and instance capability leases are both required before v2 opens. Leases alone cannot prove that an uninstrumented old instance does not exist; provider inventory alone cannot prevent a stale process from attempting a write. The contract deliberately uses both, with database enforcement as the final integrity boundary.

## 2. Problem statement

Ticket 179 proved:

- Wave U code writes `speed_ready_v2_first_ack_90s` unconditionally;
- readiness verifies only local binary/schema/reconciler capability;
- no shared active lifecycle identity exists;
- Railway may serve old Wave T/v1 and new Wave U/v2 instances during a rolling overlap.

A local `supportsV2=true` check is not activation authority. Without a shared gate, two healthy instances can create incompatible rows in one hosted database.

The activation contract must handle:

- one or multiple replicas;
- old binaries that do not know the activation table;
- new compatibility binaries that support v1 and v2;
- rolling overlap and delayed termination;
- queued tickets created before closure;
- active legacy matches after v2 activation;
- worker reconciliation of both persisted versions;
- catalog/readiness disagreement;
- emergency closure and safe rollback.

## 3. Safety invariants

The implementation is acceptable only if all invariants hold:

1. At most one lifecycle identity is open for **new Speed queue work** at a time.
2. A new Speed match uses the same lifecycle identity as both claimed Speed tickets.
3. During either closing phase, no new Speed queued ticket or Speed match may be created.
4. Null lifecycle identity is legacy v1 only; it is never accepted while v2 is open.
5. Existing v1 and v2 matches remain readable/reconcilable after creation closes or changes.
6. Activation cannot depend on process-local configuration, cache, or readiness alone.
7. A stale/old process cannot bypass the shared write guard.
8. Missing, malformed, duplicated, or unsupported control state fails Speed closed.
9. Standard queue, gameplay, rating, and reads do not consult or lock this Speed control row.
10. No activation transition rewrites, extends, revives, or deletes existing ticket/match timestamps.
11. Every activation transition increments an immutable monotonic generation.
12. Hosted v2 opening is an explicit, audited database mutation requiring separate approval.

## 4. Shared control schema

### 4.1 Activation row

Add one table with one canonical row:

```prisma
model SpeedLifecycleActivation {
  key                  String   @id // exact: "speed_1v1"
  controlProtocol      String   // exact: "speed_lifecycle_activation_gate_v1"
  phase                String   // checked enum/domain below
  activeCreationVersion String?
  generation           BigInt
  targetReleaseId      String?
  expectedReplicaCount Int?
  transitionReason     String?
  updatedAt            DateTime @updatedAt
  createdAt            DateTime @default(now())
}
```

Canonical row values immediately after migration:

```text
key=speed_1v1
controlProtocol=speed_lifecycle_activation_gate_v1
phase=v1_open
activeCreationVersion=speed_ready_v1_match_created_20s
generation=1
targetReleaseId=null
expectedReplicaCount=null
transitionReason=migration_seed_v1_compatibility
```

Use database constraints:

```text
phase=v1_open       => activeCreationVersion=v1
phase=v2_open       => activeCreationVersion=v2
phase=closing_to_v2 => activeCreationVersion=null
phase=closing_to_v1 => activeCreationVersion=null
phase=disabled      => activeCreationVersion=null
generation >= 1
expectedReplicaCount is null or > 0
```

There must be exactly one row with key `speed_1v1`. Missing or duplicate authority is unavailable, never implicit v1/v2.

Why seed v1 rather than treat missing as v1:

- missing-as-v1 would silently reopen old writes if the control row were deleted after activation;
- the schema migration can be rolled out safely because hosted Wave T already creates v1/null semantics;
- a mandatory row makes deletion/corruption fail closed.

### 4.2 Capability leases

Add a shared lease table for gate-aware API processes:

```prisma
model SpeedLifecycleCapabilityLease {
  instanceBootId       String   @id
  serviceId            String
  releaseId            String
  controlProtocol      String
  supportsV1           Boolean
  supportsV2           Boolean
  supportsLegacyReconcile Boolean
  observedGeneration   BigInt?
  startedAt            DateTime
  lastSeenAt           DateTime
  expiresAt            DateTime

  @@index([releaseId, expiresAt])
  @@index([controlProtocol, expiresAt])
}
```

Constants:

```text
heartbeatIntervalMs=10_000
leaseTtlMs=30_000
```

Rules:

- `instanceBootId` is a random boot identity, not a hostname, user, token, or secret.
- `releaseId` is an immutable build/commit/image revision, not a mutable branch name.
- A restart creates a new boot identity.
- Heartbeats use PostgreSQL time.
- Expired rows are ignored and may be cleaned later.
- A capability lease authorizes nothing by itself; it is evidence used by activation preflight.
- Application startup may register a lease, but Speed creation stays governed by the activation row and write guards.

### 4.3 Persist lifecycle identity on queue tickets

Add an optional field:

```prisma
MatchmakingTicket.readyLifecycleVersion String?
```

Interpretation:

```text
Speed + null = legacy uninstrumented v1 ticket
Speed + v1   = explicit compatibility v1 ticket
Speed + v2   = v2 ticket
Standard     = null; field must not affect Standard
```

New gate-aware binaries always persist the explicit active version for Speed tickets. They never write null.

This field is required because guarding only `Match` inserts is too late: an old process could enqueue v1 work after v2 activation and strand it or expose an incompatible client flow.

## 5. Database enforcement

Application checks improve errors and catalog truth, but correctness rests on transaction-scoped database guards.

### 5.1 Speed ticket guard

Install a `BEFORE INSERT` trigger on `MatchmakingTicket` limited to `NEW.mode='speed_1v1'`.

The trigger:

1. locks/reads the canonical activation row in the inserting transaction;
2. validates protocol/phase/version;
3. computes legacy effective version `coalesce(NEW.readyLifecycleVersion, v1)`;
4. allows insert only when phase is open and effective version equals `activeCreationVersion`;
5. otherwise raises a dedicated SQLSTATE/message token that contains no provider/schema details.

Expected decisions:

| Shared phase | Old null insert | Explicit v1 insert | Explicit v2 insert |
|---|---:|---:|---:|
| `v1_open` | allow | allow | reject |
| `closing_to_v2` | reject | reject | reject |
| `v2_open` | reject | reject | allow |
| `closing_to_v1` | reject | reject | reject |
| `disabled` | reject | reject | reject |
| control missing/malformed | reject | reject | reject |

Terminal updates to existing tickets remain allowed. Do not block `queued -> timed_out/cancelled/matched/consumed` cleanup merely because creation is closed.

### 5.2 Speed match guard

Install a `BEFORE INSERT` trigger on `Match` limited to `NEW.rankedMode='speed_1v1'`.

Use the same phase/version matrix. Null is effective legacy v1 and is rejected after v2 opens.

The match-creation transaction must also prove:

- both claimed tickets are Speed;
- both ticket lifecycle identities normalize to the active identity;
- the new match persists that same explicit identity;
- the control generation read by the transaction has not changed.

An activation transition and Speed ticket/match creation serialize through the same activation row lock. A closing transition cannot commit while a pre-transition guarded insert remains in flight; after it commits, no later insert can use the prior open identity.

### 5.3 Stable database errors

Use stable internal tokens such as:

```text
WR_SPEED_ACTIVATION_MISSING
WR_SPEED_CREATION_CLOSED
WR_SPEED_LIFECYCLE_VERSION_MISMATCH
WR_SPEED_ACTIVATION_PROTOCOL_UNSUPPORTED
```

Gate-aware code maps them to sanitized HTTP 503 errors:

```text
speed_lifecycle_activation_unavailable
speed_lifecycle_draining
speed_lifecycle_version_mismatch
```

Old binaries may map the trigger rejection to a generic service failure. That is acceptable during a forbidden stale overlap; integrity takes priority. No raw SQL, trigger, schema, release, or provider detail reaches clients.

## 6. Binary capability contract

### 6.1 Old Wave T/v1 binary

Characteristics:

- does not read activation state;
- writes null lifecycle tickets/matches;
- understands legacy match-created 20-second ready behavior;
- does not register capability lease.

Safe periods:

- `v1_open`: may continue creating legacy v1 work during Phase A overlap;
- any closing phase: database rejects new Speed work;
- `v2_open`: database rejects new Speed work.

It may continue reading/reconciling legacy persisted rows. It is not considered v2-capable and must be absent from serving provider inventory before v2 opens.

### 6.2 New compatibility binary

Required compile-time capabilities:

```text
controlProtocol=speed_lifecycle_activation_gate_v1
supportsV1=true
supportsV2=true
supportsLegacyReconcile=true
defaultDesiredCreationVersion=v1
```

It must:

- register/renew capability lease;
- read shared control for mode-scoped readiness/catalog;
- acquire shared control inside every Speed join/pair transaction;
- persist explicit ticket/match identity;
- create only the shared active version;
- read/reconcile v1/null and v2 rows independent of active creation version;
- fail Speed closed on unsupported/missing/closing state;
- leave Standard independent.

“Default desired v1” does not override the shared row. It means a newly deployed compatibility binary never opens v2 merely because it supports v2.

### 6.3 Future/stale gate-aware binary

A gate-aware instance whose protocol or supported versions do not include the active identity:

- reports Speed unavailable;
- advertises `queueEnabled=false` for Speed;
- rejects Speed joins before ticket persistence;
- continues legacy reconciliation only for versions it safely understands;
- continues Standard service.

## 7. Mode-scoped readiness and catalog

### 7.1 Speed operational readiness

Extend Speed readiness reasons:

```text
available
feature_disabled
activation_unavailable
activation_draining
activation_protocol_unsupported
active_version_unsupported
capability_lease_unavailable
schema_unavailable
database_unavailable
dictionary_unavailable
reconciler_unavailable
```

Speed creation is available only when:

1. feature is configured on;
2. database/application/full lifecycle schema checks pass;
3. canonical activation row exists and protocol is exact;
4. phase is `v1_open` or `v2_open`;
5. active creation version is supported by this binary;
6. this instance has a fresh matching lease;
7. dictionary and reconciler dependencies pass.

Read this state from PostgreSQL for every Speed join/pair transaction. A short cache may support catalog display, but cached state never authorizes writes.

### 7.2 Global readiness and Standard

A Speed-only activation disagreement must not make the entire API unready if core DB/schema and Standard dependencies remain usable. Otherwise Railway could remove every new instance and turn a safe Speed closure into full-service downtime.

Recommended `/readyz` shape:

```json
{
  "status": "ready",
  "dependencies": {
    "applicationSchema": "ok",
    "standardDictionary": "ok",
    "speedLifecycleActivation": "draining_or_unavailable"
  }
}
```

The exact JSON uses existing dependency conventions, but HTTP remains ready for Standard/core service. Speed endpoints independently fail closed.

If the underlying database/application schema is unavailable for all modes, preserve existing global fail behavior.

### 7.3 Catalog behavior

Gate-aware catalog:

| State | Speed enabled | Speed queueEnabled | Public reason |
|---|---:|---:|---|
| supported `v1_open` | true | true | null |
| `closing_to_v2`/`closing_to_v1` | true | false | `lifecycle_activation_draining` |
| supported `v2_open` | true | true | null |
| disabled/unsupported/missing | true or configured value | false | `speed_temporarily_unavailable` |

Expose active lifecycle identity only when safe. Never expose release IDs, replica counts, instance IDs, generations, or provider topology publicly.

An old instance may advertise stale queue state during closing. The database trigger still prevents writes. Provider fleet proof prevents such an instance from remaining when v2 opens.

## 8. Worker and persisted-row compatibility

Activation gates **creation**, not reconciliation.

New compatibility workers always process:

```text
legacy null/v1 pending rows with v1 rules
explicit v1 pending rows with v1 rules
explicit v2 pending rows with v2 invitation/first-ready rules
active v1/v2 gameplay with persisted start/deadline
```

Worker rules:

- select behavior by persisted row identity, never current active creation identity;
- preserve generation-fenced scheduler/pass completion;
- maintain separate canonical due predicates/indexes for v1/v2;
- no activation transition changes an existing match's lifecycle identity;
- no worker backfills null to v1 as a side effect;
- no rating behavior is selected from activation state.

A worker that cannot interpret a persisted identity must skip it, report mode-scoped unhealthy, and never guess.

## 9. Two-phase v2 rollout

No step below authorizes execution. It is the future operator contract.

### Phase A — compatibility deployment while v1 remains open

1. Obtain normal merge/deploy/migration approval.
2. Apply additive schema:
   - activation/control table and canonical v1 seed row;
   - capability lease table;
   - ticket lifecycle field;
   - guards/constraints/indexes;
   - existing Wave U schema/readiness fixes.
3. Deploy gate-aware compatibility binary with v1+v2 read/reconcile support and shared creation default v1.
4. During rolling overlap:
   - old and new instances can create only v1/null-equivalent rows;
   - new instances write explicit v1;
   - no v2 creation occurs;
   - Standard remains live.
5. Wait for provider deployment state to report the target release active and each prior release stopped/removed.
6. Obtain authoritative expected replica count from provider topology.
7. Verify fresh capability leases:
   - count equals expected serving replica count;
   - every lease is target release;
   - every lease reports exact gate protocol, v1/v2 support, legacy reconciliation;
   - no fresh foreign-release gate-aware lease remains.
8. Verify catalog/readiness still reports v1 open.

If provider topology cannot prove release/replica inventory, stop. Lease presence alone is insufficient.

### Phase B1 — close and drain

Requires separately approved hosted activation mutation.

In one transaction:

```text
lock canonical activation row
require phase=v1_open
set phase=closing_to_v2
set activeCreationVersion=null
set targetReleaseId=<approved immutable target>
set expectedReplicaCount=<provider-proven count>
increment generation
write spoiler-safe audit metadata
commit
```

Effects:

- new binaries immediately close Speed catalog/join;
- old in-flight guarded inserts complete before the transition can commit;
- old inserts attempted afterward are rejected by trigger;
- existing tickets/matches remain readable and terminalizable;
- Standard remains live.

Drain proof is query-based, not sleep-based:

```text
zero eligible queued Speed tickets whose normalized identity is v1
zero in-flight Speed creation transactions holding the activation row
all target leases fresh and observed closing generation
provider still reports only target release and expected replicas
full schema/dictionary/reconciler readiness passes
```

Expired queue rows may remain historically `queued` only if every matchmaking selector excludes them by `expiresAt`; preferred cleanup transitions them to `timed_out` through existing bounded product logic. Do not delete them.

Matched v1 tickets and pending/active v1 matches do not block v2 opening. They are already versioned work and compatibility code must finish them.

### Phase B2 — atomically open v2

In one transaction or reviewed activation function:

```text
lock canonical activation row
require phase=closing_to_v2
require target release/replica fields exact
recheck zero eligible v1 queued tickets
recheck fresh target capability leases
set phase=v2_open
set activeCreationVersion=speed_ready_v2_first_ack_90s
increment generation
write spoiler-safe audit metadata
commit
```

After commit:

- gate-aware new instances create only explicit v2 tickets/matches;
- old null/v1 inserts are rejected by database;
- v1 and v2 existing rows are read/reconciled by persisted identity;
- catalog opens Speed only on instances observing supported v2 state;
- no process may “helpfully” fall back to v1 if shared state is unavailable.

### Phase B3 — observation

Before hosted gameplay smoke:

- observe every target lease acknowledge the new generation;
- confirm provider inventory remains target-only;
- confirm v2 catalog identity from repeated requests;
- create no test row until the separately authorized smoke ticket;
- monitor trigger rejection counts, unsupported-version counts, Speed 503s, queue depth by normalized version, v1/v2 pending matches, reconciler freshness, and Standard health.

## 10. Proving every serving instance is v2-capable

Activation requires all evidence, not one proxy:

1. **Provider deployment proof**
   - target immutable release is active;
   - every previous deployment is stopped/removed;
   - actual serving replica count is known;
   - no rollout/restart is in progress.
2. **Shared lease proof**
   - fresh unique boot leases equal expected replica count;
   - all match target release and exact capabilities;
   - all observed the current closing generation;
   - no fresh different-release gate-aware lease exists.
3. **Application proof**
   - each known replica's internal/administrative readiness reports same protocol/phase/generation/version;
   - public catalog remains Speed-closed during drain.
4. **Database integrity proof**
   - guards exist in current schema with canonical definitions;
   - a disposable transaction proves v1/null Speed inserts reject and rolls back without retaining user/match data;
   - zero eligible v1 queue rows remain before v2 open.

The disposable guard probe must use transaction rollback and synthetic identifiers, and must be separately authorized if run against hosted preview. It must not create durable users, tickets, or matches.

If per-replica routing/inspection is unavailable, provider inventory + exact lease cardinality + database guard proof is the minimum. Any disagreement blocks activation.

## 11. Failure behavior

| Failure | Required behavior |
|---|---|
| Activation row missing/duplicate | Speed creation closed; Standard live. |
| Unknown protocol/phase/version | Speed creation closed; sanitized unavailable reason. |
| Control read timeout | Speed creation closed; no cached write authorization. |
| Local binary lacks active version | Speed creation closed on that instance. |
| Lease expired/heartbeat failed | Instance closes Speed creation/catalog. |
| Provider reports old deployment | Do not open v2. |
| Lease count differs from provider replicas | Do not open v2. |
| Old null/v1 write after v2 open | DB trigger aborts transaction. |
| New v2 write while v1 open | DB trigger aborts transaction. |
| Any write during closing | DB trigger aborts transaction. |
| Activation generation changes mid-join | Transaction retries/rechecks; no ticket retained under old generation. |
| Unknown persisted match version | Skip mutation/reconciliation, report unhealthy, do not reinterpret. |
| Capability table unavailable | Speed closed; Standard unaffected if core DB otherwise works. |
| Activation operator interrupted in closing | Remain safely closed; resume preflight or enter reviewed rollback. |

## 12. Rollback and emergency closure

### 12.1 Emergency close

A separately approved transaction may move either open phase to `disabled`, set active version null, and increment generation. This immediately blocks new Speed ticket/match inserts while preserving reads/reconciliation.

### 12.2 Roll back v2 creation to v1

Never directly flip `v2_open -> v1_open`.

1. Move `v2_open -> closing_to_v1`; close all new Speed creation.
2. Drain zero eligible queued v2 tickets.
3. Preserve matched/pending/active v2 matches for compatible reconciliation.
4. Deploy/retain a **gate-aware compatibility release** that supports v1, v2, and legacy reconciliation.
5. Repeat provider inventory and capability lease proof.
6. Atomically set `v1_open`, explicit v1, increment generation.
7. Observe all target instances acknowledge the generation before reopening catalog.

Do not roll back to an uninstrumented Wave T binary while any v2 rows exist. “Rollback” means a reviewed gate-aware release with v2 compatibility, not removal of v2 schema or guards.

### 12.3 Schema rollback

Do not drop activation tables, lease tables, lifecycle columns, enum values, triggers, or due indexes while hosted lifecycle rows exist. Additive schema remains until a separately reviewed data-retirement plan proves safe.

## 13. Migration safety

The migration is additive but contains controlled DDL/DML:

- create control/lease tables;
- seed one v1-open control row;
- add ticket lifecycle column;
- install trigger functions/triggers;
- add constraints/indexes.

Preflight:

- current schema exact and namespace-isolated;
- existing lifecycle migration present;
- no duplicate control table/trigger names;
- count active/queued/matched Speed work by normalized identity;
- verify no explicit v2 ticket already exists;
- preserve all existing rows.

Migration behavior:

- fail if canonical control row already exists with conflicting values;
- never rewrite existing null tickets/matches;
- allow existing old code under seeded v1 state;
- do not set v2 open;
- do not change provider feature flags.

Migration readiness must verify exact table columns, checks, canonical row, ticket field, trigger attachment/function digest or structural definition, lease indexes, and current-schema namespace. Name-only checks are insufficient.

## 14. API/module boundaries

Recommended modules:

```text
apps/api/src/gameplay/speed-lifecycle-activation.constants.ts
apps/api/src/gameplay/speed-lifecycle-activation.service.ts
apps/api/src/gameplay/speed-lifecycle-capability.service.ts
apps/api/src/gameplay/speed-lifecycle-activation.types.ts
apps/api/src/health/speed-operational-readiness.service.ts
apps/api/src/matchmaking/matchmaking.service.ts
apps/api/src/ranked/ranked-read.service.ts
apps/api/prisma/migrations/<timestamp>_speed_lifecycle_activation_gate/migration.sql
```

Service interface:

```ts
type SpeedLifecycleVersion =
  | 'speed_ready_v1_match_created_20s'
  | 'speed_ready_v2_first_ack_90s';

type SpeedActivationPhase =
  | 'v1_open'
  | 'closing_to_v2'
  | 'v2_open'
  | 'closing_to_v1'
  | 'disabled';

type SpeedCreationAuthority = {
  protocol: 'speed_lifecycle_activation_gate_v1';
  phase: SpeedActivationPhase;
  activeVersion: SpeedLifecycleVersion | null;
  generation: bigint;
};

interface SpeedLifecycleActivationService {
  checkLocalAvailability(): Promise<SpeedOperationalStatus>;
  lockCreationAuthority(tx: PrismaTransaction): Promise<SpeedCreationAuthority>;
  assertTicketVersion(authority: SpeedCreationAuthority, version: SpeedLifecycleVersion): void;
  heartbeatCapability(): Promise<void>;
}
```

Matchmaking must pass the locked authority/version into `createSpeedMatch`; the gameplay service may not consult a second process-local default.

## 15. Testing contract

### 15.1 Migration/schema

- fresh schema seeds exactly one v1-open row;
- rerun/idempotency strategy is explicit;
- schema checks are current-schema isolated;
- trigger definitions and ticket field are verified structurally;
- old null v1 rows remain unchanged;
- Standard inserts bypass Speed guards.

### 15.2 Mixed binary simulation

Use two service harnesses sharing one PostgreSQL schema:

```text
old-v1 harness: no gate lookup, null lifecycle writes
new harness: v1+v2 support, gate-aware, explicit identity
```

Required cases:

1. `v1_open`: old null and new explicit v1 can create; new v2 rejects.
2. Transition waits for an in-flight guarded v1 insert, then closes atomically.
3. `closing_to_v2`: all new Speed inserts reject from both harnesses.
4. `v2_open`: old null/v1 rejects; new explicit v2 succeeds.
5. An activation generation change between join and pair leaves no incompatible/stranded ticket.
6. Ticket and match versions must agree.
7. Missing/corrupt control closes Speed.
8. Stale lease closes gate-aware instance.
9. Existing v1 and v2 rows reconcile under any open/closed phase.
10. Standard joins/matches succeed throughout.

### 15.3 Activation/rollback

- v2 open function refuses eligible v1 queued rows;
- v2 open refuses capability count/release/protocol mismatch;
- v2 open refuses stale leases;
- transition compare-and-swap rejects stale generation/phase;
- interrupted closing remains closed and resumable;
- direct v2-to-v1 flip rejects;
- closing-to-v1 drains v2 queue and preserves v2 matches;
- old trigger errors map to sanitized Speed-only failure;
- at least ten consecutive clean-schema hostile mixed-version runs pass.

### 15.4 Readiness/catalog

- each phase maps to exact Speed availability/catalog output;
- unsupported local version closes only Speed;
- cached catalog cannot authorize writes;
- global readiness remains healthy when only Speed activation is closed;
- DB/core failure still follows global readiness policy;
- no release/replica/instance/generation internals leak publicly.

## 16. Observability

Spoiler-safe metrics/logs:

```text
speed_activation_phase{phase}
speed_activation_generation_observed
speed_activation_capability_leases{release,capability_status}
speed_activation_guard_rejections{reason}
speed_queue_eligible{lifecycle_version}
speed_matches_pending{lifecycle_version}
speed_reconciler_processed{lifecycle_version,outcome}
speed_operational_available{reason}
```

Release IDs may appear in restricted operational logs/metrics but not public API responses. Do not log user IDs, handles, operation IDs, guesses, answers, answer hashes/salts, cookies, credentials, connection strings, or provider tokens.

Audit transitions with phase before/after, generation before/after, target release ID, expected replica count, timestamp, and operator/change-ticket identity. Do not store secrets.

## 17. Approval and mutation gates

Ticket 186 authorizes documentation only.

Later operations requiring explicit approval:

1. **Checkpoint merge/deployment/migration approval** — needed to apply additive activation schema, seed v1 control state, install DB guards, and start capability leases.
2. **Separate hosted activation approval** — needed to mutate the control row from `v1_open` to `closing_to_v2` and then `v2_open`.
3. **Any provider configuration mutation** — required only if immutable release identity or authoritative replica count cannot be obtained from existing Railway metadata. Do not add/change provider variables without approval.
4. **Hosted guard probe/smoke data** — requires the corresponding separately approved preview smoke scope, even when rolled back.

No new product timing approval is required: v1/v2 meanings are already approved. The new approval is operational because activation updates hosted control data.

## 18. Handoff

### Freya / Ticket 187

- implement additive control/lease/ticket schema and database guards;
- seed v1, never v2;
- integrate mode-scoped readiness/catalog and transaction-locked creation authority;
- persist explicit lifecycle on new gate-aware Speed tickets and matches;
- preserve v1/v2 reads/reconciliation and Standard isolation;
- implement activation preflight/transition functions but do not execute hosted activation;
- add mixed old/new harness, trigger, generation, drain, rollback, and ten-run PostgreSQL tests.

### Yuna / Tickets 180–181

- treat Phase A deployment/migration and Phase B activation as separate approval gates;
- capture provider target release, previous-deployment stopped state, and replica inventory without changing provider config;
- compare provider inventory with fresh shared leases;
- never activate from one health request or lease alone;
- retain commands/HTTP statuses/sanitized counts and rollback evidence;
- do not deploy/merge/activate until predecessor QA and Ashar approval.

### Jasmine / Ticket 188

Verify schema isolation/completeness, old/new mixed harness, database enforcement, closing drain, stale instance/lease, generation compare-and-swap, v1/v2 reconciliation, Speed-only closure, catalog/readiness truth, rollback, ten clean-schema runs, and no spoiler/secret leakage.

## 19. Non-goals

- no hosted activation in Ticket 186 or 187;
- no direct provider API/config mutation;
- no destructive rewrite/backfill/drop;
- no assumption that Railway rolling overlap is zero;
- no replacement of PostgreSQL with Redis/service discovery;
- no change to Speed timing, adjudication, rating, or Standard behavior;
- no public exposure of fleet topology;
- no silent fallback when activation state is unavailable.
