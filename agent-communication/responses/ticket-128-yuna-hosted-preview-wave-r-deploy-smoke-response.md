# Ticket 128 — Hosted Preview Wave R Deploy and Smoke Response

Task: Hosted Preview Wave R Deploy and Smoke
Agent: Yuna (operations/deploy verification)
Status: **FAIL / BLOCKED** — Wave R is merged and deployed with green CI and healthy schema readiness, but hosted Standard 1v1 queue creation cannot complete because no dictionary release is available

## What I understood

Verify the merged Wave R deployment and migration, then exercise two independent hosted preview-demo sessions through Standard 1v1 queueing, shared-match creation, reconnect/gameplay routing, and a safe rating-settlement smoke. Do not perform destructive rollback, expose secrets, change paid resources, or mutate provider settings without approval.

## Prerequisites confirmed

Repository state after fetch:

```text
main HEAD = b8329ede9d971671c5805008d7afd85afb396364
commit = Wave R checkpoint: live Standard 1v1 matchmaking (#6)
origin/main = b8329ede9d971671c5805008d7afd85afb396364
```

PR:

```text
PR #6 = merged
URL = https://github.com/Ashar-Neodym/wordle-royale/pull/6
merged_at = 2026-07-13T06:27:11Z
```

Post-merge main CI:

```text
run = Workspace checks
head SHA = b8329ede9d971671c5805008d7afd85afb396364
status = completed
conclusion = success
URL = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29229045846
```

PR branch checks were also terminal-success before merge:

```text
https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29228573352
https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29228442546
```

## Hosted targets

```text
Web: https://wordle-royale-web.vercel.app
API: https://wordle-royaleapi-production.up.railway.app
```

## Provider access / deploy evidence boundary

This shell does not have Railway/Vercel/Supabase CLI or API-token access:

```text
railway CLI = absent
vercel CLI = absent
supabase CLI = absent
RAILWAY_TOKEN = absent
VERCEL_TOKEN = absent
SUPABASE_ACCESS_TOKEN = absent
```

I therefore could not inspect Railway deploy logs or directly prove the pre-deploy command log line. No provider settings or secrets were changed.

Non-secret runtime evidence confirms the Wave R migration/deploy shape is live:

```text
/readyz HTTP 200
status = ok
database = ok
applicationSchema = ok
applicationSchema message = Application schema contains 18 required table(s).
redis = not_checked_stub
```

The 18-table schema is the Wave R readiness shape including `MatchmakingTicket`, so the hosted schema migration has been applied successfully.

## Existing core endpoint smoke

All returned HTTP 200:

```text
GET /healthz
GET /readyz
GET /lobbies
GET /leaderboard
GET /ranked/modes
```

Hosted web:

```text
GET / = 200
GET /play = 200
GET /profile = 200
/play contains `Live queue` = true
/play contains `Find match` = true
/play contains `Not live yet` = true
/play contains stale server-rendered `Checking for an active search` = false
```

## Two-session matchmaking smoke

Two independent preview-demo sessions were created with separate in-memory cookie jars. Cookie values were never printed or stored in this response.

First probe:

```text
session 1 start = 201
session 1 auth/me = 200
session 2 start = 201
session 2 auth/me = 200
session user IDs = distinct
```

Concurrent Standard queue joins were attempted with distinct UUID client request IDs:

```json
{
  "mode": "standard_1v1",
  "rated": true,
  "allowProvisionalOpponent": true
}
```

Result:

```text
session 1 join = 500 internal_server_error
requestId = d76dd706-2b12-4797-811f-69185a6fcd59
```

A second independent two-session probe was then run sequentially to obtain a stable public error classification. Both sessions again started successfully and resolved to distinct users. The first queue join returned:

```text
HTTP 503
error code = dictionary_release_unavailable
message = No active dictionary release is available for Standard matchmaking.
requestId = 2adcd966-f779-40e8-a400-1485ec59180f
```

Retrying the same idempotent join returned the same terminal classification:

```text
HTTP 503
error code = dictionary_release_unavailable
requestId = f491de4b-c53b-43d2-be73-9abbcff7041a
```

## Acceptance result

| Requirement | Result | Evidence |
|---|---|---|
| Confirm merged SHA | PASS | `b8329ede9d971671c5805008d7afd85afb396364` |
| Confirm green post-merge main CI | PASS | Actions run `29229045846`, completed/success |
| Verify migration/schema readiness | PASS via runtime | `/readyz`: database `ok`, application schema `ok`, 18 required tables |
| Capture Railway pre-deploy log | BLOCKED | no Railway provider access in this shell |
| Create two preview demo sessions | PASS | two `201` starts, two `200` auth reads, distinct user IDs |
| Join both to Standard queue | FAIL | reproducible `503 dictionary_release_unavailable`; first concurrent attempt also exposed a `500` |
| Shared match ID / distinct participants | BLOCKED | no match can be created without a dictionary release |
| Queue reconnect / matched route | BLOCKED | no durable matched ticket created |
| Safe rating-settlement smoke | BLOCKED | no match exists to settle or safely inspect |
| Web queue and core endpoints | PASS | web pages and core API endpoints return `200`; expected queue copy is present |

## Finding

### Release blocker — hosted preview has no usable dictionary release

The deployed matchmaker queries a five-letter dictionary release with status `active` or `draft` before creating a Standard match. Hosted runtime returns `dictionary_release_unavailable`, which means no qualifying release row is available to the API.

This is not a missing Wave R table migration: application-schema readiness is `ok` with 18 required tables. It is a hosted data/bootstrap prerequisite that readiness currently does not detect.

The first concurrent attempt's generic `500` should also be reviewed. A later sequential attempt correctly surfaced the stable `503 dictionary_release_unavailable` classification, so the blocker is reproducible without relying on the generic error.

## What I did not do

- Did not seed or directly mutate hosted Supabase.
- Did not change Railway pre-deploy/start commands.
- Did not change provider environment variables or secrets.
- Did not create or upgrade paid resources.
- Did not perform destructive schema rollback.
- Did not merge or push to `main`.
- Did not fabricate shared-match or rating evidence after queue creation failed.

## Rollback guidance

No manual provider mutation was performed by Ticket 128, so there is nothing from this ticket to roll back.

If Wave R must be disabled before the hosted data/bootstrap defect is fixed:

1. Prefer a forward fix or temporarily mark Standard queue unavailable in web/API configuration.
2. Do not roll back the database migration destructively; the added table is additive and existing data should be preserved.
3. If reverting application code is required, revert through a reviewed branch/PR to the last known-good Wave Q commit, then monitor main CI and provider redeploys.
4. Preserve the Wave R migration in schema history unless a database owner explicitly approves a separate data-safe rollback plan.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Freya
- Why that agent is needed: backend/runtime bootstrap ownership.
- Exact task: Define and implement a safe hosted-preview dictionary-release bootstrap or explicit operator command. It must create/import only the approved preview fixture dictionary policy, be idempotent, avoid exposing answer data through APIs/logs, and add an integration test showing a freshly migrated hosted-shaped database can create a Standard match.
- Inputs/context they need: Ticket 128 response; request IDs `2adcd966-f779-40e8-a400-1485ec59180f` and `f491de4b-c53b-43d2-be73-9abbcff7041a`; `dictionary_release_unavailable`; current seed/dictionary policy.
- Expected output back to Athena: implementation or reviewed bootstrap command, tests, security/data-policy notes, and exact safe execution instructions for Yuna.

### Follow-up ticket 2

- Target agent: Elisa
- Why that agent is needed: data/readiness contract decision.
- Exact task: Decide whether hosted preview may use the existing fixture dictionary release and whether dictionary availability should become a required `/readyz` dependency for live Standard matchmaking.
- Inputs/context they need: Ticket 128 failure, current `active|draft` matchmaker lookup, preview fixture-only/non-production-approved metadata.
- Expected output back to Athena: approved dictionary policy, readiness semantics, and production/preview boundary.

### Follow-up ticket 3

- Target agent: Yuna
- Why that agent is needed: controlled hosted operation and re-smoke.
- Exact task: After Ashar approves the dictionary bootstrap/data mutation and Freya/Elisa provide the safe command/policy, execute the minimum hosted bootstrap, capture non-secret provider evidence, and rerun Ticket 128 two-session queue/match/reconnect/rating smoke.
- Inputs/context they need: approved command, provider access, rollback plan, this response.
- Expected output back to Athena: bootstrap result, shared match ID, distinct participant evidence, reconnect/gameplay result, and safe settlement evidence.

### Follow-up ticket 4

- Target agent: Jasmine
- Why that agent is needed: independent hosted QA.
- Exact task: Keep Ticket 129 blocked until Ticket 128 re-smoke passes; then independently verify hosted Standard queue, shared match, reconnect, spoiler safety, and rating read convergence.
- Inputs/context they need: corrected Ticket 128 response and hosted URLs.
- Expected output back to Athena: final hosted Wave R PASS/WARN/FAIL.
