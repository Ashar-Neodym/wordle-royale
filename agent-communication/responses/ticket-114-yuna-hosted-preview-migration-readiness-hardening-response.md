# Ticket 114 — Hosted Preview Migration/Readiness Hardening Response

Task: Hosted Preview Migration/Readiness Hardening
Agent: Yuna (operations)
Status: Completed — runbook/recommendation created; no provider changes or secrets touched

## What I understood

Wave O hosted preview initially passed `/readyz`, but live preview actions failed until the Supabase schema migration was manually applied. Ticket 114 asks Yuna to prevent this failure mode from recurring by documenting/configuring the Railway migration process, updating hosted preview smoke expectations, and proposing readiness hardening.

Scope constraints:

- Do not expose or commit secrets.
- Do not make provider changes requiring paid resources.
- Do not broad-edit backend readiness code in this ticket; create a follow-up implementation ticket if code changes are needed.

## What I did

- Read Ticket 114.
- Read Jasmine/Athena Wave O hosted preview evidence.
- Confirmed the incident pattern:
  - `/readyz=ok,database=ok` was insufficient.
  - schema-backed endpoints failed until `pnpm --filter @wordle-royale/api db:migrate:deploy` ran against Supabase preview DB.
- Inspected current API readiness code and package scripts.
- Verified Railway's public pre-deploy command docs page is reachable.
- Created a durable migration/readiness hardening runbook.

## Files changed

- `docs/2026-07-09-hosted-preview-migration-readiness-hardening.md`
- `agent-communication/responses/ticket-114-yuna-hosted-preview-migration-readiness-hardening-response.md`

## Recommendation summary

### Railway migration policy

Preferred policy for controlled preview API deploys:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Configure this as the Railway API service **pre-deploy command** when provider access is available.

Keep API start command separate:

```bash
pnpm --filter @wordle-royale/api start
```

Do not append migrations to the API start command unless Railway pre-deploy and manual one-off jobs are both unavailable and Athena/Ashar explicitly accept the restart/scale risk.

### Manual fallback

If Railway pre-deploy command cannot be configured, every hosted API deploy is blocked until a manual Railway one-off migration run has non-secret evidence:

```text
command: pnpm --filter @wordle-royale/api db:migrate:deploy
result: <applied migration names or "No pending migrations">
target: preview Supabase project/database name only, no secret URL
time: <UTC timestamp>
```

### Hosted preview smoke checklist update

The new checklist requires migration status before treating hosted preview as healthy:

1. Migration status evidence from Railway/Supabase logs or one-off command output.
2. `/healthz` and `/readyz`.
3. Schema-backed route smoke:
   - `GET /lobbies`
   - `GET /leaderboard`
4. Preview demo session smoke:
   - `POST /auth/preview-demo/start`
   - `GET /auth/me` with cookie jar.
5. Web smoke:
   - hosted web root and browser demo-start flow for release checkpoints.

### Readiness hardening proposal

Create a Freya backend follow-up to add an app-schema readiness dependency to `/readyz`.

Desired behavior:

- `/readyz` returns `unavailable` when the DB is reachable but required app tables are missing.
- `/readyz` returns `ok` after migrations are applied.
- Redis remains optional when `REDIS_REQUIRED=false`.
- Tests cover DB-connected/schema-missing behavior.

## Tests / commands run

- Checked Railway public pre-deploy command docs page:
  - HTTP status: `200`
  - page contained `Pre-deploy`, `pre-deploy`, and `command` text.
- `git diff --check -- docs/2026-07-09-hosted-preview-migration-readiness-hardening.md agent-communication/responses/ticket-114-yuna-hosted-preview-migration-readiness-hardening-response.md`
- `CI=true pnpm secret-scan`
- Custom credential-pattern check over the new Ticket 114 docs.
- Real env file presence check.

## Evidence / result

Acceptance criteria:

- Clear runbook or provider config recommendation exists: PASS.
- Hosted preview smoke checklist includes migration status: PASS.
- Code changes needed for readiness hardening are proposed as a follow-up implementation ticket rather than broad-edited here: PASS.
- No provider changes requiring paid resources: PASS.
- No secrets exposed or committed: PASS.

Verification evidence:

```text
Railway docs check: status 200; Pre-deploy/pre-deploy/command text present
Secret scan passed: 190 source/config files scanned
Ticket 114 credential-pattern hits: 0 after response rewrite
Real .env/.env.local files present: none
```

## Blockers or risks

- I did not configure Railway directly because Ticket 114 requested documentation/recommendation and provider changes can affect live deploy behavior.
- Until Railway pre-deploy is configured, future preview deploys still depend on manual migration discipline.
- `/readyz` still needs backend implementation work to detect schema/table availability; this is intentionally delegated to Freya.
- Even after `/readyz` is hardened, hosted smoke should still include schema-backed endpoints and demo-session checks.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Yuna
- Why that agent is needed: Yuna owns Railway/provider runtime settings.
- Exact task: With Ashar approval for live provider setting changes, configure the Railway API service pre-deploy command to `pnpm --filter @wordle-royale/api db:migrate:deploy`, keep the start command as `pnpm --filter @wordle-royale/api start`, then record non-secret evidence and rollback instructions.
- Inputs/context they need: `docs/2026-07-09-hosted-preview-migration-readiness-hardening.md`, Railway API service access, current preview Supabase target confirmation.
- Expected output back to Athena: confirmation of pre-deploy command setting, evidence screenshot/text without secrets, and one post-deploy smoke result.

### Follow-up ticket 2

- Target agent: Freya
- Why that agent is needed: Freya owns backend readiness implementation and tests.
- Exact task: Add app-schema readiness dependency to `/readyz` so DB reachable + missing required tables returns `unavailable` with a migration-needed message; preserve optional Redis behavior.
- Inputs/context they need: `apps/api/src/health/readiness.service.ts`, `apps/api/src/prisma/prisma.service.ts`, current Prisma schema, Ticket 114 runbook.
- Expected output back to Athena: source/test changes, passing API tests, readiness evidence for schema-ready and schema-missing cases.

### Follow-up ticket 3

- Target agent: Jasmine
- Why that agent is needed: Jasmine owns independent hosted-preview verification.
- Exact task: After Yuna configures Railway pre-deploy and/or Freya hardens readiness, re-run hosted preview QA using the migration-aware smoke checklist.
- Inputs/context they need: API URL, web URL, migration evidence, readiness-hardening response if implemented.
- Expected output back to Athena: pass/warn/fail evidence that hosted preview no longer falsely passes readiness when migrations are missing.
