# Ticket 102b — Jasmine Wave N Blocker Fix Re-check Response

Task: Focused re-check of Ticket 102 blocker fix
Agent: Jasmine (QA)
Verdict: **PASS WITH WARNINGS**

## Summary

I re-checked the Ticket 102 blocker fix against the current working tree at:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Current local branch/head:

```text
branch: wave-n/controlled-preview-setup
HEAD: b41d951c788ac70fb23041ef05455f55e3583a72
```

The original Ticket 102 deployment blocker is fixed in the active Wave N preview runbook/env guidance:

- active preview API URL guidance now uses `https://<preview-api-host>` without `/api/v1`;
- active web env guidance now uses the exact current web env name `NEXT_PUBLIC_API_URL`;
- active mobile/Expo env guidance now uses the exact current mobile env name `EXPO_PUBLIC_API_URL`;
- active runbook explicitly says current API routes are rooted at the API origin and not to append `/api/v1` unless a tested global prefix is added later;
- current API source still has no `/api/v1` global prefix, matching the corrected docs;
- PR #4 live head is `b41d951c788ac70fb23041ef05455f55e3583a72`, and the current-head GitHub check run is green.

I did **not** deploy, provision provider resources, or merge PR #4.

## Acceptance Criteria Checked

### 1. Active preview env/runbook guidance no longer instructs `/api/v1` URL values

**PASS.**

Read/verified:

- `docs/2026-07-06-preview-infrastructure-env-runbook.md`
- `.env.example`
- `.env.local.example`
- `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`
- `docs/2026-07-07-athena-review-after-ticket-102-fix.md`

Current active runbook values:

```text
API_BASE_URL=https://<preview-api-host>
NEXT_PUBLIC_API_URL=https://<preview-api-host>
EXPO_PUBLIC_API_URL=https://<preview-api-host>
```

Relevant runbook evidence:

```text
docs/2026-07-06-preview-infrastructure-env-runbook.md:150
API_BASE_URL = https://<preview-api-host>; current API routes are rooted at the origin; do not append /api/v1 unless a tested global prefix is added later.

docs/2026-07-06-preview-infrastructure-env-runbook.md:177
NEXT_PUBLIC_API_URL = https://<preview-api-host>; current web code appends root-level routes; do not include /api/v1.

docs/2026-07-06-preview-infrastructure-env-runbook.md:191
EXPO_PUBLIC_API_URL = https://<preview-api-host>; do not include /api/v1.
```

`.env.example` and `.env.local.example` are also corrected:

```text
API_BASE_URL=http://localhost:4000
EXPO_PUBLIC_API_URL=http://localhost:4000
```

The Wave L boundary doc was corrected for active preview guidance:

```text
docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md
API_BASE_URL=https://<preview-api-host>
NEXT_PUBLIC_API_URL=https://<preview-api-host>
```

Search result caveat: `/api/v1` still appears in historical/archival docs and prior agent responses, including the original Ticket 102 failure report and older architecture planning docs. I do not treat those as active Wave N preview env/runbook guidance for this re-check. The active runbook now uses `/api/v1` only in negative guidance: “do not append `/api/v1`.”

### 2. Current web env name is `NEXT_PUBLIC_API_URL`

**PASS.**

Code evidence:

```text
apps/web/src/lib/api-client.ts:105-107
export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || defaultApiUrl).replace(/\/$/, '');
}
```

Route construction evidence:

```text
fetch(`${apiUrl}${path}`, ...)
getHealth() -> /healthz
getReadiness() -> /readyz
getCurrentUser() -> /auth/me
listLobbies() -> /lobbies
```

Active runbook now explicitly says current web code reads `NEXT_PUBLIC_API_URL` only and not to create obsolete `NEXT_PUBLIC_API_BASE_URL` provider values.

### 3. Current mobile env name is `EXPO_PUBLIC_API_URL`

**PASS.**

Code evidence:

```text
apps/mobile/src/lib/api-client.ts:116-119
export function getMobileApiBaseUrl(): { apiUrl: string; source: 'env' | 'default' } {
  const configured = process?.env?.EXPO_PUBLIC_API_URL?.trim();
  return configured ? { apiUrl: normalizeApiUrl(configured), source: 'env' } : { apiUrl: defaultMobileApiUrl, source: 'default' };
}
```

Route construction evidence:

```text
fetch(`${apiUrl}${path}`, ...)
checkMobileHealth() -> /healthz
checkMobileReadiness() -> /readyz
getMobileLobbies() -> /lobbies
getMobileLeaderboard() -> /leaderboard
```

`.env.example`, `.env.local.example`, and the active runbook now use `EXPO_PUBLIC_API_URL`, not `EXPO_PUBLIC_API_BASE_URL`.

### 4. API routes remain rooted at the API origin

**PASS.**

Source search in `apps/api/src` found no matches for:

```text
setGlobalPrefix
api/v1
/api/v1
@Controller('api
```

Inspected client path construction confirms clients append root-level paths to the configured API origin.

The active runbook health/smoke commands now also use root paths:

```bash
curl -fsS https://<preview-api-host>/healthz
curl -fsS https://<preview-api-host>/readyz

API="https://<preview-api-host>"
curl -X POST "$API/auth/preview-demo/start"
curl "$API/auth/me"
```

### 5. PR #4 live head and CI are green

**PASS.**

Live GitHub API verification:

```text
PR_URL https://github.com/Ashar-Neodym/wordle-royale/pull/4
STATE open
MERGEABLE True
MERGEABLE_STATE clean
HEAD_REF wave-n/controlled-preview-setup
HEAD_SHA b41d951c788ac70fb23041ef05455f55e3583a72
BASE_REF main
```

Current-head check run:

```text
CHECK_RUN_TOTAL 1
CHECK Workspace checks completed success b41d951c788ac70fb23041ef05455f55e3583a72
https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28842540253/job/85539427114
```

This matches the user-provided current PR head and CI job.

### 6. No secrets, real env files, provider credentials, deployments, or generated artifacts introduced

**PASS.**

Secret scan:

```text
pnpm secret-scan -> exit 0
Secret scan passed (190 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Diff whitespace check:

```text
git diff --check -> exit 0
```

Working tree before writing this response was clean against the branch:

```text
## wave-n/controlled-preview-setup...origin/wave-n/controlled-preview-setup
```

Tracked env-ish files:

```text
.env.example
.env.local.example
apps/web/.env.local.example
```

No real `.env`, `.env.local`, `.env.production`, or `.env.preview` files are tracked or shown in the branch diff.

Changed files vs `origin/main` do not include generated artifact paths such as `dist/`, `.next/`, `.expo/`, `node_modules/`, or `tsconfig.tsbuildinfo`.

Ignored generated artifacts exist locally from prior build/test work but are not tracked/staged:

```text
!! apps/api/dist/
!! apps/api/node_modules/
!! apps/mobile/.expo/
!! apps/mobile/node_modules/
!! apps/web/.next/
!! apps/web/node_modules/
!! apps/web/tsconfig.tsbuildinfo
!! node_modules/
!! packages/contracts/dist/
!! packages/contracts/node_modules/
!! packages/design-tokens/dist/
!! packages/fixtures/dist/
!! packages/rating-tools/node_modules/
!! packages/word-tools/node_modules/
```

No provider deployment/config files or CI deployment workflow additions were introduced in the inspected changed-file list. I did not run provider CLIs, create resources, deploy, or merge.

## Commands Run + Exit Codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands/checks:

```bash
git status --short --branch && git rev-parse HEAD && git branch --show-current
# exit 0; branch clean at b41d951c788ac70fb23041ef05455f55e3583a72

GitHub API PR/check-run verification script
# exit 0; PR #4 open/clean, head b41d951..., Workspace checks success on same SHA

search apps/api/src for setGlobalPrefix|api/v1|/api/v1|@Controller('api
# exit 0; no matches

search apps for NEXT_PUBLIC_API_URL|NEXT_PUBLIC_API_BASE_URL|EXPO_PUBLIC_API_URL|EXPO_PUBLIC_API_BASE_URL
# exit 0; current code uses NEXT_PUBLIC_API_URL and EXPO_PUBLIC_API_URL

search active docs/examples for /api/v1
# exit 0; only negative/history references in active fix/runbook docs, no active value examples

pnpm secret-scan
# exit 0

git diff --check
# exit 0

git status --short --branch
# exit 0

git diff --name-only origin/main...HEAD | grep generated/env-real patterns
# exit 0; no matching tracked generated artifacts or real env files
```

## Findings

### F1 — Original Ticket 102 blocker fixed

Severity: **Resolved**

The active Wave N preview runbook/env docs no longer instruct operators to set `/api/v1` URL values. The guidance now matches the current implementation: configure the API origin and let web/mobile clients append root-level route paths.

### F2 — Historical docs still contain obsolete API base/env names

Severity: **Warning / non-blocking for this focused re-check**

A repository-wide search still finds `/api/v1` and `EXPO_PUBLIC_API_BASE_URL` in older planning/architecture documents, especially:

```text
docs/2026-07-01-preview-deployment-ci-env-plan.md
agent-communication/responses/ticket-02-...
agent-communication/responses/ticket-10-...
agent-communication/responses/ticket-12-...
```

These are not the active Wave N preview runbook/env guidance requested for this re-check, so I am not failing the ticket on them. Risk remains that an operator could accidentally consult older docs. If Athena wants to reduce that risk, add a short supersession note to the older preview deployment plan pointing to `docs/2026-07-06-preview-infrastructure-env-runbook.md`.

### F3 — Provider behavior still unvalidated

Severity: **Expected warning**

No deployment/provisioning was performed, as requested. Provider TLS/domain behavior, managed Postgres connectivity, provider env injection, API cold starts, rollback UI, and hosted cookie/CORS behavior remain unvalidated until Ashar explicitly approves provisioning/deployment.

### F4 — Physical mobile smoke still deferred

Severity: **Expected warning**

The active runbook correctly limits mobile to manual Expo Go smoke and does not claim public mobile readiness.

## Required Fixes / Owner

None for the Ticket 102 blocker fix.

Optional follow-up:

- **Athena/Yuna:** Consider adding a supersession note to `docs/2026-07-01-preview-deployment-ci-env-plan.md` so future operators do not use its older `EXPO_PUBLIC_API_BASE_URL` examples.

## Residual Risks

- Actual hosted preview behavior remains untested until explicit deployment/provisioning approval.
- Preview demo sessions remain non-durable and may reset on API restart/redeploy.
- Preview DB reset/seed operations still require explicit care and isolated preview DB confirmation.
- Provider free-tier/cost constraints must be checked at provisioning time.
- Public mobile readiness remains out of scope until physical Expo Go visual smoke is completed.

## Recommendation

**PASS WITH WARNINGS.**

The original Ticket 102 blocker is fixed. I see no remaining deployment-blocking issue in the focused re-check. PR #4 may proceed to the next approval step, but do not provision/deploy until Ashar explicitly approves provider/resource creation and deployment.
