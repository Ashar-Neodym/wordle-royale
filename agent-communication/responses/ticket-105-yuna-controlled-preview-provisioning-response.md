# Ticket 105 — Controlled Preview Provisioning Response

Task: Controlled Preview Provisioning
Agent: Yuna (operations)
Status: Blocked after approval — local preflight passed, but provider provisioning cannot be performed from this shell because provider CLIs/auth tokens are unavailable

## What I understood

Ashar approved Ticket 105 provisioning within these constraints:

- Web: Vercel web.
- Database: Supabase Postgres.
- API: selected free/cheap long-running API host.
- Redis: none; use `REDIS_REQUIRED=false` and no `REDIS_URL`.
- Free/cheap settings only.
- No paid plans, payment-method-required plans, custom domains, or paid add-ons without stopping and asking again.
- Store secrets only in provider env/secret stores.
- Do not merge unrelated changes.

I treated this as approval to create provider resources and provider-stored preview secrets, but not approval to add paid resources or expose secrets.

## What I did

1. Read Ticket 105.
2. Re-read Ticket 103/104 provider decision and preflight artifacts.
3. Verified the locked Wave O direction:
   - Vercel web.
   - Supabase Postgres first.
   - Separate long-running Node/Nest API service.
   - No Redis initially.
   - Root API origin values, no `/api/v1` suffix.
4. Checked local provider access/tooling.
5. Ran the full local pre-provisioning gate chain.
6. Stopped before provider resource creation because this shell has no usable provider CLI/auth context.

## Files changed

- `agent-communication/responses/ticket-105-yuna-controlled-preview-provisioning-response.md`

No provider config files, real `.env` files, source code, package files, or deployment manifests were created or changed by Ticket 105.

## Provisioning result

Provisioning did **not** occur.

Blocker:

```text
vercel CLI: absent
supabase CLI: absent
render CLI: absent
railway CLI: absent
flyctl CLI: absent
gh auth: not logged in
VERCEL token length: 0
SUPABASE token length: 0
RENDER token length: 0
RAILWAY token length: 0
FLY token length: 0
GH/GITHUB token length: 0
```

Because no provider-authenticated tooling is available in this environment, I could not safely create:

- Vercel project `wordle-royale-preview-web`;
- Supabase preview Postgres project/database;
- Render/Railway/Fly/equivalent long-running API service;
- provider env vars/secrets;
- provider-hosted deployment URLs.

I did not try to work around this by asking for secrets in chat or writing local env files.

## Selected API host posture

For the first provisioning attempt, I would use a Render-style long-running Node Web Service if Ashar's account/free-tier access allows it, because it matches the current Nest API shape:

```bash
pnpm install --frozen-lockfile
pnpm --filter @wordle-royale/api db:generate
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api start
```

Health checks:

```text
/healthz
/readyz
```

If Render requires a paid plan/payment method or cannot run the service acceptably on free/cheap settings, stop and ask Ashar before selecting Railway/Fly or another host.

## Local gates run

Command chain:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
git diff --check
CI=true pnpm deps:down
git status --ignored --short -- .env .env.local apps/api/dist apps/web/.next apps/web/tsconfig.tsbuildinfo apps/mobile/.expo dist build .turbo coverage
git status --short --branch
```

Results:

- `CI=true pnpm install --frozen-lockfile` → 0
- `CI=true pnpm lint` → 0
- `CI=true pnpm typecheck` → 0
- `CI=true pnpm test` → 0
- `CI=true pnpm --filter @wordle-royale/api test` → 0
- `CI=true pnpm build` → 0
- `CI=true pnpm smoke:api:prod-start` → 0
- `CI=true pnpm smoke:local` → 0
- `CI=true pnpm deps:check` → 0
- `CI=true pnpm secret-scan` → 0
- `git diff --check` → 0
- `CI=true pnpm deps:down` → 0

## Verification evidence

API tests:

```text
44 pass, 0 fail
```

Build evidence:

```text
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
```

API production-start smoke:

```text
PASS readyz — local API returned status=ok
PASS api prod-start smoke — service=wordle-royale-api, env=production
```

Local smoke:

```text
Local smoke passed.
```

Secret scan:

```text
Secret scan passed (190 source/config files scanned).
```

Generated/env artifact check:

```text
!! apps/api/dist/
!! apps/mobile/.expo/
!! apps/web/.next/
!! apps/web/tsconfig.tsbuildinfo
```

These are ignored generated artifacts from build/smoke. They were not staged as part of Ticket 105.

Real env file check:

```text
.env: not present
.env.local: not present
```

## Safety / approval boundaries observed

Completed safely:

- Received explicit Ashar approval for free-tier provisioning attempt.
- Ran local pre-provisioning gates.
- Confirmed no real `.env` files were created.
- Confirmed generated artifacts remain ignored/not staged.
- Confirmed no Redis resource should be created.

Not performed due missing provider auth/tooling:

- No Vercel project created.
- No Supabase project/database created.
- No API host service created.
- No provider env/secrets configured.
- No Prisma migration run against hosted DB.
- No hosted deploy performed.
- No hosted URLs produced.
- No paid resources added.
- No secrets printed, stored in repo, or requested in chat.

## Blocker / required human action

To proceed with real provisioning, one of these is needed:

1. Run provider setup from an authenticated shell that has access to Ashar's Vercel/Supabase/API-host accounts; or
2. Install/login provider CLIs in this environment through safe device/browser login flows; or
3. Provide provider-scoped automation tokens through the runtime secret mechanism, not chat, for:
   - Vercel project creation/deploy;
   - Supabase project/database management;
   - chosen API host project/service creation;
   - GitHub repo linkage if provider cannot use existing GitHub integration.

Do **not** paste tokens, database URLs, passwords, or generated secrets into Discord/chat.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Ashar/Yuna
- Why that agent is needed: Real provisioning requires authenticated provider access that is not available in this shell.
- Exact task: Provide an authenticated provider session or runtime-managed provider tokens for Vercel, Supabase, and the selected long-running API host; do not paste secrets in chat.
- Inputs/context they need: Ticket 103 provider decision, Ticket 104 preflight, this Ticket 105 response.
- Expected output back to Athena: confirmation that Yuna can access provider CLIs/APIs without exposing secrets.

### Follow-up ticket 2

- Target agent: Yuna / Ticket 105 continuation
- Why that agent is needed: Yuna owns controlled preview provisioning.
- Exact task: After provider auth is available, create Vercel web, Supabase preview Postgres, one free/cheap long-running API service, provider env/secrets, and capture non-secret resource names/URLs/rollback handles.
- Inputs/context they need: Authenticated provider access, approved no-Redis policy, root API-origin env values, `main` branch SHA.
- Expected output back to Athena: non-secret resource evidence, hosted API/web URLs, migration result, health checks, and rollback/delete notes.

### Follow-up ticket 3

- Target agent: Freya / Ticket 106
- Why that agent is needed: Freya owns hosted API deploy smoke once Yuna provides API URL.
- Exact task: After Ticket 105 succeeds, verify hosted API readiness, demo-session behavior, DB connectivity, migration state, CORS/cookies, and Redis omitted readiness.
- Inputs/context they need: hosted API URL, non-secret API env summary, Supabase project metadata without secrets.
- Expected output back to Athena: hosted API pass/fail evidence and blockers.

### Follow-up ticket 4

- Target agent: Luna / Ticket 107
- Why that agent is needed: Luna owns hosted web preview smoke once Yuna provides web/API URLs.
- Exact task: After Ticket 105/106 succeed, verify web preview behavior against hosted API and confirm preview copy/caveats remain accurate.
- Inputs/context they need: hosted web URL, hosted API URL, preview copy expectations.
- Expected output back to Athena: web smoke evidence and UI/copy blockers.
