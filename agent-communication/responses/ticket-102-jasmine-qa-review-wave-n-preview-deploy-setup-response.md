# Ticket 102 — QA Review Wave N Preview Deploy Setup Response

Task: QA Review Wave N Preview Deploy Setup
Agent: Jasmine (QA)
Verdict: **FAIL / REQUIRE FIX BEFORE ACTUAL PROVIDER PROVISIONING OR DEPLOYMENT**

## Summary

I independently reviewed Wave N from the current working tree at:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Most Wave N work is strong and evidence-backed:

- Ticket 97's controlled preview scope is clear: **web + hosted API only**, demo sessions only, not production, not public mobile.
- Ticket 99's hosted API hardening is implemented and tested: preview config validation, secure cookies, split-host CORS, optional Redis readiness, and no dev-stub auth in preview.
- Ticket 100's web preview copy is visible and honest; mobile physical smoke remains explicitly deferred.
- PR #4 exists, is open/clean/mergeable, and remote CI is green on the current PR head.
- Local canonical gates pass.
- No secrets, real `.env` files, provider credentials, generated artifacts, paid services, or deployment side effects were added.

However, I found one deployment-blocking runbook/env mismatch: **the preview runbook tells operators to configure web/API URLs with an `/api/v1` suffix, but the current API has no `/api/v1` global prefix and the web/mobile clients append root-level paths like `/healthz`, `/auth/me`, and `/lobbies` to the configured base URL.** If followed literally, the preview web/mobile clients would call URLs such as `https://<api-host>/api/v1/healthz`, which do not exist.

Recommendation: **do not approve actual provider provisioning/deployment until the runbook/env docs are corrected to use the real API origin shape.** After that docs/config fix is made and CI remains green, I would support approving controlled preview provisioning/deployment with the known caveats below.

## Acceptance Criteria Checked

### 1. Ticket 97 deployment scope decision is clear

**PASS.**

Verified document:

```text
docs/2026-07-06-controlled-preview-deployment-scope-decision-lock.md
```

Decision locks are explicit:

- first public preview is **web + hosted API**, not production and not public mobile;
- preview auth is **explicit demo sessions only**;
- no durable accounts;
- preview sessions/data may reset;
- mobile remains Expo Go/manual smoke only;
- no deployment, provider resources, secrets, paid services, or real `.env` files before Ashar explicitly approves.

This matches Ticket 102's expected scope and persistent constraints.

### 2. Ticket 98 runbook is actionable and secret-safe

**FAIL due env/API URL path mismatch; otherwise mostly PASS.**

Verified document:

```text
docs/2026-07-06-preview-infrastructure-env-runbook.md
```

Positive findings:

- clearly marked plan-only, no provisioning/deployment performed;
- includes provider layout, env classification, build/start/migrate/smoke commands, rollback/reset guidance, cost/free-tier caveats, and approval checklist;
- correctly keeps secrets as provider env values only;
- correctly makes Redis optional for first hosted preview when `REDIS_REQUIRED=false`.

Blocking finding:

- Runbook line 150 says API base URL shape is `https://<preview-api-host>/api/v1`.
- Runbook line 177 says web `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_API_BASE_URL` shape is `https://<preview-api-host>/api/v1`.
- Current web code reads only `NEXT_PUBLIC_API_URL` and appends root-level paths:

```text
apps/web/src/lib/api-client.ts:106
return (process.env.NEXT_PUBLIC_API_URL?.trim() || defaultApiUrl).replace(/\/$/, '');
```

- Current API has no `setGlobalPrefix('api/v1')` and no `/api/v1` route prefix.
- Search evidence:

```text
apps/api/src: no matches for setGlobalPrefix, api/v1, or /api/v1
apps/web/.env.local.example: NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
apps/mobile/src/lib/api-client.ts reads EXPO_PUBLIC_API_URL, not EXPO_PUBLIC_API_BASE_URL
```

Impact:

If an operator follows the runbook literally, hosted web/mobile smoke will point at a non-existent API path and fail before meaningful preview validation.

Required fix:

- Update Ticket 98 runbook and any Wave N env instructions to use the actual API origin without `/api/v1`, for example:

```text
NEXT_PUBLIC_API_URL=https://<preview-api-host>
EXPO_PUBLIC_API_URL=https://<preview-api-host>
API_BASE_URL=https://<preview-api-host>        # only where code/scripts actually read it
```

- Or, if the intended architecture is truly `/api/v1`, add and test the API global prefix plus update all clients/scripts consistently. I do **not** recommend adding route prefix scope just to unblock this; docs correction is smaller and safer.

### 3. Ticket 99 hosted API hardening is correct and tested

**PASS.**

Inspected source:

- `apps/api/src/config/runtime-config.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/redis-readiness.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `.env.example`
- `.env.local.example`

Verified behaviors:

- `APP_ENV=preview` requires `AUTH_MODE=preview_demo_session`.
- Preview/prod-like mode requires `DATABASE_URL`, `PUBLIC_WEB_URL`, `CORS_ALLOWED_ORIGINS`, disabled dev auth/routes, and `COOKIE_SECURE=true`.
- Wildcard and insecure `http://` CORS origins are rejected in preview/prod-like mode.
- CORS allows no-origin health/curl requests and configured browser origins with credentials.
- Missing Redis is non-blocking when `REDIS_REQUIRED=false`; readiness reports Redis as `not_checked_stub` and stays overall `ok` if DB is OK.
- Preview demo cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` when hosted-preview cookie config is enabled.

Targeted hosted-preview local smoke:

```text
GET /readyz with APP_ENV=preview, AUTH_MODE=preview_demo_session,
COOKIE_SECURE=true, HTTPS CORS origin, REDIS_REQUIRED=false, REDIS_URL unset
-> status ok; database ok; redis not_checked_stub

POST /auth/preview-demo/start with Origin: https://preview.example.test
-> 201 Created
-> Access-Control-Allow-Origin: https://preview.example.test
-> Access-Control-Allow-Credentials: true
-> Set-Cookie: wr_preview_demo_session=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200; Secure
-> response user email=null, demo handle/display name
```

### 4. Ticket 100 preview copy/mobile smoke status is honest

**PASS with known caveat.**

Verified docs/source:

- `docs/2026-07-06-preview-release-copy-and-mobile-smoke.md`
- `agent-communication/responses/ticket-100-luna-preview-release-copy-and-mobile-smoke-response.md`
- `apps/web/src/components/PageFrame.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/settings/page.tsx`

Browser smoke against local web showed the persistent preview notice:

```text
Public preview — Demo sessions only — no durable accounts yet. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.
```

Browser console showed no JavaScript errors; only the standard React DevTools info message.

Mobile status remains honest:

- Physical Expo Go visual confirmation is **DEFERRED / BLOCKED**.
- Docs explicitly say not to claim public mobile preview readiness until Ashar completes the phone checklist.

### 5. PR/CI from Ticket 101 is green

**PASS.**

Live GitHub API verification, not just handoff docs:

```text
PR: https://github.com/Ashar-Neodym/wordle-royale/pull/4
State: open
Mergeable: true
Mergeable state: clean
Base: main @ ae7cf95025e1c88b35f8c1cf25e9bd99d41119a8
Head: wave-n/controlled-preview-setup @ 49ac977a059573915af0c11e27c0e8ddcb83297d
```

Current-head check run:

```text
Workspace checks completed success
Run: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28841474453
Job: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28841474453/job/85536242878
Head SHA: 49ac977a059573915af0c11e27c0e8ddcb83297d
```

Athena's doc also recorded an earlier successful run for `d8f6c95`; I verified the later/current `49ac977` head directly.

### 6. No secrets/generated artifacts/provider credentials/deployment side effects

**PASS.**

Secret scan:

```text
Secret scan passed (190 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Git status after cleanup:

```text
## wave-n/controlled-preview-setup...origin/wave-n/controlled-preview-setup
```

Ignored generated artifacts observed locally but not staged:

```text
!! apps/api/dist/
!! apps/mobile/.expo/
!! apps/web/.next/
!! apps/web/tsconfig.tsbuildinfo
!! node_modules/
```

I had to revert `apps/web/next-env.d.ts` after local web dev/build touched it; final status is clean apart from the new Ticket 102 response file.

No evidence found of:

- real `.env` files committed;
- provider credentials;
- provider login/config side effects;
- paid service additions;
- deployment/CD job creation;
- production secrets;
- generated artifacts staged.

## Commands Run + Exit Codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Required/local gates:

```bash
CI=true pnpm install --frozen-lockfile            # 0
CI=true pnpm lint                                 # 0
CI=true pnpm typecheck                            # 0
CI=true pnpm test                                 # 0
CI=true pnpm --filter @wordle-royale/api test     # 0; 44/44 API tests passed
CI=true pnpm build                                # 0
CI=true pnpm smoke:api:prod-start                 # 0
CI=true pnpm secret-scan                          # 0
git diff --check                                  # 0
git status --short --branch                       # 0
pnpm deps:down                                    # 0
```

Targeted QA checks:

```bash
GitHub API PR #4 metadata/check-runs              # 0
search for app API env names                      # 0
search for API /api/v1 global prefix              # 0; no matches
hosted-preview API local smoke with REDIS_REQUIRED=false # PASS after local deps up
browser smoke of web preview notice               # PASS
browser console check                             # PASS; no JS errors
final pnpm deps:down                              # 0
final git diff --check                            # 0
```

Note: one attempted preview API smoke initially failed because I accidentally launched it with the wrong auth-mode value; the app correctly failed fast with:

```text
Invalid API runtime configuration: APP_ENV=preview requires AUTH_MODE=preview_demo_session
```

I reran with the intended preview demo-session mode and verified readiness/cookie behavior.

## Browser / Visual Evidence

Browser URL:

```text
http://127.0.0.1:3102/
```

Observed content:

```text
Public preview limitations
Demo sessions only — no durable accounts yet. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.
Start preview demo
Server and rating status: database ok · redis not_checked_stub
```

Console:

```text
No JavaScript errors.
Only React DevTools informational message observed.
```

## Findings

### F1 — BLOCKER: Preview runbook uses `/api/v1` URL shape that current API/clients do not support

Severity: **Blocker for actual provider provisioning/deployment approval**

Repro/evidence:

1. Read `docs/2026-07-06-preview-infrastructure-env-runbook.md` lines 150 and 177.
2. It instructs API/web env values like `https://<preview-api-host>/api/v1`.
3. Inspect `apps/web/src/lib/api-client.ts`; the app reads `NEXT_PUBLIC_API_URL` and appends root routes such as `/healthz`.
4. Search `apps/api/src` for `setGlobalPrefix`, `api/v1`, `/api/v1`; no matches.
5. Therefore a hosted web configured per runbook would call non-existent paths such as `/api/v1/healthz` and fail.

Likely owner: **Yuna** for runbook/env docs, with **Freya** review if any API prefix is intentionally desired.

Required fix:

- Correct runbook/env docs to use root API origin values currently supported by code:

```text
NEXT_PUBLIC_API_URL=https://<preview-api-host>
EXPO_PUBLIC_API_URL=https://<preview-api-host>
```

- Remove or correct `/api/v1` examples unless a tested global prefix is added.
- Re-run docs/source sanity check and CI after the fix.

### F2 — PASS: Hosted API hardening behaves as intended

Severity: positive finding.

The API correctly fails unsafe preview config, accepts safe hosted-preview config, sets secure preview cookies, uses CORS credentials for the allowed origin, and allows optional Redis readiness.

### F3 — PASS: PR #4 remote CI is green on current head

Severity: positive finding.

Remote CI succeeded for current PR head `49ac977a059573915af0c11e27c0e8ddcb83297d`, not merely an earlier commit.

### F4 — WARN: Physical mobile smoke remains deferred

Severity: warning.

This is honest and documented. It blocks a public mobile preview claim but does not block web/API setup after F1 is fixed.

### F5 — WARN: Hosted provider behavior is still unvalidated

Severity: expected warning.

No deployment/provisioning occurred, by design. Provider networking, TLS, managed Postgres behavior, provider env injection, logs, cold starts, rollback UI, and final cookie behavior must be validated only after Ashar explicitly approves provisioning/deployment.

## Required Fixes / Owner

1. **Yuna — Fix Ticket 98 runbook/env URL shape before provisioning/deployment.**
   - Replace `/api/v1` examples with the actual root API origin values used by current web/mobile clients.
   - Explicitly state current routes are rooted at the API origin unless/until an API prefix is implemented and tested.
   - Verify `NEXT_PUBLIC_API_URL` and `EXPO_PUBLIC_API_URL` are the exact client env names.

2. **Athena/Yuna — Re-check PR #4 CI after the docs fix.**
   - If the fix is docs-only, still verify PR head and current-head check run.

No source-code fix is required for hosted API hardening based on my checks.

## Residual Risks After Required Fix

- Actual provider behavior remains untested until Ashar approves provisioning/deployment.
- Preview demo sessions are in-memory/non-durable and reset on API restart/redeploy.
- Preview data may reset; this must remain visible in release copy.
- Physical Expo Go visual smoke remains deferred; no public mobile readiness claim should be made.
- Provider free-tier/cost assumptions must be checked at provisioning time.
- The API build still uses monorepo dist shims from Wave M; acceptable for preview setup, but should be revisited before more serious productionization.

## Recommendation

**Do not approve actual controlled preview provider provisioning/deployment yet.**

First fix the runbook/env URL mismatch in F1. After that fix lands and PR #4 CI is green on the updated head, I would recommend **PASS WITH WARNINGS** and approve Ashar being asked for explicit controlled preview provisioning/deployment approval.
