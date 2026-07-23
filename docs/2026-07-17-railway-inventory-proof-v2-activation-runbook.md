# Railway inventory-proof and Speed lifecycle v2 activation runbook

Date: 2026-07-17
Owner: Elisa
Ticket: 194 — Railway Inventory-Proof and V2 Activation Runbook
Status: implementation decision lock complete; no hosted operation authorized or performed

## 1. Purpose

This runbook defines the trusted operator path for proving the Railway API fleet and activating the hosted Speed ready lifecycle from:

```text
speed_ready_v1_match_created_20s
```

to:

```text
speed_ready_v2_first_ack_90s
```

It closes Ticket 186's remaining operational gap: database capability leases alone cannot prove that an uninstrumented old Railway process is absent.

The design deliberately does not add an HTTP activation endpoint and does not place a Railway credential in the hosted API.

## 2. Non-goals and immutable boundaries

This ticket does not:

- implement the operator tool;
- change hosted Railway or PostgreSQL state;
- activate v2;
- deploy or restart any service;
- change provider variables;
- run hosted gameplay smoke;
- alter Speed timing, adjudication, ratings, dictionary policy, or Standard;
- weaken the database ticket/match insertion guards.

Ticket 195 implements the local operator tool. Ticket 196 independently verifies it. Ticket 197 owns the separately approved checkpoint merge/deploy. Ticket 198 owns the separately approved hosted transitions.

## 3. Decision summary

1. PostgreSQL remains the activation authority.
2. Railway deployment inventory is acquired by a local operator process using the operator's existing Railway CLI OAuth session.
3. Hosted PostgreSQL access is supplied only to that local process, preferably through `railway run`; neither credential is persisted by the application.
4. Railway's immutable deployment ID is the canonical capability release identity.
5. Railway deployment metadata and built-in runtime variables bind that deployment ID to the immutable Git commit or image digest.
6. Every fresh capability lease carries provider project, environment, service, deployment, replica, and artifact identity.
7. Provider proof is short-lived, DB-clock-bracketed, single-use, generation-bound, and consumed in the same serializable transaction that compares leases and changes activation state.
8. Close and open are separate commands, separate database transactions, and separate explicit approval gates.
9. Dry-run is the default. A dry-run can never mutate provider or database state.
10. Unknown, partial, stale, truncated, contradictory, or unauthorized evidence fails Speed closed.

## 4. Authoritative identifiers

### 4.1 Railway scope tuple

The operator must supply all selectors as IDs, never names:

```text
provider = railway
projectId = <RAILWAY_PROJECT_ID>
environmentId = <RAILWAY_ENVIRONMENT_ID>
serviceId = <RAILWAY_SERVICE_ID>
deploymentId = <RAILWAY_DEPLOYMENT_ID>
```

The verifier rejects:

- omitted selectors;
- name-only selectors;
- a linked Railway context that disagrees with any supplied ID;
- a provider response whose project/environment/service scope disagrees;
- an API service other than the intended Wordle Royale API service.

Names may appear only as non-authoritative operator hints.

### 4.2 Canonical capability release identity

For a Railway deployment:

```text
releaseId = "railway:deployment:" + RAILWAY_DEPLOYMENT_ID
```

Rules:

- The deployment ID is opaque and case-sensitive.
- No timestamp, branch, mutable service name, short Git SHA, Railway URL, or image tag is accepted as `releaseId`.
- `SPEED_LIFECYCLE_RELEASE_ID` remains available for local/test adapters only.
- In a Railway runtime, provider-derived identity wins. If a configured `SPEED_LIFECYCLE_RELEASE_ID` exists and differs from the canonical provider-derived value, the instance does not heartbeat and Speed fails closed.

This removes the need for a per-deployment provider variable mutation.

### 4.3 Artifact identity

For a Git-backed deployment:

```text
artifactIdentity = "git:" + lowercase(full 40-hex RAILWAY_GIT_COMMIT_SHA)
```

For an immutable image-backed deployment:

```text
artifactIdentity = "image:sha256:" + lowercase(64-hex digest)
```

Floating image tags are not acceptable activation evidence.

The current Wave U compatibility baseline on `origin/main`, verified on 2026-07-17, is:

```text
e81e211e8995d594559d5cc2d33c88a7730ef2de
```

That SHA is historical baseline evidence, not the future activation target. Ticket 197 will change the code. Ticket 198 must use the full SHA of the approved Ticket 197 merge deployment.

### 4.4 Runtime provider identity

Every Railway capability lease must report values derived from Railway-provided variables:

```text
providerProjectId     = RAILWAY_PROJECT_ID
providerEnvironmentId = RAILWAY_ENVIRONMENT_ID
providerServiceId     = RAILWAY_SERVICE_ID
providerDeploymentId  = RAILWAY_DEPLOYMENT_ID
providerReplicaId     = RAILWAY_REPLICA_ID
providerRegion         = RAILWAY_REPLICA_REGION, when present
providerArtifact       = artifactIdentity
releaseId              = railway:deployment:<providerDeploymentId>
```

Missing project, environment, service, deployment, replica, or artifact identity means no capability heartbeat and mode-scoped Speed unavailability. Standard remains unaffected.

## 5. Required additive persistence

Ticket 195 adds nullable provider fields to `SpeedLifecycleCapabilityLease` for migration compatibility:

```text
providerProjectId     String?
providerEnvironmentId String?
providerServiceId     String?
providerDeploymentId  String?
providerReplicaId     String?
providerArtifact      String?
```

New Railway heartbeats require every field. Local/test leases may use an explicitly selected non-Railway adapter.

Required indexes:

```text
(releaseId, providerReplicaId, expiresAt)
(providerProjectId, providerEnvironmentId, providerServiceId,
 providerDeploymentId, expiresAt)
```

Required fresh-row uniqueness is enforced by service semantics and hostile tests:

```text
one current lease per instanceBootId
one fresh target lease per providerReplicaId
```

A restarted replica may temporarily leave an older boot lease. Until that older row expires, exact cardinality fails closed. The operator waits; it does not delete leases to make proof pass.

### 5.1 Activation audit table

Add an append-only `SpeedLifecycleActivationAudit` table:

```text
id                       UUID primary key
proofProtocol            TEXT
proofId                  UUID unique
operation                TEXT
approvalRef               TEXT
operatorPrincipalHash    TEXT
providerProjectId        TEXT
providerEnvironmentId    TEXT
providerServiceId        TEXT
providerDeploymentId     TEXT
artifactIdentity         TEXT
releaseId                TEXT
expectedReplicaCount     INTEGER
inventoryDigest          TEXT
leaseSetDigest           TEXT
providerObservedBeforeAt TIMESTAMPTZ
providerObservedAfterAt  TIMESTAMPTZ
fromPhase                TEXT
fromGeneration           BIGINT
toPhase                  TEXT
toGeneration             BIGINT
result                    TEXT
failureCode               TEXT nullable
createdAt                 TIMESTAMPTZ default clock_timestamp()
```

Only successful apply transitions are required to persist a row. Failed apply attempts may emit sanitized local evidence but must not create misleading successful audit rows. If failed-attempt auditing is implemented, it must be append-only and distinguish `rejected` from `applied`.

The table never stores:

- Railway access/OAuth/project tokens;
- Railway CLI credential files;
- `DATABASE_URL`;
- cookies or authorization headers;
- raw Railway JSON;
- raw environment configuration;
- user email or display name;
- dictionary answers;
- gameplay guesses.

`operatorPrincipalHash` is a SHA-256 digest of a stable normalized identity returned by `railway whoami`; the raw identity is not persisted.

## 6. Trusted operator tool boundary

### 6.1 Location and invocation

Ticket 195 should add a repository-owned local command such as:

```text
pnpm --filter @wordle-royale/api speed:lifecycle:operator -- <arguments>
```

Suggested modules:

```text
apps/api/scripts/speed-lifecycle-operator.ts
apps/api/src/gameplay/railway-inventory.adapter.ts
apps/api/src/gameplay/speed-lifecycle-operator.service.ts
apps/api/src/gameplay/speed-lifecycle-proof.ts
```

The script creates a **minimal operator-only Nest application context** containing Prisma, the strict Railway adapter, proof validation, and the operator transition service. It must not import the normal `AppModule` or instantiate runtime lifecycle components.

In particular, operator startup must not instantiate or run:

- `SpeedLifecycleCapabilityService` heartbeat;
- deadline/reconciliation workers;
- matchmaking/gameplay/rating workers;
- HTTP controllers or listeners;
- analytics/background timers;
- migration or dictionary bootstrap code.

This is mandatory because `railway run` can inject service variables into the local process. Booting the normal app context could create a false local capability lease or run hosted background work. `OPERATOR_MODE` alone is not an adequate boundary; use an allowlisted operator module, with an additional startup assertion that runtime workers are absent.

No controller, route, server action, webhook, GraphQL mutation, hidden header, or public production endpoint may call activation transitions.

### 6.2 Authentication

Preferred provider authentication:

```bash
railway login
railway whoami
```

For a browserless trusted operator shell:

```bash
railway login --browserless
railway whoami
```

The verifier shells out to the Railway CLI sequentially and inherits the operator's existing OAuth session. It never reads or copies the CLI credential file.

Accepted fallback, only when interactive CLI OAuth cannot be used:

- a project-scoped `RAILWAY_TOKEN` passed to the one local process;
- never `RAILWAY_API_TOKEN` unless project scope is demonstrably insufficient;
- never a token in hosted API variables;
- never a token in command-line arguments, logs, evidence, or files;
- creation/revocation of a new token is a separate provider mutation requiring approval.

The tool rejects simultaneous Railway CLI subprocesses. Current Railway CLI OAuth refresh tokens rotate; sequential invocation avoids concurrent refresh races and simplifies audit ordering.

### 6.3 Hosted database credential

Preferred execution wraps the local operator command with Railway's environment injection so the DB credential is not copied into the runbook:

```bash
railway run \
  --service <API_SERVICE_ID> \
  --environment <ENVIRONMENT_ID> \
  pnpm --filter @wordle-royale/api speed:lifecycle:operator -- <arguments>
```

The linked project must first be verified against `<PROJECT_ID>` by the tool. If the installed CLI syntax differs, Ticket 195 must bind the equivalent documented selectors and test them; it must not silently fall back to linked names.

Alternative: inject `DATABASE_URL` from an approved local secret manager into the process environment.

The tool must never print `DATABASE_URL` or child environment variables.

## 7. Railway evidence acquisition

### 7.1 Required read-only sources

The adapter uses only read-only Railway operations:

```bash
railway --version
railway whoami
railway status --json
railway deployment list \
  --project <PROJECT_ID> \
  --service <SERVICE_ID> \
  --environment <ENVIRONMENT_ID> \
  --limit 1000 \
  --json
railway environment config \
  --environment <ENVIRONMENT_ID> \
  --json
```

`railway environment config --json` may contain environment variables. The adapter parses the target service's deployment/replica configuration in memory and immediately discards the raw object. It must not print, persist, snapshot, hash wholesale, or include that raw response in errors.

If Railway's supported Public API later exposes all needed fields through an authenticated CLI command without environment variables, prefer that narrower response.

### 7.2 Official provider facts used

Railway's documented APIs provide:

- deployment listing scoped by project, environment, and service;
- deployment `id`, `status`, `createdAt`, and `meta`;
- service-instance `numReplicas` and `latestDeployment`;
- CLI OAuth login and browserless login;
- project token and account/workspace token environment variables;
- runtime variables including project, environment, service, deployment, replica, region, and Git commit SHA.

References inspected on 2026-07-17:

- <https://docs.railway.com/integrations/api>
- <https://docs.railway.com/integrations/api/manage-deployments>
- <https://docs.railway.com/integrations/api/manage-services>
- <https://docs.railway.com/cli>
- <https://docs.railway.com/variables/reference#railway-provided-variables>

The implementation must test the actual installed CLI JSON schema. Documentation or schema drift fails closed with `railway_inventory_schema_unsupported`.

### 7.3 Deployment status policy

Target requirements:

```text
serviceInstance.latestDeployment.id     == target deployment ID
serviceInstance.latestDeployment.status == SUCCESS
target deployment status                == SUCCESS
```

The complete scoped deployment listing must contain exactly one `SUCCESS` deployment, and it must be the target.

Inactive prior statuses allowed:

```text
FAILED
CRASHED
REMOVED
SLEEPING
SKIPPED
```

Blocking statuses include:

```text
BUILDING
DEPLOYING
INITIALIZING
WAITING
QUEUED
REMOVING
SUCCESS on any non-target deployment
any unknown status
```

`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` may be nonzero. The verifier does not assume overlap is zero; it waits until inventory itself is settled.

If the deployment listing returns the requested limit or indicates another page, proof is truncated and fails. Ticket 195 must either page to exhaustion or reject.

### 7.4 Immutable commit/image extraction

Railway deployment `meta` is an opaque JSON value in the documented API. The verifier must not trust branch, message, URL, or a short SHA.

For the current Git deployment path:

1. Recursively collect full 40-hex string values from target deployment `meta`.
2. Normalize them to lowercase.
3. Require exactly one distinct candidate.
4. Require it to equal the operator's full expected SHA.
5. Require every target lease's `providerArtifact` to equal `git:<same SHA>`.

If no full SHA or multiple distinct candidates exist, fail with `railway_artifact_identity_ambiguous`.

For a future image deployment, implement a separate explicit adapter requiring one immutable `sha256` digest. Do not infer image identity from a mutable tag.

### 7.5 Serving replica count

The provider count is authoritative and is never operator-entered by itself.

Requirements:

- read `numReplicas` from the exact service instance/environment;
- if multi-region configuration is returned, account for every configured serving region according to the provider response;
- require a positive integer;
- reject missing, null, contradictory, or ambiguous counts;
- compare it to the operator's `--expected-replicas` assertion;
- compare it to exact fresh lease cardinality in PostgreSQL.

Because Railway's documented API exposes replica count but not a list of live replica IDs, proof uses this conjunction:

```text
provider target deployment ID
+ provider serving replica count
+ exact fresh leases for that deployment
+ distinct Railway replica IDs in those leases
+ zero fresh non-target leases
```

That is the strongest non-invasive proof available. Database insert guards remain the final stale-writer safety boundary.

## 8. Provider proof protocol

Protocol identity:

```text
speed_provider_inventory_proof_v2
```

Proof shape:

```text
proofProtocol
proofId
providerProjectId
providerEnvironmentId
providerServiceId
targetDeploymentId
targetReleaseId
artifactIdentity
servingReplicaCount
servingReplicaIdsDigest
inactivePriorDeploymentIdsDigest
inventoryDigest
expectedActivationGeneration
providerObservedBeforeAt
providerObservedAfterAt
rolloutSettled
```

### 8.1 DB-clock bracket

To avoid trusting the operator workstation clock:

1. Read `clock_timestamp()` from hosted PostgreSQL as `providerObservedBeforeAt`.
2. Fetch all Railway evidence sequentially.
3. Read `clock_timestamp()` again as `providerObservedAfterAt`.
4. Reject an acquisition interval longer than 15 seconds.
5. At transition time, require DB `clock_timestamp()` to be no more than 20 seconds after `providerObservedAfterAt`.

The apply command always refetches. A prior dry-run proof cannot be supplied to apply.

### 8.2 Anti-replay

- `proofId` is a cryptographically random UUID generated for the current acquisition.
- `proofId` is unique in `SpeedLifecycleActivationAudit`.
- The proof binds exact project/environment/service/deployment/artifact, expected replica count, current phase, and expected generation.
- A generation change invalidates the proof.
- A phase change invalidates the proof.
- A provider deployment/configuration change invalidates the proof.
- Reusing a consumed proof ID fails.
- Proofs are in-memory only; optional sanitized evidence files are not accepted as transition input.

### 8.3 Canonical digest

Before hashing:

- use a versioned object schema;
- sort object keys;
- sort deployment records by deployment ID;
- sort lease replica IDs and boot IDs;
- normalize Git SHA/digest casing;
- omit tokens, URLs with credentials, raw metadata, raw variables, and operator PII.

Use SHA-256 for `inventoryDigest`, `leaseSetDigest`, and operator identity. Digests are audit correlation, not authorization.

## 9. Atomic database comparison

External Railway observation cannot be transactionally locked by PostgreSQL. The contract therefore requires a short-lived provider proof followed by an atomic database comparison and transition.

Within one serializable transaction:

1. lock the singleton `SpeedLifecycleActivation` row `FOR UPDATE`;
2. validate control protocol, expected phase, and expected generation;
3. validate proof protocol, scope, release, artifact, replica count, DB-clock freshness, and unused proof ID;
4. read fresh capability leases using DB `clock_timestamp()`;
5. require exact target lease cardinality;
6. require every target lease to support v1, v2, legacy reconciliation, and the control protocol;
7. require every target lease to match provider scope, deployment, release, artifact, and expected generation;
8. require distinct non-empty provider replica IDs equal the provider replica count;
9. require zero fresh lease outside the exact target set;
10. for open, require queue drain and closing-generation acknowledgement;
11. update activation phase/generation;
12. append the audit record with proof and lease digests;
13. commit.

Any mismatch rolls back both authority and audit writes.

The current implementation's external `assertProviderInventory()` followed by a separate transaction is insufficient for Ticket 194 because the proof is not generation-bound, short-lived, single-use, or audited. Ticket 195 must route operator transitions through the transaction-bound v2 proof path.

## 10. Read-only dry-run

Dry-run is always the default. `--apply` is mandatory for mutation.

Example after Ticket 195 exists:

```bash
railway run \
  --service <API_SERVICE_ID> \
  --environment <ENVIRONMENT_ID> \
  pnpm --filter @wordle-royale/api speed:lifecycle:operator -- \
  verify \
  --project-id <PROJECT_ID> \
  --environment-id <ENVIRONMENT_ID> \
  --service-id <API_SERVICE_ID> \
  --deployment-id <TARGET_DEPLOYMENT_ID> \
  --expected-artifact git:<FULL_40_HEX_SHA> \
  --expected-replicas <N> \
  --expected-phase v1_open \
  --expected-generation <G>
```

Dry-run performs no database writes, including no audit write. It must report:

```text
PASS or FAIL
provider proof protocol
abbreviated provider scope IDs
target deployment ID
full immutable artifact identity
canonical releaseId
provider status summary
provider replica count
fresh matching lease count
fresh non-target lease count
authority phase and generation
schema/dictionary/reconciler readiness
eligible draining queue count
proof observation interval
sanitized failure codes
```

It must never report raw environment configuration or credentials.

A PASS dry-run is evidence for requesting approval; it is not authorization and cannot be replayed as apply input.

## 11. Approval gates

### 11.1 Ticket 197 checkpoint

Before any activation attempt:

- Ticket 195 implemented;
- Ticket 196 PASS;
- Ashar separately approves Ticket 197 merge/deploy/migrations;
- exact Ticket 197 full merge SHA is known;
- main CI and Railway compatibility deployment pass;
- fresh dry-run proves that deployment and its leases while authority remains `v1_open`.

### 11.2 Approval A — close

Ashar must explicitly approve the first hosted transaction after seeing sanitized dry-run evidence.

Recommended approval text:

```text
Approve Ticket 198 close for Railway deployment <DEPLOYMENT_ID>,
artifact git:<FULL_SHA>, <N> replicas, expected generation <G>:
v1_open -> closing_to_v2 only.
```

The close command requires:

```text
--apply
--approval-ref <non-secret ticket/message reference>
--confirmation "CLOSE SPEED V1 CREATION FOR V2 DRAIN"
```

No open transition follows automatically.

### 11.3 Approval B — open

After close commits, the operator returns fresh sanitized evidence showing:

- authority is `closing_to_v2` at generation `G+1`;
- Speed catalog/queue creation is closed;
- no eligible v1 queue ticket remains;
- all exact target leases acknowledge closing generation;
- target Railway inventory remains settled and exact;
- schema, dictionary, and reconciler are healthy;
- Standard remains available.

Ashar then separately approves open.

Recommended approval text:

```text
Approve Ticket 198 open for Railway deployment <DEPLOYMENT_ID>,
artifact git:<FULL_SHA>, <N> replicas, expected closing generation <G+1>:
closing_to_v2 -> v2_open only while every runbook gate remains PASS.
```

The open command requires:

```text
--apply
--approval-ref <non-secret ticket/message reference>
--confirmation "OPEN SPEED CREATION ON READY LIFECYCLE V2"
```

The open command refetches all provider/DB evidence. It does not trust close evidence.

## 12. Close transaction

Expected input:

```text
fromPhase              = v1_open
fromGeneration         = G
toPhase                = closing_to_v2
toGeneration           = G+1
activeCreationVersion  = null
targetReleaseId        = railway:deployment:<TARGET_DEPLOYMENT_ID>
expectedReplicaCount   = provider count
```

Preconditions:

- current authority exactly `v1_open/G`;
- target deployment is sole settled Railway `SUCCESS` deployment;
- artifact and release mapping exact;
- provider count and target leases exact;
- every target lease observed generation `G`;
- zero fresh non-target lease;
- mode-scoped Speed readiness otherwise healthy;
- Standard health healthy.

The existing database triggers serialize guarded ticket/match inserts with the authority row. When close commits, no pre-close guarded creator remains in flight past that lock boundary, and new Speed creation fails closed.

## 13. Drain and closing-generation acknowledgement

After close:

1. Poll authority until `closing_to_v2/G+1` is observed.
2. Poll fresh leases until every exact target lease reports `observedGeneration=G+1`.
3. Require the distinct target provider replica IDs and count to remain exact.
4. Require zero fresh non-target lease.
5. Query eligible v1 Speed queue work:

```sql
SELECT count(*)
FROM "MatchmakingTicket"
WHERE "mode" = 'speed_1v1'
  AND "state" = 'queued'
  AND "expiresAt" > clock_timestamp()
  AND COALESCE("readyLifecycleVersion",
               'speed_ready_v1_match_created_20s') =
      'speed_ready_v1_match_created_20s';
```

6. Require the result to be zero.
7. Do not delete or rewrite queue tickets to force drain.
8. Existing v1 matches continue under their persisted identity.
9. Re-fetch Railway inventory immediately before requesting/opening approval.

The verifier uses bounded polling with a 60-second operator wait timeout. Timeout means remain safely closed; it does not imply rollback or retry mutation.

## 14. Open transaction

Expected input:

```text
fromPhase              = closing_to_v2
fromGeneration         = G+1
toPhase                = v2_open
toGeneration           = G+2
activeCreationVersion  = speed_ready_v2_first_ack_90s
targetReleaseId        = railway:deployment:<TARGET_DEPLOYMENT_ID>
expectedReplicaCount   = provider count
```

Within the serializable transaction, recheck:

- exact phase/generation;
- fresh unused provider proof;
- exact target lease set and provider identities;
- every lease acknowledges `G+1`;
- zero fresh non-target lease;
- zero eligible v1 queued ticket;
- no incompatible active creation version;
- audit proof ID unused.

Only then update authority and append audit.

## 15. Post-open verification

Do not run gameplay smoke in Ticket 198 unless separately assigned and approved.

Required read-only checks:

- authority `v2_open/G+2`;
- active version `speed_ready_v2_first_ack_90s`;
- target release and expected replica count unchanged;
- all exact target leases acknowledge `G+2` before release sign-off;
- Speed readiness/catalog report enabled v2 truthfully;
- no new null/v1 Speed ticket or match after open timestamp;
- no incompatible trigger rejection suggesting stale creators;
- reconciler health current;
- Standard queue/gameplay/readiness unchanged;
- audit has one close and one open row with distinct proof IDs.

If post-open acknowledgement does not converge, do not attempt gameplay; follow disable or rollback decision below.

## 16. Failure codes and stop rules

Required sanitized failure codes:

```text
railway_cli_missing
railway_auth_missing
railway_scope_mismatch
railway_inventory_unavailable
railway_inventory_schema_unsupported
railway_inventory_truncated
railway_target_not_success
railway_rollout_not_settled
railway_extra_success_deployment
railway_artifact_identity_ambiguous
railway_artifact_mismatch
railway_replica_count_unknown
railway_replica_count_mismatch
provider_proof_too_slow
provider_proof_stale
provider_proof_replayed
activation_phase_mismatch
activation_generation_mismatch
activation_release_mismatch
capability_lease_missing
capability_lease_extra
capability_lease_stale
capability_lease_generation_mismatch
capability_lease_provider_mismatch
capability_replica_id_duplicate
speed_v1_queue_not_drained
schema_readiness_failed
dictionary_readiness_failed
reconciler_readiness_failed
standard_readiness_failed
approval_missing
confirmation_mismatch
activation_audit_write_failed
```

Every failure stops. The tool must not:

- substitute a name for an ID;
- lower expected replicas;
- delete a lease;
- rewrite a ticket;
- reuse stale proof;
- switch deployment target;
- auto-retry a mutation;
- auto-open after close;
- bypass triggers with raw insert/update;
- expose provider/DB details in an exception.

## 17. Disabled and rollback procedures

### 17.1 Emergency disable

If integrity is uncertain after v2 opens, prefer:

```text
v2_open -> disabled
```

Disable is a separate hosted mutation and requires explicit approval unless Ashar has issued a documented incident pre-authorization. No such pre-authorization is implied by this runbook.

The operator command must require expected generation, `--apply`, approval reference, and an exact disable confirmation phrase. It must append an audit row.

Disabled means:

- no new Speed queue/match creation;
- existing matches remain readable/reconcilable;
- Standard remains available.

### 17.2 Rollback to v1 creation

Never directly set `v2_open -> v1_open`.

Required sequence:

```text
v2_open -> closing_to_v1
wait for exact target lease acknowledgement and eligible v2 queue drain
closing_to_v1 -> v1_open
```

Each transition is separate, generation-fenced, provider-proved, audited, and explicitly approved.

Rollback code must still support:

- both lifecycle versions;
- mixed-version reads;
- legacy reconciliation;
- activation gate and provider identity leases;
- database guards.

Do not roll Railway back to an uninstrumented Wave T/Wave U binary while v2 rows exist.

### 17.3 Provider rollback

A Railway deployment rollback is outside this activation tool. It is a provider mutation requiring separate approval. The lifecycle should first be disabled or moved into the appropriate closing phase unless immediate incident safety requires otherwise and is explicitly authorized.

## 18. Cleanup

After each operator session:

- close the Nest application context and DB pool;
- unset locally injected `DATABASE_URL`, `RAILWAY_TOKEN`, and `RAILWAY_API_TOKEN` if used;
- remove temporary sanitized evidence unless retained under the approved audit process;
- create temporary files with mode `0600`;
- do not delete the operator's pre-existing Railway CLI OAuth session automatically;
- do not delete capability leases; let them expire naturally;
- do not remove inactive Railway deployment history;
- preserve successful append-only activation audits;
- record exact command version, full artifact SHA, deployment ID, generation, proof ID, and PASS/FAIL without secrets.

## 19. Exact implementation handoff — Ticket 195

Freya must implement:

1. provider-derived canonical Railway release/artifact/replica identity;
2. additive provider fields on capability leases;
3. append-only activation audit persistence;
4. strict Railway CLI adapter with injectable subprocess and mocked fixtures;
5. read-only default verifier;
6. DB-clock-bracketed v2 proof with single-use proof ID;
7. exact provider/lease cardinality and distinct replica checks;
8. transaction-bound close/open/disable/rollback operator methods;
9. separate confirmation phrases and approval references;
10. no HTTP exposure;
11. sanitized JSON and human output;
12. no raw config/secret logging;
13. generation acknowledgement/drain polling;
14. official schema-drift fail-closed behavior;
15. local PostgreSQL hostile race tests.

Suggested package scripts:

```text
speed:lifecycle:operator
test:speed-lifecycle-operator
test:postgres:speed-lifecycle-operator
```

## 20. Independent QA handoff — Ticket 196

Jasmine must independently verify at least ten clean-schema hostile runs covering:

- deployment metadata parsing and ambiguity;
- exact scope IDs;
- target and prior deployment status sets;
- truncated inventory;
- Git SHA/image digest mapping;
- one and multiple replicas;
- stale, extra, duplicate, wrong-release, wrong-generation, and wrong-provider leases;
- provider proof freshness and single-use anti-replay;
- generation race between proof and transition;
- creator race against close;
- close/open separation;
- queue drain;
- acknowledgement convergence and timeout;
- disabled and rollback paths;
- missing Railway CLI/auth/DB credentials;
- dry-run zero writes;
- apply audit atomicity;
- sanitized stdout/stderr/evidence;
- no public activation endpoint;
- Standard isolation.

## 21. Ticket 197 and 198 operations handoff

### Ticket 197

Yuna may merge/deploy only after Ticket 196 PASS and Ashar's checkpoint approval. The deploy must leave authority at `v1_open` and creation on v1. It must not activate v2.

### Ticket 198

Yuna must:

1. identify the exact Ticket 197 deployment ID and full immutable artifact SHA;
2. run read-only verification;
3. present sanitized evidence;
4. obtain Approval A;
5. run close only;
6. present drain/acknowledgement evidence;
7. obtain Approval B;
8. run open only;
9. present post-open read-only evidence;
10. stop without gameplay smoke.

## 22. Risk register

| Risk | Mitigation |
|---|---|
| Old uninstrumented process absent from leases | Railway inventory plus database insertion guards |
| Railway rolling overlap | Exactly one target `SUCCESS`; all non-target active/transitional statuses block |
| Deployment ID does not prove artifact | Strict full SHA/digest extraction and lease artifact match |
| Operator workstation clock skew | PostgreSQL clock bracket and freshness check |
| Dry-run proof replayed for apply | Apply always refetches; proof IDs single-use |
| Provider changes after observation | Very short proof age, generation fence, exact lease comparison, DB guards |
| Replica restart creates duplicate lease | Exact fresh replica/lease cardinality; wait for expiry |
| CLI schema changes | Strict schema version/parser and fail-closed code |
| Environment config output leaks secrets | Parse in memory; never print/hash/store raw response |
| Close automatically opens | Separate commands, confirmations, approvals, and transactions |
| Forced drain rewrites user state | Query-only drain; no deletes/backfills |
| Global readiness outage | Speed mode-scoped failure; Standard remains available |
| Rollback strands v2 rows | Dual-compatible gated rollback only |

## 23. Approval statement

Ticket 194 itself requires no product-timing approval and authorizes no hosted action.

Future explicit approvals remain required for:

1. Ticket 197 merge/deploy/migration;
2. Ticket 198 `v1_open -> closing_to_v2`;
3. Ticket 198 `closing_to_v2 -> v2_open` after fresh drain evidence;
4. any provider token creation/configuration change;
5. disable, lifecycle rollback, provider rollback, or hosted gameplay smoke.
