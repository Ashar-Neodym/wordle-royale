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

## Athena/Yuna resumed hosted execution — approved dictionary bootstrap

Ashar explicitly approved the reviewed hosted preview dictionary-only bootstrap after PR #7 merged and main CI passed.

Verified operation:

```text
first apply result = created
release = en-5-test-vfixture.001
counts = 20 answer / 40 guess / 3 banned / 63 total
fixtureOnly = true
productionApproved = false
second apply result = unchanged
```

Hosted readiness then transitioned to:

```text
/healthz = 200 ok
/readyz = 200 ok
database = ok
applicationSchema = ok
standardDictionary = ok
```

No `db:seed:local`, fixture user seed, provider setting change, or production dictionary approval occurred.

### New hosted blocker after bootstrap

Two distinct preview sessions started successfully, but concurrent queue joins returned `500/500`; sequential join also returned `500 internal_server_error`, and no current ticket persisted. A local API process pointed at the same hosted Supabase database reproduced a single join failure at approximately 5.1 seconds. The dictionary selector alone took approximately 2.0 seconds through the hosted pooler.

`MatchmakingService.inTransaction()` currently passes only serializable isolation to Prisma. Prisma therefore applies its default 5-second interactive-transaction timeout. Hosted dictionary verification plus profile/ticket/audit/locking/candidate work exceeds that budget and rolls back.

Ticket 128 remains **FAIL/BLOCKED** pending Tickets 138–140 and a new hosted smoke. The dictionary bootstrap itself is accepted and does not need to be rerun except as an idempotent `unchanged` verification.

## Resumed hosted smoke after Ticket 140 merge

Final resumed status: **PASS** for Ticket 128's authorized hosted two-session smoke.

### Merge and current-main CI

```text
PR #8 = merged
https://github.com/Ashar-Neodym/wordle-royale/pull/8
merge commit = 93311939e3d679a5c49bf047530a81265e3a5bdd
merged_at = 2026-07-14T10:11:35Z

current-main CI = completed / success
run = 29324464243
https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29324464243
```

### Hosted readiness and core smoke

```text
GET /healthz = 200
GET /readyz = 200, status=ok
database = ok
applicationSchema = ok (18 required tables)
standardDictionary = ok
dictionary version = en-5-test-vfixture.001
dictionary answer count = 20
redis = not_checked_stub (optional)

GET /lobbies = 200
GET /leaderboard = 200
GET /ranked/modes = 200

GET web / = 200
GET web /play = 200
GET web /profile = 200
/play contains `Live queue` = true
/play contains `Find match` = true
/play contains stale `Checking for an active search` markup = false
```

Provider CLIs/tokens remain unavailable in this shell, so Railway's pre-deploy log line could not be inspected directly. The current runtime schema/readiness and passing behavior are non-secret deployment evidence. No provider setting was changed.

### Successful two-session queue and match

Two new independent preview-demo sessions were created with separate in-memory cookie jars. Session cookies were not printed or stored. Both session starts returned `201`; both authenticated reads returned `200`; the user IDs were distinct.

Correct top-level contract used:

```json
{
  "mode": "standard_1v1",
  "rated": true,
  "allowProvisionalOpponent": true,
  "clientRequestId": "<fresh UUID per session>"
}
```

Authoritative results:

```text
session A join = 200 queued (11.200s)
session B join = 201 matched (19.606s)

session A current = 200 matched
session B current = 200 matched

shared match ID = f6958220-5459-4532-a91b-93b4df55860a
ticket A = 527c48cc-40b7-425c-93ff-52a25e5617db
ticket B = 20b2c9ff-9702-4597-82eb-7d16a0e65e41
distinct expected participants present in authoritative state = true
observed participant user-ID count = 2
```

Both users then performed:

```text
GET /matchmaking/standard-1v1/tickets/current = 200 matched
GET /matchmaking/standard-1v1/tickets/:ticketId = 200 matched
GET /matches/:matchId/state = 200
```

Both ticket reads returned the same shared match ID. The match-state response contained both expected distinct participant identities.

### Matched route and safe settlement exercise

```text
GET web /matches/f6958220-5459-4532-a91b-93b4df55860a = 200

GET /matches/f6958220-5459-4532-a91b-93b4df55860a/result = 400
error code = match_result_not_ready
message = Result summary is only available after ranked match completion.
```

This safely exercised the rating-settlement boundary without fabricating or forcing gameplay completion: an active match cannot expose/finalize a rating result prematurely. No rating mutation was performed by the smoke.

### Troubleshooting note

Two preparatory probes were not used as acceptance evidence:

1. The first parser expected a response object where one valid HTTP response had no parsed object and exited after the join requests; no cookie/token value was retained.
2. A second probe incorrectly nested client metadata and correctly received `400 validation_failed`. Reading the current contract showed `clientRequestId` belongs at the request top level. The corrected probe above then passed end to end.

These were smoke-client issues, not hosted product failures. The successful probe used the committed contract and server-authoritative current/by-ID/state reads.

### Final acceptance result

| Requirement | Result | Evidence |
|---|---|---|
| Merged SHA and post-merge main CI | PASS | `93311939...`; Actions `29324464243` success |
| Migration/schema readiness | PASS | database/application schema `ok`; 18 tables |
| Dictionary readiness | PASS | exact preview fixture release available |
| Two distinct demo sessions | PASS | independent cookie jars; distinct users |
| Join Standard queue | PASS | `200 queued` + `201 matched` |
| One shared match / distinct participants | PASS | one shared ID; two expected participant IDs |
| Current-ticket and by-ID reconnect | PASS | both `200 matched` with same match ID |
| Matched gameplay route | PASS | hosted web match route `200` |
| Safe rating-settlement exercise | PASS | active result correctly rejected as `match_result_not_ready` |
| Core web/API smoke | PASS | listed routes `200`; queue UX present |
| Railway pre-deploy log capture | BLOCKED | no Railway provider access; runtime schema/readiness prove deployed shape |

### Resumed-smoke safety and rollback

- Did not rerun the hosted dictionary bootstrap.
- Did not run `db:seed:local` against hosted preview.
- Did not change Railway, Vercel, Supabase, provider environment, or secrets.
- Did not expose cookie values, tokens, connection strings, dictionary answers, or provider credentials.
- Did not force match completion or mutate rating results.
- The smoke created expected preview demo sessions, queue tickets, and a Standard match as authorized test data.
- If the hosted repair must be rolled back, use a reviewed code revert/PR and redeploy; do not destructively roll back the additive schema or delete the approved dictionary release without a separate data-owner plan.

### Follow-up tickets after PASS

1. **Target agent: Jasmine** — independently execute Ticket 129 against the hosted deployment, including gameplay completion and authoritative profile/history/rating convergence where safely supported.
2. **Target agent: Athena** — update the master plan to mark Ticket 128 PASS and unblock Ticket 129. Preserve the provider-log evidence limitation as an operational warning, not a matchmaking blocker.
