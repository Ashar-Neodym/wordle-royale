# Ticket 70 — GitHub Actions CI/CD Hardening for Current Monorepo Response

Task: GitHub Actions CI/CD hardening for current monorepo
Agent: Yuna (operations)
Status: Completed — CI workflow hardened; no deployment/CD added

## What I understood

Ashar asked whether GitHub Actions/CI/CD can be used. The safe answer for the current project is: use GitHub Actions for CI now, but do **not** add CD/deployment until the hosting target and secrets policy are explicit.

Ticket 69 found that the existing PR workflow was a useful baseline, but it did not run the real API behavior tests and did not explicitly check the local dependency/Compose config contract. This ticket needed to harden the workflow for the current pnpm monorepo without adding paid services, deployment steps, or runtime services in CI.

## What I did

Updated `.github/workflows/pr-checks.yml` to:

- Keep PR and `main` push CI triggers.
- Add workflow `concurrency` so superseded PR/push runs cancel cleanly.
- Set `CI=true` globally for non-interactive CI behavior.
- Increase timeout from 15 to 20 minutes for the larger current monorepo build/test set.
- Rename generic steps for clearer CI logs:
  - `Workspace scaffold test`
  - `API behavior tests`
  - `Build all packages and apps`
- Add the stable API behavioral test gate:
  - `pnpm --filter @wordle-royale/api test`
- Keep root gates:
  - `pnpm install --frozen-lockfile`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm smoke:local`
  - `pnpm secret-scan`
- Add a config-only local dependency check:
  - `pnpm deps:check`
- Explicitly documented in the workflow that `deps:check` is config-only and does **not** start PostgreSQL/Redis or require deploy secrets.

I did **not** add:

- Deployment jobs.
- Paid services.
- Secret-dependent jobs.
- Service containers.
- `pnpm deps:verify`, because that starts local dependencies and is better left as a local/operator verification gate unless Athena explicitly wants service-container CI later.

## Files changed

- `.github/workflows/pr-checks.yml`
- `agent-communication/responses/ticket-70-yuna-github-actions-ci-cd-hardening-current-monorepo-response.md`

Note: `.gitignore` is also modified in the current worktree from Ticket 69 to ignore `*.tsbuildinfo`; I did not make additional `.gitignore` changes for Ticket 70.

## Workflow gate matrix after hardening

Current CI job: `workspace-checks`

Runs on:

- Pull requests.
- Pushes to `main`.

Steps:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @wordle-royale/api test
pnpm build
pnpm smoke:local
pnpm deps:check
pnpm secret-scan
```

Coverage:

- Workspace scaffold validation: yes.
- API behavior tests: yes, 32-test suite locally verified.
- Web build: yes, via `pnpm build`.
- Mobile build/config/typecheck: yes, via `pnpm build`.
- Package builds: yes, via `pnpm build`.
- Secret scan: yes.
- Docker/Compose: config-only check, no service startup.
- Deployment/CD: intentionally absent.

## Tests / commands run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Workflow smoke/content check — exit `0`:

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.github/workflows/pr-checks.yml','utf8'); if(!text.includes('API behavior tests')) process.exit(1); console.log('workflow smoke check ok')"
```

Output:

```text
workflow smoke check ok
```

Full local CI-equivalent gate chain — exit `0`:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
```

Key output:

```text
Scope: all 10 workspace projects
Already up to date
Workspace scaffold validation passed (9 workspace packages).
Workspace scaffold validation passed (9 workspace packages).
Workspace scaffold validation passed (9 workspace packages).
ℹ tests 32
ℹ suites 6
ℹ pass 32
ℹ fail 0
packages/contracts build: Done
packages/design-tokens build: Done
packages/fixtures build: Done
packages/game-engine build: Done
packages/rating-tools build: Done
packages/word-tools build: Done
apps/mobile build: Done
apps/web build: ✓ Compiled successfully
apps/api build: Done
Local smoke passed. This smoke test validates local config only; it does not start app services.
Using Docker Compose from current environment.
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
Secret scan passed (179 source/config files scanned).
```

Whitespace diff check — exit `0`:

```bash
git diff --check -- .github/workflows/pr-checks.yml .gitignore agent-communication/responses/ticket-70-yuna-github-actions-ci-cd-hardening-current-monorepo-response.md
```

Output: no whitespace errors.

## Evidence / result

The workflow now includes the missing current-monorepo confidence gates from Ticket 69:

```yaml
- name: API behavior tests
  run: pnpm --filter @wordle-royale/api test

- name: Dependency config check
  run: pnpm deps:check
```

The Docker/Compose gate is documented as config-only:

```yaml
# Config-only Docker Compose check. This validates the local dependency
# contract without starting PostgreSQL/Redis or requiring deploy secrets.
```

No CD/deployment steps were added.

## CI/CD recommendation

CI now: use GitHub Actions on PRs and pushes to `main` with the hardened `pr-checks.yml`.

CD later: wait until Athena/Ashar explicitly chooses hosting and approves secret handling. Reasonable future options:

1. **Vercel for web + managed/free Postgres/Redis later**
   - Good for Next.js web.
   - API/backend hosting needs a separate decision if NestJS remains standalone.
2. **Render/Fly.io/Railway-style app hosting**
   - Easier for long-running API services.
   - Must review free-tier limits and secret storage before use.
3. **GitHub Actions deploy job after CI**
   - Only after branch protection, environment approvals, and secrets are configured.
   - Should use protected GitHub Environments for production.

Do not add deployment automation yet.

## Blockers or risks

- No blocker for CI hardening remains locally.
- `gh` CLI is unavailable in this shell, so I did not inspect remote Actions runs or create a PR.
- `pnpm deps:check` depends on Docker Compose v2 being available on the GitHub hosted runner. `ubuntu-latest` normally includes Docker/Compose; the step is config-only and does not start services. If GitHub removes/changes Compose availability, CI can either install Compose explicitly or drop this check back to local-only.
- This workflow has not run remotely yet because no push was performed.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Jasmine
- Why that agent is needed: Independent QA/release confidence before Athena treats the GitHub checkpoint as ready.
- Exact task: Review the hardened workflow diff and rerun the CI-equivalent gate chain locally or on the pushed PR once Ashar approves push.
- Inputs/context they need: `.github/workflows/pr-checks.yml`, this response, and Ticket 69 response.
- Expected output back to Athena: Pass/fail evidence, any CI gap findings, and recommendation on whether the branch is safe to open/merge.

### Follow-up ticket 2

- Target agent: Athena
- Why that agent is needed: Orchestrator owns sequencing and final push/PR approval.
- Exact task: Decide whether Ashar wants a branch/PR checkpoint now, then issue the approved commit/push ticket or command set.
- Inputs/context they need: Ticket 69 response and this Ticket 70 response.
- Expected output back to user/agents: Approved branch name, commit scope, and whether to push/open PR or wait for Jasmine Ticket 71.
