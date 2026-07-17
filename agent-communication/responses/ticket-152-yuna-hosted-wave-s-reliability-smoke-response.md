# Ticket 152 — Hosted Wave S Reliability Smoke Response

Task: Hosted Wave S Reliability Smoke
Agent: Yuna (devops verification)
Status: **PASS with operational warning** — merged Wave S Vercel production revision, hosted read reliability, retry UX, metadata/favicon, queue idempotency, and single gameplay mutation all verified; Railway does not expose revision metadata from this shell

## Approval and release prerequisites

PR #9 was already merged before this ticket was executed:

```text
PR = https://github.com/Ashar-Neodym/wordle-royale/pull/9
merge commit = 8e77aa2d1e2d82d1bd9d22cd0c94ca0572b38f0c
merged at = 2026-07-15T10:49:51Z
main CI = completed / success
main CI run = https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29409486413
```

No merge or deployment was initiated by Yuna during Ticket 152.

## Deployment revision evidence

GitHub's deployment API records a successful Vercel **Production** deployment for the exact Wave S merge SHA:

```text
deployment id = 5455757994
environment = Production
sha/ref = 8e77aa2d1e2d82d1bd9d22cd0c94ca0572b38f0c
state = success
created = 2026-07-15T10:50:36Z
target = https://wordle-royale-g4cft8yjx-ashar-neodyms-projects.vercel.app
```

Canonical production URLs checked:

```text
web = https://wordle-royale-web.vercel.app
api = https://wordle-royaleapi-production.up.railway.app
```

Railway CLI/token access is unavailable in this shell, and the public API does not expose a build SHA. Wave S contains web-only reliability/presentation changes and no API implementation changes. Railway revision identity therefore cannot be directly read back, but the existing Railway service passed all runtime health, readiness, schema, dictionary, leaderboard, ranked-mode, session, matchmaking, and gameplay checks below.

## Health/readiness

```text
GET /healthz = 200
GET /readyz = 200
overall status = ok

database = ok
applicationSchema = ok
application schema = 18 required tables
standardDictionary = ok
standard dictionary version = en-5-test-vfixture.001
standard dictionary answer count = 20
redis = not_checked_stub
```

The dictionary information above came from readiness metadata only. No dictionary answer was requested, printed, or recorded.

## Hosted delayed/cold read exercise

Three cache-busted requests were sent to each route. All completed successfully without an exhausted read:

```text
API /healthz:            0.820s, 0.833s, 0.921s
API /readyz:             3.008s, 1.867s, 1.268s
API /leaderboard:        1.861s, 1.415s, 1.320s
API /ranked/modes:       0.726s, 1.183s, 0.765s

Web /:                   4.148s, 2.180s, 1.804s
Web /profile:            1.503s, 2.937s, 1.353s
Web /leaderboard:        1.212s, 1.945s, 1.356s
Web /play:               2.685s, 1.529s, 1.372s
Web /server:             1.429s, 1.299s, 1.183s
```

The coldest observed web request took 4.148 seconds and still recovered within the five-second attempt budget.

Two authenticated preview sessions also read the current profile, leaderboard, and ranked modes twice each. Every request returned 200. Observed current-profile reads were 1.657–2.234 seconds; leaderboard reads were 1.331–1.535 seconds; ranked-mode reads were 0.690–0.921 seconds.

No provider failure was injected because provider-setting mutation is outside Ticket 152. The required clear fallback/retry behavior was verified through the naturally unavailable signed-out current-profile read.

## Retry UX and fresh server render

Production browser verification on `/profile` observed:

```text
heading = Preview profile
unavailable state = Profile unavailable
error = not_authenticated: Sign in is required for this action.
retry control = native button `Retry profile`
unrelated Alice/fixture identity used as current user = false
```

Activating the hydrated retry button performed a fresh server render. Evidence:

```text
leaderboard generated timestamp before retry = 2026-07-15T10:58:44.414Z
leaderboard generated timestamp after retry  = 2026-07-15T10:59:33.147Z
```

The retry preserved the same `/profile` URL. The fallback remained truthful because the browser was intentionally signed out.

## `/play` and leaderboard behavior

Production `/play` returned 200 and rendered:

```text
Standard = Live queue
Find match = available
Speed / Blitz = Not live yet
Classic = Not live yet
Multiplayer = Not live yet
Server online = ok
database/applicationSchema/standardDictionary = ok
```

Production `/leaderboard` returned 200 with live server rows and current generated metadata. Browser resource inspection found no failed long-running Next/favicon resource, and the favicon link was:

```text
type = image/x-icon
sizes = 32x32
```

## Queue and gameplay mutation safety

A final authoritative smoke used two distinct preview-demo sessions with separate in-memory cookie jars. Cookie values were not printed or stored.

Final queue evidence:

```text
Session A ticket = d8e087d5-0bd2-488d-85f6-c71ba5670a40
Session B ticket = b4bc1a7e-af03-496d-94bd-5ba83148efd0
shared match = 719614a7-77fb-470a-a12d-6d3cec03de9c
users distinct = true
participants = 2
```

Repeating Session A's exact queue request with the same `clientRequestId` returned HTTP 200 and the same ticket ID. It did not create a second ticket or match.

Gameplay mutation evidence:

```text
match state before = in_progress
my guess count before = 0
explicit guess POST count sent by smoke = 1
response = 201 accepted=true valid=true guessNumber=1
my guess count after = 1
exactly one increment = true
```

The guessed word and feedback are intentionally omitted from this handoff. No mutation was automatically duplicated or retried.

## Metadata and favicon

```text
GET /favicon.ico = 200
content type = image/vnd.microsoft.icon
size = 4,286 bytes
format = Windows icon, one 32x32 32-bit image
SHA-256 = 4230d36a3df7c4d844fafac9e4d77a3532fd947bcd4976ee1627caee57e9c401

title = Wordle Royale
description = Rated, server-authoritative word games with live Standard matchmaking.
theme color = #769656
color scheme = dark
favicon links in head = 1
head metadata answer/hash/salt/database/localhost pattern hits = 0
```

Two non-sensitive `answerWord` strings occurred in serialized page/application content outside `<head>`; metadata contained zero such strings and no salt, database URL, PostgreSQL URL, or localhost reference.

## Browser console/network

Production browser checks covered `/profile`, `/play`, and `/leaderboard`:

```text
console messages = 0
JavaScript errors = 0
failed long-running Next/favicon resources = 0
```

## Probe troubleshooting and data boundary

Two preparatory automation probes completed some valid preview requests before their local output parsers exited:

1. the first assumed `error` was always an object;
2. the second inspected the obsolete `validGuessCount` field instead of `myState.guesses`.

No server defect was involved. The final probe used the committed contracts (`ticketId` and `myState.guesses`) and passed. Preparatory requests may have created additional disposable preview demo sessions, queue tickets, matches, and one accepted guess. These are expected preview smoke data; no production account, secret, provider configuration, dictionary content, or rating settlement was modified deliberately.

## Safety

- Did not merge or push to `main`.
- Did not trigger a deployment.
- Did not rerun dictionary bootstrap or `db:seed:local`.
- Did not change Railway, Vercel, Supabase, provider settings, environment variables, or secrets.
- Did not expose cookies, tokens, credentials, connection strings, or dictionary answers.
- Did not create paid resources.
- Did not force match completion or rating settlement.

## Acceptance result

| Check | Result |
|---|---:|
| Approved Wave S merge and green main CI | PASS |
| Vercel production serves exact merge SHA | PASS |
| Railway exact revision metadata | WARN — unavailable from shell/public API |
| Railway API runtime health/readiness | PASS |
| Standard dictionary/queue live | PASS |
| Cold/delayed hosted reads within budget | PASS |
| Clear retry control performs fresh render | PASS |
| Profile/leaderboard/play truthful state | PASS |
| Queue duplicate/idempotency safety | PASS |
| Single gameplay mutation, one persisted attempt | PASS |
| Favicon and metadata | PASS |
| Browser console/network | PASS |

## Rollback

If Wave S requires rollback, use a reviewed revert PR against merge commit `8e77aa2d1e2d82d1bd9d22cd0c94ca0572b38f0c`, require green main CI, and verify the resulting Vercel production deployment. Do not destructively roll back the additive database schema or remove the approved preview dictionary release for this web-only change.

## Follow-up tickets

### Follow-up 1

- Target agent: Jasmine
- Why needed: Ticket 153 requires independent hosted release verification.
- Exact task: Independently verify the deployed Wave S profile/leaderboard/play retry behavior, metadata/favicon, console/network state, and mutation safety without changing providers or dictionary data.
- Inputs/context: this Ticket 152 response, merge SHA `8e77aa2d1e2d82d1bd9d22cd0c94ca0572b38f0c`, hosted web/API URLs, shared-match evidence.
- Expected output back to Athena: Ticket 153 hosted PASS/WARN/FAIL and final release recommendation.

### Follow-up 2

- Target agent: Athena
- Why needed: release-state ownership and interpretation of the provider revision warning.
- Exact task: Mark Ticket 152 PASS with the Railway revision-metadata warning, unblock Ticket 153, and decide whether direct Railway deployment-SHA observability is required as a later operational improvement.
- Inputs/context: Vercel exact-SHA deployment evidence, green main CI, Railway runtime PASS, and provider-tooling limitation documented above.
- Expected output back to Athena: updated Wave S master status and final QA sequencing.
