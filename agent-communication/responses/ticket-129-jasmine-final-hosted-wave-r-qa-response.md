# Ticket 129 — Final Hosted Wave R QA Response

Task: Ticket 129 — Final Hosted Wave R QA
Agent: Jasmine (QA)
Verdict: **PASS**
Date: 2026-07-14

## Summary

The deployed Wave R `standard_1v1` flow satisfies the required hosted acceptance criteria. Independent QA used isolated preview-demo sessions against the public Railway API and Vercel web deployment, completed an ordinary user-facing two-player match, and verified queue lifecycle, authoritative pairing, terminal settlement, profile/history/leaderboard convergence, idempotent completion, non-live mode gating, and spoiler/secret controls.

No release blocker was reproduced. Two hosted-web polish/reliability warnings remain: first-load server-render reads intermittently exceeded the existing 1.2-second generic read timeout and briefly showed truthful unavailable/fallback states before retry/refresh recovered; the completed-match page also requested a missing favicon (404). Neither affected queue mutations, gameplay, settlement, or authoritative API state.

## Acceptance criteria checked

| # | Criterion | Result | Evidence |
|---|---|---:|---|
| 1 | Public web/API health and schema-aware readiness | PASS | `/healthz` and `/readyz` returned 200/`ok`; database, application schema, and Standard dictionary were `ok`. Redis was explicitly `not_checked_stub` and documented optional. Web `/`, `/play`, and `/profile` returned 200. |
| 2 | Two isolated demo users queue and pair exactly once | PASS | Two independently cookie-isolated users received distinct tickets and one shared hosted match. The authoritative match snapshot contained exactly the two expected, distinct user IDs; no self-pairing or extra participant was observed. |
| 3 | Cancel, refresh/reconnect, duplicate join, unsupported mode | PASS | Same request replay returned the same ticket; current-ticket recovery returned the same active ticket; cancellation was idempotent and current ticket became null. A `speed` join returned sanitized 400 `validation_failed`. Browser queue/cancel also reached “Looking for a Standard opponent” then “Search cancelled.” |
| 4 | Shared match ID and authoritative participant/game state | PASS | Both sessions' ticket-by-ID/current-ticket reads converged on the same match; both match snapshots had the same round and exactly two expected participants. |
| 5 | Rating/profile delta exactly once after terminal result | PASS | Both users submitted six ordinary guesses and reached terminal `failed` states. Completion returned 201 twice; the second response reused the same applied rating event. This draw produced `[0,0]` deltas; each profile advanced exactly once from 0 to 1 match and 10 to 9 provisional games, with one draw. Repeated completion did not change either profile again. |
| 6 | Profile and leaderboard reflect Standard truthfully | PASS | Current-profile summaries matched rating-event before/after values; both histories contained the match; both handles appeared on the live leaderboard. Hosted profile and leaderboard pages rendered live Standard data after recovery from the first-load timeout. |
| 7 | Speed/Classic/Multiplayer remain clearly non-live | PASS | `/ranked/modes` reported Standard enabled and all three other modes disabled. `/play` labeled each “Not live yet” and stated that they cannot start matchmaking. |
| 8 | Browser console/network behavior | PASS WITH WARNING | No console messages or JavaScript errors were recorded. Queue actions returned 200 from Vercel server actions. A missing `/favicon.ico` returned 404. Generic server-render API reads intermittently timed out at 1200ms, yielding clearly labeled temporary fallback/unavailable UI before retry/refresh recovered. |
| 9 | No secret/spoiler leakage | PASS | Queue, match state, guess, completion, result, unauthenticated, unsupported-mode, and disabled-dev-route responses were scanned for answer authority, ORM/SQL, credentials, connection strings, and sensitive implementation detail; none was found. Completed-result DOM and HTML scans were also clean. |
| 10 | Deployment/CI readiness | PASS | PR #8 was merged to `main` at `93311939e3d679a5c49bf047530a81265e3a5bdd`; workflow run `29324464243` completed successfully for that SHA. Local `HEAD` and `origin/main` independently resolved to the same SHA. |

## Commands run + exit codes

```text
Public health/readiness/core endpoint probe
exit 0
- healthz: 200 / ok
- readyz: 200 / ok
- lobbies: 200
- leaderboard: 200
- ranked/modes: 200
- web root/play/profile: 200

GitHub public API PR/workflow probe
exit 0
- PR #8: merged
- merge SHA: 93311939e3d679a5c49bf047530a81265e3a5bdd
- run 29324464243: completed / success on the merge SHA

python3 /tmp/ticket129_hosted_qa.py
exit 0
- isolated cancel session: duplicate/reconnect/cancel checks passed
- isolated pair sessions: exact two-user shared pairing passed
- ordinary gameplay: 6 guesses per user, both terminal
- completion: 201 then 201, stable event ID
- profiles/history/leaderboard: converged exactly once

Hosted unauthenticated/non-live/dev-route/security/CORS probe
exit 0
- unauthenticated current ticket: 401 not_authenticated
- unsupported queue mode: 400 validation_failed
- production dev helper: 403 dev_helper_disabled
- completed result: 200
- ranked modes: 200
- authorized-origin CORS preflight: 204 with expected origin/credentials/method headers
- sensitive-pattern scan: no matches

git rev-parse HEAD / origin/main
exit 0 — both 93311939e3d679a5c49bf047530a81265e3a5bdd

CI=true pnpm secret-scan
exit 0 — 220 source/config files scanned (standard exclusions include agent-communication)

Independent sensitive-pattern checks covered the hosted responses, completed-result DOM, and this QA response without recording credentials or session cookies.

git diff --check
exit 0
```

A first version of the compact security probe assumed every response had a JSON body and exited 1 while parsing the empty 204 OPTIONS response. The corrected probe handled empty bodies and exited 0. This was a QA probe defect, not an application failure.

## Browser/visual evidence

- Hosted `/play` rendered Standard as the only live queue and Speed, Classic, and Multiplayer as “Not live yet.”
- Browser preview session creation succeeded. Current-ticket recovery changed the temporary unavailable state to “Find a rated Standard match.”
- Browser queue join rendered “Looking for a Standard opponent” with elapsed time and an enabled Cancel action.
- Browser cancel rendered “Search cancelled” and “Search again.”
- Hosted profile rendered the preview identity, live Standard rating, 0/10 provisional progress for the browser-only session, and clearly labeled prepared-only non-Standard modes.
- Hosted leaderboard rendered live preview-demo rows.
- Hosted completed-match page rendered a legible dark-theme result: two tied placements, 1500 (+0) each, disabled rematch with honest reason, spoiler-safe share text, and history/leaderboard/profile actions. No overlap, clipping, broken card layout, answer, hash, salt, or sensitive data was visible.
- Browser console: 0 messages, 0 JavaScript errors.
- Browser resource inspection: only `/favicon.ico` returned 404; queue server-action fetches returned 200.

## Findings

### Release blockers

None.

### Warning 1 — generic 1.2-second server-read timeout is too aggressive for intermittent hosted latency

**Suggested owner: Luna (web), with Yuna validating hosted behavior**

Immediately after starting the browser demo session, `/play` briefly showed “Queue status is unavailable,” and its embedded leaderboard showed `API request timed out after 1200ms`. The first `/profile` navigation similarly rendered “Profile unavailable.” Queue-status retry and profile refresh recovered, and the dedicated leaderboard route rendered live data.

This is not a Ticket 129 release blocker because:

- the states were explicitly labeled unavailable/fallback rather than presenting fabricated live truth;
- the operation-specific Standard queue path subsequently recovered and completed join/cancel correctly;
- authoritative API and subsequent browser reads were correct;
- no mutation was duplicated or lost.

Follow-up: use a hosted-appropriate read timeout/retry policy for server-render profile/leaderboard/current-user reads, or avoid rendering fixture preview beside a live timeout without a prominent retry control.

### Warning 2 — missing favicon

**Suggested owner: Luna**

The completed-match browser resource list recorded `GET /favicon.ico` as 404. This is cosmetic only.

## Regression/security/scope review

- Duplicate queue submission was idempotent and did not create another ticket.
- Cancellation was idempotent and left no current active ticket.
- Reconnect/current-ticket state matched the original authoritative ticket.
- Pairing produced one match, two tickets, two exact expected users, and no self-pair.
- Terminal settlement was idempotent at both event and profile levels.
- A tie correctly yielded zero rating movement while still incrementing match/draw/provisional counters exactly once.
- Unauthenticated queue access failed closed with a sanitized 401.
- Production dev gameplay helper failed closed with a sanitized 403.
- Unsupported mode input failed closed with a sanitized 400.
- CORS accepted the deployed Vercel origin with credentials and expected methods.
- Public API/DOM checks found no answer authority, dictionary answer, hashes/salts, Prisma/PostgreSQL/SQL details, stack traces, credentials, cookies, tokens, or connection strings.
- No provider settings, environment variables, domains, deployment configuration, hosted schema, or direct database state were changed.
- The shared worktree's pre-existing modification to Ticket 128 was not touched or reverted.

## Required fixes / owner

None before Wave R release acceptance.

Recommended follow-ups:

1. **Luna:** increase or retry the generic hosted server-read timeout and add a user-visible retry for leaderboard/profile fallback states.
2. **Yuna:** verify the adjusted timeout on the hosted Vercel/Railway path if Luna changes it.
3. **Luna:** add a favicon asset or metadata route.

Rollback owner if the queue/rating defect later reproduces in production: **Yuna** for hosted rollback coordination, with **Freya** for backend matchmaking/settlement and **Luna** for web behavior.

## Residual risks

- This was a bounded hosted smoke, not load or soak testing. It proves one exact pair plus cancellation/reconnect cases, not behavior under sustained concurrency.
- Preview-demo users and the completed QA match remain normal hosted preview data and may reset under the documented preview policy; no direct hosted database deletion was authorized.
- Redis remains optional/unconfigured in hosted readiness (`not_checked_stub`); the verified Standard flow succeeded on its documented database-backed path.
- Provider cold starts/latency can still trigger the observed generic-read fallback even though operation-specific queue deadlines held.

## Cleanup

- Browser-created queued ticket was cancelled and verified visually as cancelled.
- The direct cancellation probe left no active ticket.
- The paired match was intentionally completed to terminal state; no queued QA user remains from that pair.
- Temporary local hosted-QA script was removed after evidence capture.
- No local QA server, container, or background process was started.
- No provider/deployment/database configuration mutation occurred.
