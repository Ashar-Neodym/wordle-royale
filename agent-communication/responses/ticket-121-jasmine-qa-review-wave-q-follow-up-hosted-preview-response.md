# Ticket 121 — QA Review Wave Q Follow-Up and Hosted Preview — Response

Task: Ticket 121 — QA Review Wave Q Follow-Up and Hosted Preview
Agent: Jasmine (QA)
Verdict: PASS with WARNINGS

## Summary

Wave Q passes QA for the requested follow-up and hosted preview scope. I independently verified the local gate chain, the Ticket 116 profile mode-card fixes, the Ticket 117 schema-aware `/readyz` behavior, and the hosted preview surfaces listed in Ticket 121.

No merge/deploy blocker found. The main residual warning is operational evidence quality: runtime hosted evidence strongly indicates the migrated Wave Q API is live and schema-ready, but I still cannot independently inspect Railway provider logs proving the pre-deploy migration command executed. Yuna/Ashar should retain Ticket 120's dashboard-log follow-up if exact provider-side migration evidence is required.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Provides PASS/FAIL/WARN verdict | Pass | Verdict above: `PASS with WARNINGS`. |
| Separates merge/deploy blockers from polish warnings | Pass | See Findings and Required fixes / owner. |
| Includes hosted URL/API smoke evidence | Pass | Hosted web/API smoke results recorded below. |
| Confirms no secrets committed | Pass | `CI=true pnpm secret-scan` passed; git status shows no source changes beyond handoff response files and ignored local artifacts. I did not inspect or print ignored `.env.preview.local`. |
| Ticket 116 UI warnings resolved | Pass | Source and hosted HTML/browser evidence confirm no `1475`/`1450`/`1425` fake rating-looking prepared-mode values; Standard card uses backend rating counters in source. |
| Ticket 117 readiness hardening works and preserves Redis-optional behavior | Pass | API tests cover missing schema and Redis optional behavior; hosted `/readyz` includes `applicationSchema.status=ok` and `redis.status=not_checked_stub` with top-level `status=ok`. |
| Ticket 118/120 migration policy/deploy evidence sufficient | Warn | Runtime evidence is sufficient for hosted preview confidence (`applicationSchema=ok`, `/ranked/modes=200`), but exact Railway pre-deploy log evidence was not independently available from this shell. |
| Hosted preview updated surfaces | Pass | `/ranked/modes`, demo session, lobbies, leaderboard, profile, play all passed smoke. |

## Commands run + exit codes

### Repository/head state

```bash
git log --oneline -5 --decorate
git rev-parse HEAD
git rev-parse origin/main
```

Exit code: `0`

```text
b4135e1 (HEAD -> main, origin/main) Wave Q checkpoint: chess ranked readiness (#5)
HEAD = b4135e132fbca88af2288000eb74013c2db9b4f0
origin/main = b4135e132fbca88af2288000eb74013c2db9b4f0
```

### Required Ticket 121 gate chain

```bash
CI=true pnpm lint && \
CI=true pnpm typecheck && \
CI=true pnpm test && \
CI=true pnpm build && \
CI=true pnpm smoke:local && \
CI=true pnpm secret-scan && \
git diff --check
```

Exit code: `0`

Observed highlights:

```text
Workspace scaffold validation passed (9 workspace packages).
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (192 source/config files scanned).
```

### Targeted API/readiness/schema checks

```bash
CI=true pnpm --filter @wordle-royale/api test && \
CI=true pnpm --filter @wordle-royale/api db:validate
```

Exit code: `0`

Observed highlights:

```text
api tests: 49 pass, 0 fail
✔ reports unavailable readiness when the database is reachable but required app schema is missing
✔ keeps readiness ok when Redis is optional and not configured
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Git safety/status check

```bash
git status --short --ignored | head -120
```

Exit code: `0`

Relevant output:

```text
?? agent-communication/responses/ticket-120-yuna-hosted-preview-wave-q-deploy-smoke-response.md
!! .env.preview.local
!! apps/api/dist/
!! apps/api/node_modules/
!! apps/mobile/.expo/
!! apps/web/.next/
!! node_modules/
```

Notes:

- Product source is clean at `main == origin/main` for the Wave Q commit under review.
- The untracked Ticket 120 response is a handoff artifact in the manual agent workflow, not product source.
- `.env.preview.local` is ignored. I did not open it or expose contents.

## Hosted URL/API smoke evidence

Public preview URLs verified:

```text
WEB=https://wordle-royale-web.vercel.app
API=https://wordle-royaleapi-production.up.railway.app
```

Hosted smoke command used public URLs and a temporary local cookie jar only.

```text
web_root=200 73410
web_play=200 112050
web_profile=200 90583
web_lobbies=200 80389
web_leaderboard=200 72485
api_healthz=200 204
api_readyz=200 604
api_lobbies=200 118
api_leaderboard=200 225
api_ranked_modes=200 1081
preview_demo_start=201 454
auth_me=200 325
```

Structured hosted response checks:

```text
api_healthz error=None
api_readyz error=None
readyz_status=ok
readyz_dependencies.database.status=ok
readyz_dependencies.applicationSchema.status=ok
readyz_dependencies.applicationSchema.message=Application schema contains 17 required table(s).
readyz_dependencies.redis.status=not_checked_stub
api_lobbies error=None
api_leaderboard error=None
api_ranked_modes error=None
preview_demo_start error=None
auth_me error=None
```

Hosted `/ranked/modes` response summary:

```text
ranked_modes=[
  ('standard_1v1', True),
  ('speed_1v1', True),
  ('classic_1v1', True),
  ('multiplayer_lobby', False)
]
```

This closes my Ticket 115 warning where the hosted API still returned `404` for `/ranked/modes`.

Hosted profile HTML checks for Ticket 116 regression:

```text
profile_contains_Prepared=True
profile_contains_Not_live_yet=True
profile_contains_1475=False
profile_contains_1450=False
profile_contains_1425=False
profile_contains_No_live_rating_chart_yet=True
```

## Browser / visual evidence

### `/profile`

Browser URL:

```text
https://wordle-royale-web.vercel.app/profile
```

Observed:

- Page rendered public preview banner.
- Current-player profile is not silently impersonated; page shows `Profile requires a session` and explicit `Start preview demo` action.
- Profile summary shows `Profile unavailable` with `not_authenticated` detail rather than fake profile data.
- Mode ratings section shows:
  - Standard: `Awaiting profile`, `Not live yet`, em-dash W/L/D/A/games counters, `No live rating chart yet`.
  - Speed / Blitz, Classic, Multiplayer: `Prepared`, `Not live yet`, `Prepared UI only`, em-dash counters, `No live rating chart yet`.
- No fake prepared-mode values `1475`, `1450`, or `1425` appeared in the browser snapshot.

Browser console for `/profile`:

```text
console_messages=[]
js_errors=[]
```

### `/play`

Browser URL:

```text
https://wordle-royale-web.vercel.app/play
```

Observed:

- Ranked modes copy says only the lobby-backed Standard path is live and other mode cards are UI affordances/not finished matchmaking.
- Server status panel shows `database: ok · applicationSchema: ok · redis: not_checked_stub`.
- Lobbies panel renders live API route state and preview-demo gating before lobby writes.
- Create/join buttons are disabled until a preview demo session is started.

Browser console for `/play`:

```text
console_messages=[]
js_errors=[]
```

## Findings

### Blockers

None.

### Warnings

#### 1. Provider-side migration execution log remains dashboard-side evidence

Owner: Yuna / Ashar with Railway dashboard access

Runtime evidence is good:

- `/readyz` includes `applicationSchema.status=ok`.
- `/ranked/modes` is live with HTTP 200.
- Schema-backed endpoints `/lobbies` and `/leaderboard` return HTTP 200.
- Preview demo session start/auth roundtrip passes.

However, I cannot independently inspect Railway deploy logs or provider config from this shell. Ticket 120 already captured this same limitation and requested dashboard-side non-secret evidence if Athena wants exact pre-deploy migration execution proof.

This is not a deploy blocker for the current hosted preview because runtime behavior proves the application schema is present, but it remains an operations evidence gap.

#### 2. Untracked handoff response file exists locally

Owner: workflow hygiene / Yuna if needed

`git status --short --ignored` shows:

```text
?? agent-communication/responses/ticket-120-yuna-hosted-preview-wave-q-deploy-smoke-response.md
```

This appears to be the manual workflow handoff artifact read for Ticket 121. It is not product source and does not affect hosted preview behavior. If the workflow expects all responses checked in, include it with the next handoff commit; otherwise leave as manual-agent artifact.

## Regression / security / scope review notes

- `secret-scan` passed; no tracked secret evidence found by the project scanner.
- I did not inspect ignored `.env.preview.local`.
- Product source under review is at `b4135e1` on both local `main` and `origin/main`.
- Browser and curl smoke used only public preview URLs and temporary `/tmp` files/cookie jar.
- I did not mutate provider settings, create deployments, run Supabase migrations, or change product source.
- Ticket 116 source fix is present: `apps/web/src/components/ProfileHistory.tsx` uses `profile.rating.wins/losses/draws/abandons` and renders non-live modes with `null` rating/counters/graph plus placeholder labels.
- Ticket 117 source fix is present: `PrismaService.checkApplicationSchema()` checks 17 required tables; `ReadinessService` includes `applicationSchema` in readiness aggregation while preserving non-blocking `not_checked_stub` Redis behavior.

## Required fixes / owner

No required blocker fix before Wave Q preview sign-off.

Recommended follow-up only:

1. Yuna/Ashar: capture non-secret Railway deploy/pre-deploy migration log evidence if Athena wants exact provider-side proof beyond runtime `/readyz applicationSchema=ok` evidence.
2. Workflow hygiene: decide whether to commit/archive the untracked Ticket 120 response artifact with the next agent-communication checkpoint.

## Residual risks

- Readiness schema check verifies required table presence, not every column/index/constraint. This is appropriate for catching the prior missing-migration class, but it is not a full migration auditor.
- Mobile/Expo physical smoke is still outside this ticket's scope.
- Real paid/provider dashboard state was not inspected by Jasmine; verification used public hosted runtime behavior.

## Files changed

Created:

- `agent-communication/responses/ticket-121-jasmine-qa-review-wave-q-follow-up-hosted-preview-response.md`

No product source files were modified by Jasmine.
