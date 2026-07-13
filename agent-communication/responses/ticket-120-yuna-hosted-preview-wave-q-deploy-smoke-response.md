# Ticket 120 — Hosted Preview Wave Q Deploy and Smoke Response

Task: Hosted Preview Wave Q Deploy and Smoke
Agent: Yuna (operations)
Status: Completed — hosted Wave Q smoke passed; no manual provider mutation performed from this shell

## What I understood

Ticket 120 asks Yuna to verify the hosted preview after Wave Q PR/merge, confirm migrations/readiness, verify the new Wave P/Q backend surfaces and UI fixes are live, record non-secret hosted evidence, and include rollback instructions.

Important scope boundaries:

- Do not expose provider secrets, database URLs, tokens, or env values.
- Do not create paid resources or provider changes without explicit approval.
- Do not merge anything from this ticket.
- Record only non-secret deployment/smoke evidence.

## Source / merge state

Local repo state before hosted smoke:

```text
branch: main
HEAD: b4135e1 Wave Q checkpoint: chess ranked readiness (#5)
origin/main: b4135e1 Wave Q checkpoint: chess ranked readiness (#5)
```

GitHub Actions read-back for `main`:

```text
check: Workspace checks completed success
run: b4135e132fbca88af2288000eb74013c2db9b4f0 PR Checks completed success
run URL: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29077171631
job URL: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/29077171631/job/86311302016
```

## Hosted URLs verified

```text
WEB=https://wordle-royale-web.vercel.app
API=https://wordle-royaleapi-production.up.railway.app
```

These are public preview URLs only. No provider dashboard secret URLs or env values are included.

## Hosted smoke results

Commands used the public hosted URLs and a temporary local cookie jar only.

```text
web_root=200 73410
web_play=200 114342
web_profile=200 90583
api_healthz=200 204
api_readyz=200 604
api_lobbies=200 118
api_leaderboard=200 225
api_ranked_modes=200 1081
preview_demo_start=201 454
auth_me=200 325
```

Structured response checks:

```text
healthz_status=ok
readyz_status=ok
readyz_dependencies.database.status=ok
readyz_dependencies.applicationSchema.status=ok
readyz_dependencies.applicationSchema.message=Application schema contains 17 required table(s).
readyz_dependencies.redis.status=not_checked_stub
```

`/ranked/modes` is now live on the hosted API:

```text
api /ranked/modes: HTTP 200
modes include Standard, Speed / Blitz, Classic, Multiplayer / Lobby
standard_1v1 enabled=true
multiplayer_lobby enabled=false
```

Preview demo session smoke:

```text
POST /auth/preview-demo/start: HTTP 201
GET /auth/me with preview cookie: HTTP 200
returned active preview demo user/profile envelope
```

## Web UI smoke evidence

Hosted web pages returned HTTP 200:

```text
/: 200
/play: 200
/profile: 200
```

Profile page content checks against the hosted HTML:

```text
web_profile_contains_Prepared=True
web_profile_contains_Not live yet=True
web_profile_contains_1475=False
web_profile_contains_1450=False
web_profile_contains_1425=False
```

This confirms the Ticket 116 profile mode-card accuracy fix is reflected in hosted web output at the static HTML level: prepared/non-live mode cards no longer expose the old hard-coded rating-looking values.

## Migration/readiness evidence

I did not access Railway or Supabase provider logs from this shell. Non-secret runtime evidence from the hosted API shows the Wave Q schema/readiness hardening is live and the preview DB has the required application schema:

```text
/readyz: status=ok
applicationSchema.status=ok
applicationSchema.message=Application schema contains 17 required table(s).
```

The hosted `/ranked/modes` route also returned HTTP 200, closing Jasmine's earlier observation that hosted Wave O API returned 404 for that route.

Ticket 118 noted Ashar manually configured Railway pre-deploy as:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

I could not independently inspect Railway deploy logs from this runtime, so provider-log migration execution remains a dashboard-side evidence item if Athena wants that exact log artifact.

## Commands run

```bash
git status --short --branch
git log --oneline -8 --decorate
git remote -v
# GitHub unauthenticated API check-runs/actions read-back for main
# Hosted smoke curl suite against public WEB/API URLs
# JSON response inspection for healthz/readyz/ranked-modes/auth-me
# Static hosted web profile HTML content checks
```

## Files changed

- `agent-communication/responses/ticket-120-yuna-hosted-preview-wave-q-deploy-smoke-response.md`

## What I did not do

- Did not merge; Wave Q was already merged to `main` before this ticket run.
- Did not push directly to `main`.
- Did not manually trigger or alter Railway/Vercel/Supabase deployments.
- Did not create or modify provider resources.
- Did not run a direct Supabase migration command from this shell.
- Did not print or store provider secrets, database URLs, tokens, passwords, or connection strings.
- Did not create or commit real `.env` files.

## Rollback instructions

If hosted Wave Q starts failing after this smoke:

1. Stop new preview promotion or QA sign-off.
2. Confirm whether the failing surface is web, API, DB/schema, or auth cookie/CORS.
3. For web-only regression:
   - Roll back the Vercel preview/project deployment to the last known good deployment from before `b4135e1`.
4. For API regression:
   - Roll back Railway API service to the last known good deployment.
   - Keep the pre-deploy migration command configured unless it is the suspected cause.
5. For migration/schema regression:
   - Do **not** destructively roll back Supabase schema without explicit Ashar approval.
   - Capture non-secret migration failure evidence and route to Freya/Yuna.
6. Re-run the Ticket 120 hosted smoke checklist after rollback.

## Blockers / risks

- Provider dashboard/log evidence for the Railway pre-deploy migration execution was not accessible from this shell.
- Runtime `/readyz` application-schema evidence and `/ranked/modes=200` strongly indicate the migrated Wave Q API is live, but exact provider deploy-log evidence would require Railway dashboard/API access.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Jasmine
- Why that agent is needed: Jasmine owns independent release confidence.
- Exact task: Independently verify hosted Wave Q preview using Ticket 120 smoke evidence plus browser checks.
- Inputs/context they need: `WEB=https://wordle-royale-web.vercel.app`, `API=https://wordle-royaleapi-production.up.railway.app`, this response, Ticket 116/117/118 responses.
- Expected output back to Athena: PASS/WARN/FAIL with browser console evidence, API endpoint evidence, and any release-blocking issues.

### Follow-up ticket 2

- Target agent: Yuna or Ashar with Railway dashboard access
- Why that agent is needed: Exact pre-deploy migration log evidence requires provider dashboard/API access not available in this shell.
- Exact task: Capture non-secret Railway deploy log evidence showing `pnpm --filter @wordle-royale/api db:migrate:deploy` ran successfully or had no pending migrations.
- Inputs/context they need: Railway API service dashboard access and Ticket 118 response.
- Expected output back to Athena: non-secret deploy ID/timestamp and migration command result.
