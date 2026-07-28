# Ticket 181 — Hosted Wave U Concurrent-Ready Smoke Response

Task: Hosted Concurrent-Ready Gameplay Smoke
Agent: Yuna (deployment verification)
Status: **FAIL — release blocker reproduced**. Exact deployed V2 authority and public readiness are healthy, but a genuinely simultaneous two-client ready acknowledgement produced one HTTP 201 and one sanitized HTTP 500. The authoritative match then voided with only one participant ready. No terminal/rated lifecycle was attempted after this blocker.

## What I understood

After Ticket 204 PASS and Ashar's direct Ticket 181 assignment, perform the narrowly scoped hosted gameplay-write smoke: verify exact deployment/readiness/catalog, create two independent preview-demo sessions, pair once in Speed, dispatch ready acknowledgements genuinely concurrently with measured skew, verify the V2 invitation/ready/countdown/reconnect contract, complete one controlled rated lifecycle only if readiness succeeds, check profile/history/leaderboard convergence and Standard isolation, inspect the hosted browser console and spoiler safety, and stop without provider/environment/dictionary/lifecycle-authority changes.

## Release and deployment identity

```text
origin/main = e91d515c730f10c3d97d69627a497f810ad3c465
main CI = PASS
main CI run = 30243730705
main CI URL = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/30243730705
```

GitHub deployment records for the exact SHA:

```text
Vercel production deployment record = 5618264540
Vercel state = success
Vercel completed = 2026-07-27T06:45:22Z
Vercel target = https://wordle-royale-edltoxe0w-ashar-neodyms-projects.vercel.app

Railway production deployment record = 5618259384
Railway environment = lucid-dream / production
Railway state = success
Railway completed = 2026-07-27T06:46:26Z
```

Ticket 204 independently recorded the immutable Railway deployment as `ce812cf4-967a-4457-afe1-07a21d50eefb`, artifact `git:e91d515c730f10c3d97d69627a497f810ad3c465`, one replica, `v2_open`, generation 3.

No deployment was triggered during Ticket 181.

## Pre-smoke public readiness

```text
GET /healthz = 200; status=ok
GET /readyz = 200; status=ok
GET /ranked/modes = 200
```

Readiness dependencies:

```text
database = ok
applicationSchema = ok — 19 required tables
standardDictionary = ok — en-5-test-vfixture.001 / 20 answers
speedRuntime = ok
speedLifecycleActivation = ok
redis = optional / not_checked_stub
```

Ranked catalog:

```text
standard_1v1 enabled = true
speed_1v1 enabled = true
speed_1v1 queueEnabled = true
ruleset = speed_1v1_v1_75s
ready lifecycle = speed_ready_v2_first_ack_90s
invitation window = 90 seconds
ready window = 20 seconds
ready window starts on = first_valid_ready_acknowledgement
countdown = 3 seconds
round time = 75 seconds
max guesses = 6
solve-time bucket = 100 ms
classic_1v1 enabled = false
multiplayer_lobby enabled = false
```

## Hosted simultaneous-ready result

Two independent preview-demo cookie jars were used. Cookie values were never printed, persisted, or written to repository files.

The authoritative reproduced probe:

```text
sessions = 2
distinct users = true
shared Speed match = 85d580c5-06fe-4719-a07e-7532f258abe3
ready dispatch skew = 0.680 ms

session A ready = HTTP 500 in 7.968s
sanitized code = internal_server_error
session B ready = HTTP 201 in 7.711s
```

No diagnostic match-state read occurred between pairing and dispatching both ready requests. A threading barrier released both independent session requests together, and dispatch times were measured with the monotonic high-resolution clock immediately before each request.

This reproduces the critical behavior once more after an earlier concurrent attempt returned:

```text
one ready response = HTTP 500 in 9.520s
sanitized code = internal_server_error
```

The earlier diagnostic attempt was stopped immediately by the fail-closed script and was not used as the authoritative final probe.

## Authoritative post-window state

After the 20-second ready window, both original cookie jars read the same match:

```text
session A state = voided
session B state = voided
readyCount = 1 for both
session A result = void
session B result = void
session A terminalReason = no_contest
session B terminalReason = no_contest
```

Post-window state read latency:

```text
session A = 6.538s
session B = 5.253s
```

The server therefore failed closed and did not misrepresent the match as ready or rated. However, Ticket 181 requires both genuinely simultaneous acknowledgements to succeed and proceed through countdown/reconnect. That criterion failed.

## Controlled terminal/rated lifecycle

**Not executed after the concurrent-ready blocker.**

The smoke deliberately stopped instead of attempting a forfeit, guesses, generic completion, or rating convergence against a match that had accepted only one ready acknowledgement. Consequently, these acceptance criteria remain unproved:

- two-ready countdown transition;
- in-progress reconnect with immutable start/deadline identity;
- one controlled rated terminal lifecycle;
- exactly-once Speed settlement;
- exact-match profile/history/leaderboard convergence.

This is a safe stop, not a partial PASS.

## Standard isolation and post-smoke health

After the failed probe:

```text
GET /healthz = 200; status=ok
GET /readyz = 200; status=ok
GET /ranked/modes = 200
GET /leaderboard?mode=standard_1v1&limit=10 = 200
```

Readiness remained:

```text
database = ok
applicationSchema = ok
standardDictionary = ok
speedRuntime = ok
speedLifecycleActivation = ok
redis = optional / not_checked_stub
```

The public catalog still reports Standard enabled and Speed V2 enabled/queue-enabled. Ticket 181 did not create a Standard matchmaking ticket or perform any Standard gameplay mutation.

## Browser and UI evidence

Hosted `/play` loaded successfully at:

- https://wordle-royale-web.vercel.app/play

Browser inspection:

```text
console messages = 0
JavaScript errors = 0
server status rendered = online / ok
```

Operational warning: the canonical web route rendered Speed as `Not live yet` / `Speed queue is not enabled`, while the authoritative API catalog simultaneously reported Speed enabled and queue-enabled under V2. The web page also rendered `speedLifecycleActivation=not_checked_stub` while the authoritative API `/readyz` returned `speedLifecycleActivation=ok`. This indicates a web/API presentation or origin/cache mismatch requiring investigation; it is not used to override the API's authoritative lifecycle proof.

## Spoiler and secret safety

Across the authoritative preview session, queue, ready, and post-window state bodies:

```text
answer key occurrences = 0
answerHash key occurrences = 0
answerSalt key occurrences = 0
plaintext-answer key occurrences = 0
cookie values printed = false
```

No bearer token, cookie, provider credential, database URL, answer authority, raw provider payload, dictionary answer, answer hash, or salt is preserved in this response.

## Preparatory-attempt disclosure

1. The first local smoke script incorrectly looked for ticket field `matchId` instead of the committed contract field `matchedMatchId`. It created two preview sessions/tickets but issued no ready or gameplay action. The script failed closed and was corrected from committed source before further use.
2. The next concurrent-ready attempt produced a sanitized HTTP 500 for one ready request in 9.520 seconds. Its script stopped immediately; it was not counted as complete acceptance evidence.
3. The final instrumented attempt preserved both cookie jars, reproduced the HTTP 500/201 split at 0.680 ms dispatch skew, waited through the ready window, and proved the shared authoritative `voided/no_contest/readyCount=1` state.

Preview-demo/ticket/match rows are ephemeral hosted smoke data. The final observed match is terminal and voided. No destructive database cleanup was attempted. Earlier incomplete preview rows are expected to expire or reconcile by product policy, but this shell no longer retains their session cookies, so no unsupported cleanup claim is made.

## Safety and cleanup

- No provider setting or environment variable changed.
- No deployment, restart, scale, or migration was triggered.
- No Railway provider command or hosted database connection was opened.
- No dictionary mutation occurred.
- No lifecycle authority close/open/disable/rollback operation occurred.
- No generic completion route was called.
- No terminal/rating mutation followed the ready failure.
- Temporary local smoke script removed.
- No local server, browser test process, Docker container, or database process remains.
- Existing unrelated dirty coordination files were preserved and not staged or committed.

## Files changed

Created locally and uncommitted:

- `agent-communication/responses/ticket-181-yuna-hosted-wave-u-concurrent-ready-smoke-response.md`

## Commands run + exit codes

```text
git fetch origin --prune                                      0
GitHub main-CI/deployment read queries                        0
pre-smoke /healthz, /readyz, /ranked/modes                   200
first local harness attempt                                   1 — local field-name bug; no ready call
second concurrent-ready harness attempt                       1 — hosted HTTP 500 reproduced
final instrumented concurrent-ready harness                   3 — intentional FAIL verdict after HTTP 500/201 and authoritative void
post-smoke health/readiness/catalog/Standard reads            200
browser /play navigation                                      PASS
browser console inspection                                    PASS — 0 messages/errors
temporary script removal                                      0
```

## Verification result

**FAIL.** Ticket 181 acceptance is blocked by a reproducible hosted simultaneous-ready failure:

```text
0.680 ms dispatch skew
HTTP 500 / HTTP 201
readyCount = 1
state = voided
result = void / void
terminalReason = no_contest / no_contest
```

Do not treat current Speed V2 as release-ready. Ticket 182 remains blocked pending diagnosis, remediation, deployment, and a fresh authorized Ticket 181 smoke.

## Approval-needed actions

1. Athena should classify the simultaneous-ready HTTP 500 as a release blocker.
2. Freya should diagnose the server-side failure using sanitized logs or local deterministic reproduction; no raw production payloads or credentials should enter handoff files.
3. Any fix requires its own implementation, independent QA, checkpoint PR/CI, approved merge, current-main CI, and exact deployment correlation.
4. A new hosted gameplay-write authorization is required before rerunning Ticket 181.
5. No lifecycle disable or rollback is authorized by this FAIL result; Ashar/Athena must decide that separately using the reviewed runbook.

## Rollback

No deployment or authority mutation occurred in Ticket 181, so there is nothing for Yuna to roll back from this ticket. The failed match reconciled to terminal `voided/no_contest` state.

If Ashar decides Speed must be disabled or lifecycle authority rolled back, that is a separate explicit operation requiring exact current provider/fleet/lease/authority proof and the reviewed confirmation path. Do not infer rollback approval from this report.

## Follow-up tickets

### Diagnose simultaneous-ready HTTP 500

- Target agent: Freya
- Why needed: backend owner must identify the server-side error and preserve fail-closed lifecycle semantics.
- Exact task: Reproduce the hosted HTTP 500/201 concurrent-ready split locally against disposable PostgreSQL with both requests released at the transaction boundary; inspect sanitized production logs if separately authorized; identify root cause; add a permanent regression; implement the minimum fix without widening readiness deadlines or weakening locking/generation fences.
- Inputs/context: exact artifact `e91d515…`, lifecycle `speed_ready_v2_first_ack_90s`, match `85d580c5-06fe-4719-a07e-7532f258abe3`, dispatch skew 0.680 ms, ready latencies 7.968s/7.711s, HTTP 500/201, final readyCount 1 and `voided/no_contest` state.
- Expected output back to Athena: root cause, minimal reviewed patch, deterministic PostgreSQL evidence, canonical test results, risks, and a Jasmine QA ticket.

### Independent regression QA

- Target agent: Jasmine
- Why needed: release-blocking concurrency fixes require independent verification.
- Exact task: After Freya's fix, independently prove simultaneous two-ready success under hostile PostgreSQL scheduling, strict first-ack deadline identity, no duplicate reveal/settlement, no raw leak, Standard isolation, and canonical gates.
- Inputs/context: Ticket 181 FAIL evidence and Freya's implementation response.
- Expected output back to Athena: PASS/WARN/FAIL and whether checkpointing is authorized.

### Web/API presentation mismatch

- Target agent: Luna
- Why needed: the canonical web route rendered Speed disabled and activation `not_checked_stub` while the authoritative API reported Speed V2 enabled and activation `ok`.
- Exact task: Diagnose API origin, SSR/cache, and deployed-web revision behavior without changing production settings; determine why `/play` presents stale/alternate catalog and readiness data; propose the smallest fix and verification.
- Inputs/context: exact deployed main SHA, Vercel production record 5618264540, API `/ranked/modes` and `/readyz` evidence, zero browser-console errors.
- Expected output back to Athena: root cause, source/config fix if needed, local/browser evidence, and deployment implications.

### Release/blocker and rollback decision

- Target agent: Athena/Ashar
- Why needed: release and lifecycle authority decisions are not delegated to the smoke executor.
- Exact task: Mark Ticket 181 FAIL, keep Ticket 182 blocked, decide whether Speed stays open for remediation or requires a separately approved disable/rollback operation, and sequence Freya → Jasmine → Yuna checkpoint/deploy/smoke work.
- Inputs/context: this response and Tickets 202–204 authority evidence.
- Expected output back to Athena: explicit release state, rollback/no-rollback decision, and authorized next tickets.
