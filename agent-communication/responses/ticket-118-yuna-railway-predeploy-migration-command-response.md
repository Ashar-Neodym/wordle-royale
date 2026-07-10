# Ticket 118 — Railway Pre-Deploy Migration Command Response

Task: Railway Pre-Deploy Migration Command
Agent: Yuna (operations)
Status: Resolved manually by Ashar — Railway pre-deploy command configured in dashboard; execution evidence will be collected on the next API deployment

## Athena resolution note

Ashar confirmed the Railway API service pre-deploy command was configured as:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

The API start command remains separate. Ticket 120 must verify the command actually executes successfully during the next hosted deployment.

## What I understood

Ticket 118 asks Yuna to prevent future hosted preview API deploys from missing Prisma migrations by preparing and, only after explicit Ashar approval/provider access, configuring the Railway API service pre-deploy migration command.

Required command:

```bash
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Start command must remain separate:

```bash
pnpm --filter @wordle-royale/api start
```

Safety constraints:

- Do not print database URLs, passwords, tokens, or env values.
- Do not commit secrets or create real `.env` files.
- Do not make paid provider changes.
- Include rollback instructions.
- Include one post-change smoke checklist.

## What I did

- Read Ticket 118.
- Re-read Ticket 114 migration/readiness hardening runbook and response.
- Checked provider tooling/auth availability without printing secret values.
- Verified Railway public pre-deploy command docs page is reachable.
- Ran a current hosted preview baseline smoke against the public preview URLs.
- Prepared exact Railway dashboard instructions and rollback instructions.

## Provider access result

Live Railway configuration was **not changed** because this shell does not have Railway tooling/authenticated provider access.

Observed access state:

```text
railway=absent
vercel=absent
supabase=absent
gh=installed but not authenticated
RAILWAY_TOKEN=absent; length=0
VERCEL_TOKEN=absent; length=0
SUPABASE_ACCESS_TOKEN=absent; length=0
GH_TOKEN=absent; length=0
GITHUB_TOKEN=absent; length=0
```

Because there is no Railway CLI/auth in this runtime, I cannot safely verify or mutate the Railway API service pre-deploy setting from here.

## Exact Railway dashboard instructions

Use these steps in the Railway dashboard with the approved preview API service only.

Target service:

```text
wordle-royale API service
current public API: https://wordle-royaleapi-production.up.railway.app
```

Configuration to set:

```text
Pre-deploy command:
pnpm --filter @wordle-royale/api db:migrate:deploy
```

Configuration to keep separate and unchanged:

```text
Start command:
pnpm --filter @wordle-royale/api start
```

Recommended dashboard flow:

1. Open Railway dashboard.
2. Select the Wordle Royale preview project.
3. Select the API service, not the web/Vercel project and not Supabase.
4. Open service settings for deploy/build commands.
5. Find the pre-deploy command field.
6. Set it exactly to:

   ```bash
   pnpm --filter @wordle-royale/api db:migrate:deploy
   ```

7. Confirm the start command remains:

   ```bash
   pnpm --filter @wordle-royale/api start
   ```

8. Save the setting.
9. Trigger or wait for the next API deploy.
10. In Railway logs, record non-secret evidence only:

   ```text
   pre-deploy command configured: yes
   migration command: pnpm --filter @wordle-royale/api db:migrate:deploy
   migration result: <applied migration names or "No pending migrations">
   target: preview Supabase project/database name only, no URL
   deploy id/url: <non-secret Railway deployment URL or dashboard URL if safe>
   time: <UTC timestamp>
   ```

Do not copy/paste any `DATABASE_URL`, password, connection string, provider token, or Railway environment value into chat or docs.

## Rollback instructions

If the pre-deploy migration command causes failed deploys or unexpected migration risk:

1. Stop and do not retry repeatedly.
2. In Railway API service settings, clear or disable the pre-deploy command.
3. Confirm the start command is still:

   ```bash
   pnpm --filter @wordle-royale/api start
   ```

4. Redeploy the last known good API deployment or use Railway rollback if available.
5. Run the hosted smoke checklist below.
6. Open a Freya/Yuna follow-up with non-secret logs and the migration failure summary.

Do not roll back the Supabase database schema destructively unless Ashar explicitly approves that DB operation.

## Post-change smoke checklist

After the Railway pre-deploy command is configured and an API deploy has run, execute:

```bash
WEB="https://wordle-royale-web.vercel.app"
API="https://wordle-royaleapi-production.up.railway.app"
COOKIE_JAR="$(mktemp)"

curl -fsS "$API/healthz"
curl -fsS "$API/readyz"
curl -fsS "$API/lobbies" >/tmp/wordle-royale-preview-lobbies.json
curl -fsS "$API/leaderboard" >/tmp/wordle-royale-preview-leaderboard.json
curl -fsS -i \
  -c "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  -H "Content-Type: application/json" \
  -X POST "$API/auth/preview-demo/start"
curl -fsS \
  -b "$COOKIE_JAR" \
  -H "Origin: $WEB" \
  "$API/auth/me"
curl -fsS "$WEB/" >/tmp/wordle-royale-preview-home.html
rm -f "$COOKIE_JAR"
```

Required results:

```text
/healthz: HTTP 200, status ok
/readyz: HTTP 200, status ok, database ok, Redis optional/not_checked_stub allowed
/lobbies: HTTP 200
/leaderboard: HTTP 200
POST /auth/preview-demo/start: HTTP 201 or documented success status
GET /auth/me: HTTP 200 with preview demo user/current-user envelope
web root: HTTP 200
migration log: applied expected migration(s) or "No pending migrations"
```

## Baseline hosted smoke run today

This is not proof of the Railway pre-deploy setting, because no provider change was possible from this shell. It is a baseline that the current public preview is still healthy before the setting change.

```text
web_root=200
api_healthz=200
api_readyz=200
api_lobbies=200
api_leaderboard=200
preview_demo_start=201
auth_me=200
readyz_data_status=ok
readyz_dependencies.database.status=ok
readyz_dependencies.redis.status=not_checked_stub
```

## Tests / commands run

```bash
git status --short --branch
# provider CLI/auth/token presence checks without printing values
# Railway docs reachability check
# hosted baseline smoke against public preview URLs
```

Railway docs check:

```text
railway_docs_status=200
Pre-deploy=True
pre-deploy=True
command=True
```

Final local validation for this response:

```bash
git diff --check -- agent-communication/responses/ticket-118-yuna-railway-predeploy-migration-command-response.md
CI=true pnpm secret-scan
# custom credential-pattern scan over this response
# real env/generated artifact check
```

## Files changed

- `agent-communication/responses/ticket-118-yuna-railway-predeploy-migration-command-response.md`

## What was not changed

- No Railway settings changed.
- No deployments triggered.
- No Supabase migrations run.
- No provider resources created or modified.
- No provider secrets/env values viewed, printed, created, or changed.
- No paid services touched.
- No commit/push performed.

## Blockers / risks

- Railway pre-deploy command remains unconfigured until someone with Railway dashboard access applies it.
- Because no provider change happened, the post-change smoke checklist still needs to be run after the dashboard setting is saved and an API deploy occurs.
- If a future migration is destructive or prompts for approval, stop and ask Ashar/Athena before proceeding.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Yuna
- Why that agent is needed: Yuna owns live provider/runtime settings.
- Exact task: With Railway dashboard access, set the API service pre-deploy command to `pnpm --filter @wordle-royale/api db:migrate:deploy`, confirm start command remains `pnpm --filter @wordle-royale/api start`, then record non-secret evidence.
- Inputs/context they need: this Ticket 118 response, Ticket 114 runbook, Railway dashboard access, preview API service identity.
- Expected output back to Athena: pre-deploy command configured/not configured status, non-secret migration/deploy evidence, and post-change smoke results.

### Follow-up ticket 2

- Target agent: Jasmine
- Why that agent is needed: Jasmine owns independent hosted-preview verification.
- Exact task: After Railway pre-deploy is configured and a deploy runs, execute the migration-aware hosted preview smoke checklist.
- Inputs/context they need: public web/API URLs, non-secret migration evidence, this Ticket 118 response.
- Expected output back to Athena: PASS/WARN/FAIL with health/readiness/schema-backed endpoint/demo-session evidence.
