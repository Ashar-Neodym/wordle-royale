# Ticket 91 — Preview Deploy-Shape CI Gate Response

Task: Preview Deploy-Shape CI Gate
Agent: Yuna (operations)
Status: Completed — CI now includes the API production-start smoke; no deployment/provider/secrets added

## What I understood

Ticket 91 asked me to wire Ticket 90's deploy-shaped API production-start smoke into the GitHub Actions PR checks without adding CD, cloud provider login actions, paid services, provider tokens, or secret-dependent steps.

Ticket 90 provided:

- `pnpm --filter @wordle-royale/api build`
- `pnpm --filter @wordle-royale/api start`
- `pnpm --filter @wordle-royale/api smoke:prod-start`
- root alias: `pnpm smoke:api:prod-start`

## What I did

- Read Ticket 91, Ticket 90's response, Athena's Tickets 89–90 review, the root/package scripts, and the existing PR checks workflow.
- Added a GitHub Actions step to run the root deploy-shape smoke command:
  - `pnpm smoke:api:prod-start`
- Kept the workflow free/local/deterministic:
  - no deploy job;
  - no cloud/provider login action;
  - no provider token;
  - no production secret;
  - local Docker Compose PostgreSQL/Redis only.
- Added an `if: always()` cleanup step:
  - `pnpm deps:down`
- Verified the local equivalent command passes.

## Files changed

- `.github/workflows/pr-checks.yml`
- `agent-communication/responses/ticket-91-yuna-preview-deploy-shape-ci-gate-response.md`

## Workflow change

Added after the full workspace build:

```yaml
# Preview deploy-shape smoke. This starts only local Docker Compose
# PostgreSQL/Redis services, runs the built API against /readyz, and does
# not use cloud providers, deploy credentials, or production secrets.
- name: API production-start smoke
  run: pnpm smoke:api:prod-start
```

Added cleanup before the secret scan:

```yaml
- name: Stop local dependency services
  if: always()
  run: pnpm deps:down
```

The workflow still runs on:

- `pull_request`
- `push` to `main`

## Commands run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands and exit codes:

```bash
node -e "...workflow deploy-shape smoke check..." # 0
CI=true pnpm install --frozen-lockfile            # 0
CI=true pnpm lint                                 # 0
CI=true pnpm typecheck                            # 0
CI=true pnpm test                                 # 0
CI=true pnpm build                                # 0
CI=true pnpm smoke:api:prod-start                 # 0
CI=true pnpm smoke:local                          # 0
CI=true pnpm secret-scan                          # 0
git diff --check                                  # 0
CI=true pnpm deps:down                            # 0
CI=true pnpm deps:check                           # 0
```

## Evidence / result

Deploy-shape smoke evidence:

```text
INFO docker compose — current environment
$ docker compose up -d postgres redis
exit=0
$ pnpm --filter @wordle-royale/api build
exit=0
INFO api smoke port — 34875
$ node dist/apps/api/src/main.js
[NestApplication] Nest application successfully started
PASS readyz — http://127.0.0.1:34875/readyz returned status=ok
PASS api prod-start smoke — service=wordle-royale-api, env=production
INFO api process terminated — exit=null
```

Other local gate evidence:

```text
Workspace scaffold validation passed (9 workspace packages).
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (188 source/config files scanned).
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
```

Cleanup evidence:

```text
$ node scripts/docker-compose.mjs down
Using Docker Compose from current environment.
Container wordle-royale-redis Removed
Container wordle-royale-postgres Removed
Network wordle-royale_default Removed
```

Ignored/generated artifacts observed but not staged:

```text
!! apps/api/dist/
!! apps/mobile/.expo/
!! apps/web/.next/
!! apps/web/tsconfig.tsbuildinfo
```

## Acceptance criteria status

- PR checks include deploy-shape validation appropriate for the monorepo: PASS.
- Local equivalent command passes: PASS.
- Workflow remains compatible with current Node/pnpm constraints: PASS; workflow still uses pnpm 11.1.1 and Node 24 as before.
- No external services/secrets required beyond local test services: PASS.

## Remaining deploy gaps

- This is still a deploy-shape smoke, not a real hosted preview deployment.
- It validates local Docker Compose PostgreSQL/Redis and the built API `/readyz`; it does not validate managed provider networking, production migrations, TLS, domains, or provider-specific env/secrets.
- Ticket 90's build approach remains monorepo-specific and may need later cleanup via package exports/project references or a bundler.

## Safety / approval boundaries

- Did not deploy.
- Did not add CD.
- Did not add provider login actions.
- Did not create external resources.
- Did not create, print, rotate, or store secrets.
- Did not create real `.env` files.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Jasmine
- Why that agent is needed: Independent QA/release confidence after Ticket 91 CI hardening.
- Exact task: Verify that the PR workflow contains `pnpm smoke:api:prod-start`, cleanup runs with `if: always()`, and local gates remain passing.
- Inputs/context they need: this response, `.github/workflows/pr-checks.yml`, Ticket 90 response, and Ticket 91.
- Expected output back to Athena: CI/readiness verification result and any blocker list.

### Follow-up ticket 2

- Target agent: Yuna
- Why that agent is needed: Remote CI monitoring belongs to operations after the next checkpoint branch/PR exists.
- Exact task: During Ticket 95, confirm GitHub Actions actually runs the new API production-start smoke to terminal success/failure.
- Inputs/context they need: Ticket 91 response and the PR URL once opened.
- Expected output back to Athena: remote run URL, status, conclusion, and failure triage if needed.
