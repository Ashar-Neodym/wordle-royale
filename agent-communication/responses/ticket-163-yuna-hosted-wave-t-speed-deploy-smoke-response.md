# Ticket 163 — Hosted Wave T Speed Deploy and Smoke Response

Task: Hosted Wave T Speed Deploy and Smoke
Agent: Yuna (deployment verification)
Status: **PASS with reliability warning** — exact-SHA Vercel and Railway production deployments, Speed readiness/catalog, final two-session Speed queue/countdown/reconnect/controlled terminal settlement, Speed profile/history/leaderboard convergence, Standard regression, browser console, and spoiler safety verified. A concurrent-ready preparatory probe timed out and requires Jasmine retest.

## What I understood

Verify the approved, merged Wave T release without changing provider settings or dictionary data: correlate the deployed revision, verify readiness and mode gating, create two isolated preview sessions, pair once in Speed, exercise server countdown/reconnect and a controlled terminal path, verify authoritative result/rating/read convergence, protect Standard, and record spoiler-safe evidence.

## Merge, main CI, and exact deployment revision

```text
PR = https://github.com/Ashar-Neodym/wordle-royale/pull/10
state = MERGED
mergedAt = 2026-07-17T06:18:03Z
merge SHA = 07aa546b157199a192cc8d156b52a26a4eeb8118
main CI = completed / success
main CI = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29559649001
```

GitHub Deployments API correlated both providers to the exact merge SHA.

### Vercel production

```text
deployment ID = 5484991195
environment = Production
SHA = 07aa546b157199a192cc8d156b52a26a4eeb8118
state = success
completedAt = 2026-07-17T06:18:47Z
target = https://wordle-royale-1x2azxovv-ashar-neodyms-projects.vercel.app
canonical = https://wordle-royale-web.vercel.app
```

### Railway production

```text
deployment ID = 5484986014
environment = lucid-dream / production
SHA = 07aa546b157199a192cc8d156b52a26a4eeb8118
latest state = success
latest successAt = 2026-07-17T06:31:36Z
canonical API = https://wordle-royaleapi-production.up.railway.app
```

Railway CLI/token access remains absent, but unlike prior waves, GitHub deployment integration now exposes exact-SHA Railway production evidence. No provider dashboard mutation was needed.

## Hosted health and readiness

```text
GET /healthz = 200 in 0.680s; status=ok
GET /readyz = 200 in 1.496s; status=ok

database = ok
applicationSchema = ok — 18 required tables
standardDictionary = ok — en-5-test-vfixture.001, 20 answers
speedRuntime = ok — rules, persistence, dictionary, and expiry reconciliation available
redis = not_checked_stub — optional
```

The Speed migration is therefore present and the runtime is operational.

## Ranked mode gating

`GET /ranked/modes = 200` returned:

```text
standard_1v1: enabled=true
speed_1v1: enabled=true, queueEnabled=true
  rulesetVersion=speed_1v1_v1_75s
  ratingAlgorithmConfigVersion=speed_1v1_glicko_v1
  roundTimeSeconds=75
  readyWindowSeconds=20
  countdownSeconds=3
  maxGuesses=6
  solveTimeBucketMs=100
classic_1v1: enabled=false
multiplayer_lobby: enabled=false
```

The hosted `/play` browser route truthfully rendered:

```text
Standard — Live queue
Speed / Blitz — Live queue
Classic — Not live yet
Multiplayer — Not live yet
Server online · ok
speedRuntime: ok
```

Browser console messages: `0`. JavaScript errors: `0`.

## Final authoritative two-session smoke

Two distinct preview-demo users were created with independent in-memory cookie jars. Cookie values were never printed or persisted.

```text
user A = e9eedf53-854d-43a1-84c0-97535c7d1860
user B = ce67b9ae-b913-424e-a670-c01fbe8fe246
distinct users = true
```

### Speed queue

```text
A join = 201 in 5.232s
A ticket = 30254139-9c01-41ef-878d-0ad52ef0178d
A initial state = queued

B join = 201 in 16.915s
B ticket = fdd9caa0-c3a7-476b-b35f-846a649443c9
B state = matched

shared match = f7dad3b7-9ca6-4ee1-9825-b2f755b1198d
non-self = true
```

Subsequent authoritative current-ticket reads returned both tickets as `matched` with the same match ID.

### Ready and countdown

To remain inside the locked 20-second ready window, the final authoritative probe issued the two ready acknowledgements immediately and sequentially after the match response, with no diagnostic reads in between.

```text
A ready = 201 in 7.885s
state = waiting_ready
readyCount = 1
viewerReady = true

B ready = 201 in 6.559s
state = countdown
readyCount = 2
viewerReady = true
startsAt = 2026-07-17T06:44:27.830Z
deadlineAt = 2026-07-17T06:45:42.830Z
```

The server-authored deadline is exactly 75 seconds after `startsAt`.

### Reconnect

Both isolated sessions re-read the same match:

```text
A state = in_progress; match ID preserved; round ID preserved
B state = in_progress; match ID preserved; round ID preserved
startsAt preserved for both = true
deadlineAt preserved for both = true
round ID = 1d893cd0-7f45-47ca-b9ec-06b3a7eaab7d
```

Reconnect reads took 4.714s and 8.648s respectively. Both current-ticket reads remained matched to the same Speed match.

### Controlled terminal path

After reveal/countdown, user A issued exactly one explicit forfeit:

```text
POST /matches/{matchId}/forfeit = 201 in 14.491s
match state = completed
A result = loss
A terminalReason = forfeit
```

User B's authoritative state returned:

```text
state = completed
result = win
terminalReason = awarded_forfeit_win
```

Result endpoint:

```text
GET /matches/{matchId}/result = 200
rankedMode = speed_1v1
rulesetVersion = speed_1v1_v1_75s
ratingAlgorithmConfigVersion = speed_1v1_glicko_v1
standings = 2
results = loss, win
```

No generic client-driven completion route was used.

## Rating, profile, history, and leaderboard convergence

Both users converged on the first read after completion:

```text
A: rating 1486, matchesPlayed 1, losses 1, provisional true
B: rating 1514, matchesPlayed 1, wins 1, provisional true
algorithmConfigVersion = speed_1v1_glicko_v1 for both
```

Both current-user histories contained the exact completed Speed match with `rankedMode=speed_1v1`.

`GET /leaderboard?mode=speed_1v1&limit=100 = 200` returned both users:

```text
B: rating 1514, matchesPlayed 1, wins 1
A: rating 1486, matchesPlayed 1, losses 1
algorithmConfigVersion = speed_1v1_glicko_v1
```

This proves result, rating profile, history, and separate Speed leaderboard convergence without relabeling Standard data.

## Standard regression

For both authenticated users:

```text
GET /matchmaking/standard-1v1/tickets/current = 200
data = null
error = none
```

Standard remains enabled in the ranked catalog, `/readyz` reports the Standard dictionary healthy, the default Standard leaderboard remains available, and the Speed activity did not create a Standard ticket.

## Spoiler and secret safety

Across all final authoritative session, queue, ready, state, terminal, result, profile, history, and Standard-response bodies:

```text
answerHash key occurrences = 0
answerSalt key occurrences = 0
plaintext answer key occurrences = 0
```

No cookie, bearer token, connection string, provider token, secret, dictionary answer, answer hash, or salt is preserved in this response.

## Reliability warning and preparatory probe disclosure

Before the final PASS path:

1. One probe used the obsolete `/auth/preview-demo/session/start` path and received `404`. No session or mutation was created. Reading the committed controller corrected the path to `/auth/preview-demo/start`.
2. One matched pair was allowed to perform diagnostic state reads before ready. Hosted reads consumed the 20-second ready window; the server correctly voided the match and rejected late ready requests with `409`.
3. One matched pair attempted both ready acknowledgements concurrently. One client request did not return within 120 seconds, so the parser stopped and that run was not used as acceptance evidence. Health/readiness remained healthy immediately afterward. The exact final sequential-ready path then passed.

These preparatory runs created preview-only session/ticket/match artifacts. They did not change provider configuration or unrelated hosted data.

The concurrent-ready transport timeout is a real reliability warning because two human clients may acknowledge readiness near-simultaneously. Ticket 164 should independently retest simultaneous ready behavior. The final hosted path proves the feature works, but release confidence should remain conditional on Jasmine reproducing or clearing this warning.

Hosted latency was material:

```text
join response up to 16.915s
ready responses 7.885s + 6.559s sequentially
reconnect state up to 8.648s
forfeit 14.491s
```

The successful ready path had limited margin inside the 20-second ready window. This warrants follow-up latency/ready-budget investigation even though the final controlled smoke passed.

## Files and repository safety

Created locally:

- `agent-communication/responses/ticket-163-yuna-hosted-wave-t-speed-deploy-smoke-response.md`

An existing concurrent modification to `agent-communication/index.md` was already present before this ticket and was not modified, staged, or overwritten by Yuna.

No commit or direct push to `main` was performed.

## Provider and data safety

- No manual deployment was triggered.
- No Railway, Vercel, Supabase, environment-variable, secret, or paid-resource change was made.
- No dictionary bootstrap or local seed was run against hosted infrastructure.
- No migration command was manually rerun.
- All hosted changes observed came from the already-approved merged release and automatic provider integrations.
- Smoke mutations were limited to preview-demo sessions, Speed tickets/matches/readiness/forfeit, and the resulting authoritative Speed ratings/history.

## Rollback

If Wave T must be rolled back:

1. create a reviewed revert PR for merge commit `07aa546b157199a192cc8d156b52a26a4eeb8118`;
2. require green current-main CI;
3. verify both Vercel and Railway deployment statuses for the revert SHA;
4. verify `/healthz`, `/readyz`, Standard mode/catalog/queue, and Speed fail-closed behavior;
5. do not destructively remove the additive Speed schema without a separate data-owner rollback plan.

## Follow-up tickets

### Follow-up 1

- Target agent: Jasmine
- Why needed: independent final hosted release confidence and adversarial concurrent-ready coverage.
- Exact task: Execute Ticket 164, including two-client simultaneous ready acknowledgements under hosted latency; distinguish transport timeout, server response, ready-window expiry, and final persisted match state. Recheck countdown/reconnect/result/rating/history/leaderboard and spoiler safety.
- Inputs/context: merge SHA `07aa546b157199a192cc8d156b52a26a4eeb8118`, this response, final PASS match `f7dad3b7-9ca6-4ee1-9825-b2f755b1198d`, and the disclosed concurrent-ready timeout.
- Expected output back to Athena: hosted PASS/WARN/FAIL with a release recommendation and a clear decision on whether the concurrent-ready warning is a release blocker.

### Follow-up 2

- Target agent: Athena
- Why needed: release-state and blocker classification ownership.
- Exact task: Mark Ticket 163 PASS with the concurrent-ready/latency warning, unblock Ticket 164, and keep Wave T final release confidence conditional on Jasmine's hosted recheck.
- Inputs/context: exact-SHA provider evidence, successful final Speed lifecycle, rating/read convergence, and preparatory failure disclosure.
- Expected output back to Athena: updated Wave T status and decision whether a dedicated ready-window/hosted-latency remediation ticket is required.

### Follow-up 3

- Target agent: Freya
- Why needed: backend ownership if Jasmine reproduces the timeout or the margin is deemed unsafe.
- Exact task: Diagnose hosted concurrent `markReady` serialization and ready-window accounting. Preserve server-authoritative timing and fail-closed behavior; do not simply widen the contract without Elisa/Athena approval.
- Inputs/context: one concurrent-ready client exceeded 120 seconds; final sequential ready calls took 7.885s and 6.559s; ready window is 20 seconds.
- Expected output back to Athena: root cause, minimal fix proposal, deterministic PostgreSQL regression, and whether contract/timing changes are necessary.
