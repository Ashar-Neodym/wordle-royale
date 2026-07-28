# Ticket 202 — Read-Only Hosted V2 Activation Preflight Response

Task: Read-Only Hosted V2 Activation Preflight
Agent: Yuna (operations)
Status: **FAIL / BLOCKED — no-write**. Public exact-SHA deployment and runtime readiness evidence passed, but the trusted operator could not run because this shell has neither an authenticated Railway session nor an approved hosted `DATABASE_URL`. Exact provider fleet, leases, authority generation, operator schema/indexes, lifecycle-work drain state, and audit no-write count therefore remain unproved. Ticket 203 remains blocked.

## What I understood

Ticket 202 authorizes read-only/dry-run hosted preflight only. It does not authorize provider settings changes, login-token creation, environment mutation, deployment/restart, hosted migration/seed, authority/audit/queue/gameplay writes, or any `close-v2`/`open-v2` transition. Unknown or partial proof must fail closed.

## Read-only actions performed

- Fetched current Git/GitHub state.
- Confirmed PR #12 merge and exact merge SHA.
- Queried the exact-SHA GitHub Actions run.
- Queried exact-SHA GitHub Deployments and sanitized status fields.
- Queried public production `/healthz`, `/readyz`, and `/ranked/modes`.
- Bootstrapped Railway CLI `5.27.2` locally with `pnpm dlx`.
- Ran `railway whoami` with stdout discarded and stderr reduced to a non-sensitive error class.
- Did not inspect any Railway credential file.
- Did not invoke `railway login`, browserless login, token creation, `railway run`, the operator command, or any apply command.

## Merge, CI, and deployment evidence

```text
PR #12 = MERGED
merge SHA = 6992ce1ef12b4d1b7e51869be7b2f7c70340e839
merged at = 2026-07-23T04:54:28Z

main workflow = PR Checks
run = 29980735763
job = 89121756457
conclusion = success
completed = 2026-07-23T04:55:57Z
```

Exact-SHA production deployments:

```text
Vercel GitHub deployment = 5567131134
environment = Production
state = success
completed = 2026-07-23T04:55:05Z
SHA = 6992ce1ef12b4d1b7e51869be7b2f7c70340e839

Railway GitHub deployment = 5567126179
environment = lucid-dream / production
state = success
completed = 2026-07-23T04:56:56Z
SHA = 6992ce1ef12b4d1b7e51869be7b2f7c70340e839
provider project ID observed from the public GitHub deployment status = 12f01fb0-40a0-483a-9d88-923b4677b4c0
provider environment ID observed from the public GitHub deployment status = 25f2e37e-88a6-4587-a875-d8662b684e54
```

Evidence boundary:

- GitHub proves an exact-SHA successful Railway deployment integration record.
- It does not expose the required Railway service ID, immutable Railway deployment ID, complete active deployment inventory, exact replica count/IDs/regions, or linked CLI scope agreement.
- The GitHub deployment ID is not interchangeable with Railway's provider deployment ID.

## Public hosted readiness

```text
GET /healthz = 200
service = wordle-royale-api
environment = production

GET /readyz = 200
overall = ok
database = ok
applicationSchema = ok
required tables = 19
standardDictionary = ok
dictionary fixture = en-5-test-vfixture.001 / 20 answers
speedRuntime = ok
speedLifecycleActivation = ok
redis = not_checked_stub (optional)

GET /ranked/modes = 200
Standard enabled = true
Speed enabled = true
Speed queue enabled = true
Speed ruleset = speed_1v1_v1_75s
Speed lifecycle = speed_ready_v1_match_created_20s
```

A second post-preflight `/ranked/modes` read returned the same Speed enabled/queue/lifecycle values. This supports that no public authority transition occurred during this attempt, but it does not substitute for an audit-row count or transactional database readback.

## Authentication and authority preflight

```text
installed system railway command = absent
pnpm dlx Railway CLI = 5.27.2
RAILWAY_TOKEN present = false
RAILWAY_API_TOKEN present = false
DATABASE_URL present = false
railway whoami = exit 1
sanitized error class = unauthorized
```

No credential values or raw identity were printed or persisted.

## Trusted operator result

The required read-only command was **not executed**. Mandatory inputs could not be safely and authoritatively established:

```text
projectId = publicly observed through GitHub deployment status
                          but linked Railway scope not verified

environmentId = publicly observed through GitHub deployment status
                          but linked Railway scope not verified

serviceId = unavailable
deploymentId = unavailable
expectedRelease = unavailable because provider deploymentId is unavailable
expectedArtifact = git:6992ce1ef12b4d1b7e51869be7b2f7c70340e839
                    expected from target SHA, but not provider-verified
expectedReplicas = unavailable
expectedPhase = public API indicates v1 behavior, but DB authority row not verified
expectedGeneration = unavailable
health URL = public canonical API known, but provider inventory host binding not verified
hosted DATABASE_URL = unavailable
```

The operator's fail-closed contract prevents replacing these values with names, guesses, GitHub deployment IDs, historical values, or public runtime inference.

## Unproved acceptance criteria

Because the trusted operator did not run, the following remain unproved:

- exact Railway service and immutable provider deployment ID;
- exactly one active successful deployment;
- immutable provider artifact identity matching merge SHA;
- complete replica count, IDs, regions, and health-origin binding;
- fresh matching capability leases and one-to-one replica cardinality;
- DB-clock bracket and proof freshness;
- authority row exact phase `v1_open` and generation;
- additive operator schema, indexes, and audit constraints in hosted PostgreSQL;
- zero incompatible active lifecycle work;
- exact audit row count before/after;
- dictionary/reconciler health inside the transaction-bound operator proof;
- close/open target generation and confirmation plan generated from current authority.

## Expected future confirmation phrases

These are documented contracts only and are **not approvals**:

```text
close-v2: CLOSE SPEED V1 CREATION FOR V2 DRAIN
open-v2:  OPEN SPEED CREATION ON READY LIFECYCLE V2
```

Each future apply operation requires a separate explicit approval reference, exact current generation, `--apply`, and the matching phrase. Close never implies open.

## No-write evidence

No state-changing path was called:

```text
railway login/token creation = not called
railway provider query = not authenticated / not executed beyond whoami
railway run = not called
operator verify = not called
operator --apply = not called
close-v2/open-v2/disable/rollback = not called
provider settings/env/deployment/restart = unchanged by this ticket
hosted database connection = not opened
hosted migration/seed/bootstrap = not run
authority/audit/lease/queue/gameplay writes = not issued
```

Public mode state remained `speed_ready_v1_match_created_20s` before and after. Exact database audit no-write proof is unavailable without hosted read access, so I do not claim an authoritative audit-row delta.

## Risks and blockers

1. Railway OAuth/project-token authority is absent in this shell.
2. Hosted PostgreSQL authority is absent.
3. Starting `railway login --browserless` would require user interaction and credential authorization not supplied by this ticket; no login was initiated.
4. Creating a Railway token or exposing a database URL in chat/files would violate the boundary.
5. Partial public evidence cannot safely supply service/deployment/replica/generation inputs.
6. Ticket 203 must remain blocked; executing close on partial proof would violate fail-closed activation design.

## Recommendation

**FAIL / BLOCKED, safe no-write.** Deployment and public readiness prerequisites look healthy, and v1 remains live, but do not proceed to Ticket 203 until a trusted operator shell has:

- authenticated Railway CLI access scoped to the exact project;
- approved process-only hosted database injection, preferably via verified `railway run`;
- exact service/deployment/replica/region inventory;
- the full expected target tuple;
- a successful sanitized `verify` dry-run with before/after audit-count proof.

## Follow-up tickets

### Follow-up 1

- Target agent: Ashar/Athena
- Why needed: access and approval boundary cannot be resolved from repository/public data.
- Exact task: Choose an approved trusted operator shell and provide Railway OAuth access plus process-only hosted database injection. Do not paste credentials or `DATABASE_URL` into chat or repository files. Confirm whether Yuna may initiate browserless Railway login if that is the selected path.
- Inputs/context: target merge SHA `6992ce1ef12b4d1b7e51869be7b2f7c70340e839`, public project/environment IDs above, Ticket 202 blocked response, activation runbook.
- Expected output back to Athena: approved access method and explicit read-only rerun authorization; no apply authorization implied.

### Follow-up 2

- Target agent: Yuna
- Why needed: operations owns the trusted read-only provider/DB proof.
- Exact task: Once approved access exists, rerun Ticket 202 using only `verify`/dry-run, capture sanitized exact fleet/lease/authority/schema/drain evidence and audit counts, and stop before any transition.
- Inputs/context: authenticated CLI, process-only database injection, exact service ID, provider deployment ID, replica count, expected phase/generation, canonical health origin.
- Expected output back to Athena: PASS/WARN/FAIL preflight and explicit no-write proof.

### Follow-up 3

- Target agent: Yuna
- Why needed: Ticket 203 is a separate state-changing close/drain operation.
- Exact task: Keep Ticket 203 blocked until Ticket 202 returns PASS and Ashar provides a separate exact `close-v2 --apply` approval reference and confirmation.
- Inputs/context: successful Ticket 202 proof and current generation.
- Expected output back to Athena: either a safe stop or separately authorized close/drain evidence; never infer approval from this preflight assignment.
