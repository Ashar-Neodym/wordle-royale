# Ticket 96 — QA Review Wave M Preview Deploy Approval Response

Task: QA Review Wave M Preview Deploy Approval
Agent: Jasmine (QA)
Verdict: **PASS WITH WARNINGS / APPROVE CONTROLLED WAVE N PREVIEW DEPLOYMENT WORK**

## Summary

I independently verified Wave M from the current working tree at:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Wave M resolves the two Wave L preview-checkpoint blockers that caused Ticket 87 to fail:

1. **PR/remote CI blocker is resolved.** PR #3 exists, is open, clean/mergeable, and the latest PR head has a successful `Workspace checks` check run.
2. **API production build/start deploy shape is resolved.** The API now has a production build/start path and `pnpm smoke:api:prod-start` passes locally and in GitHub Actions.

I also verified the explicit preview-demo session behavior, local/web preview auth states, lobby write gating, no silent fixture impersonation in preview, spoiler-safety-sensitive test coverage, secret scan, and diff hygiene.

Recommendation: **Ashar can approve Wave N to merge PR #3 after human approval and proceed with controlled public-preview deployment setup/work.** This should still be treated as a deploy-shaped preview candidate, not a finished production launch: physical Expo Go visual smoke remains deferred, preview demo sessions are in-memory/non-durable, and real hosted deployment/provider secrets/migration/networking are not yet validated because deployment was intentionally out of scope.

## Acceptance Criteria Checked

### 1. Verify Wave L PR/CI blocker

**PASS.**

Evidence:

- PR: `https://github.com/Ashar-Neodym/wordle-royale/pull/3`
- Branch: `wave-m/preview-deploy-shape` → `main`
- PR state: `open`
- Mergeable: `true`
- Merge state: `clean`
- Current PR head: `b49ddf9f6630389c63f590c811880c2fbe900c5a`
- Base SHA: `c1703b5428c898fb53abcdfd219d4e043dc8cabc`
- Remote branch read-back:

```text
c1703b5428c898fb53abcdfd219d4e043dc8cabc refs/heads/main
b49ddf9f6630389c63f590c811880c2fbe900c5a refs/heads/wave-m/preview-deploy-shape
```

Latest live check run on the current head:

```text
Workspace checks completed success
Run: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28790491944
Job: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28790491944/job/85367596426
Head SHA: b49ddf9f6630389c63f590c811880c2fbe900c5a
```

Historical note: Athena's doc named run `28790198598` for an earlier PR head (`fbccbb9...`). I verified the later/current PR head directly and confirmed it also passed.

### 2. Verify API production build/start smoke and preview deploy-shape CI

**PASS.**

Changed files inspected included:

- `.github/workflows/pr-checks.yml`
- `apps/api/package.json`
- `apps/api/tsconfig.build.json`
- `apps/api/scripts/link-built-workspace-packages.mjs`
- `scripts/api-prod-start-smoke.mjs`

Workflow check:

```yaml
- name: API production-start smoke
  run: pnpm smoke:api:prod-start

- name: Stop local dependency services
  if: always()
  run: pnpm deps:down
```

Local smoke result from my run:

```text
PASS readyz — http://127.0.0.1:37187/readyz returned status=ok
PASS api prod-start smoke — service=wordle-royale-api, env=production
INFO api process terminated — exit=null
```

Remote PR CI also includes the `Workspace checks` job and passes on the current head.

### 3. Verify account/session behavior against Ticket 89 / implementation

**PASS, with expected preview-MVP limitations.**

Implementation inspected:

- `apps/api/src/auth/current-user.service.ts`
- `apps/api/src/auth/preview-demo-session.service.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/lobby/lobby.controller.ts`
- `apps/api/src/lobby/lobby.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/test/api-skeleton.test.ts`

Behavior verified by API test suite and local smoke:

- `AUTH_MODE=preview_demo_session` is explicit and distinct from `dev_stub`.
- Preview current-user/write routes reject missing sessions with `not_authenticated`.
- `x-wordle-dev-user-id` does not create a preview current user.
- `POST /auth/register` remains blocked outside dev-stub mode and does not emit stub access/refresh tokens in preview.
- `POST /auth/preview-demo/start` creates a demo-labeled user/profile and returns an `HttpOnly` cookie name/expiry only, not production-looking access tokens.
- Preview-demo sessions are token-hashed in memory server-side.
- Lobby writes resolve to the preview-demo user instead of fixture users.

Direct local API smoke evidence:

```text
GET /auth/me with dev fixture header in preview_demo_session -> 401 not_authenticated
POST /auth/preview-demo/start -> 201 with mode=preview_demo_session, email=null, demo handle/display name, Set-Cookie
GET /auth/me with preview demo cookie -> 200 current demo user
POST /lobbies with preview demo cookie -> 201 created lobby hosted by demo user
```

Expected limitation: preview demo sessions are in-memory and reset on API restart. That matches Ticket 89/Ticket 92 preview-MVP allowance but must be called out before a public preview.

### 4. Verify web/mobile auth/session states and spoiler-safe ranked result/share flows

**WEB: PASS. MOBILE: WARN / physical device deferred.**

Browser smoke against local web/API:

- API: `http://127.0.0.1:4100`
- Web: `http://127.0.0.1:3100`
- Web env corrected to `NEXT_PUBLIC_API_URL=http://127.0.0.1:4100`

Observed `/profile` before demo session:

```text
Preview profile
Profile requires a session
Preview mode does not impersonate the local stub user.
Start preview demo
Profile unavailable — not_authenticated: Sign in is required for this action.
```

Observed `/profile` after clicking `Start preview demo`:

```text
Preview Demo 055c4c29
@demo_055c4c29 · 1200 rating · 0 rated games
Profile summary rendered for the demo user
Recent matches: Empty history
```

Observed `/lobbies` after demo session and direct lobby creation:

```text
1 open room(s) on the local server
Lobby code B87358
Join button visible
Start ranked disabled until enough players
Ranked start guarded: needs a live ranked-compatible lobby with at least 2 members.
```

Browser console:

```text
No JavaScript errors observed.
Only React DevTools informational messages were present.
```

Spoiler safety:

- API tests covering ranked gameplay, match history, completed results, and current-state routes passed: `41/41`.
- Browser copy inspected did not surface answer/hash/salt fields.
- `Play` page copy states: `Server state stays authoritative; answer/hash/salt never appear here.`
- `LobbyScreens` keeps invite/share visible while write actions require an explicit session.

Mobile:

- I inspected Ticket 94 and did not re-run a physical phone flow because this agent cannot scan/open Expo Go on a real device.
- Ticket 94's machine checks passed, LAN API/Expo URL were verified, and Ashar explicitly deferred physical observation.
- This remains a **non-blocking warning** for controlled web/API preview deployment, but it is a blocker for claiming full mobile public-preview visual approval.

### 5. Verify no secrets/generated artifacts and no unapproved deployment/provider setup

**PASS.**

Secret scan:

```text
Secret scan passed (189 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Git/diff hygiene:

```text
git diff --check -> exit 0
git status --short --branch -> ## wave-m/preview-deploy-shape...origin/wave-m/preview-deploy-shape
```

Generated artifacts observed only as ignored files after local builds/dev smoke:

```text
!! apps/api/dist/
!! apps/mobile/.expo/
!! apps/web/.next/
!! apps/web/tsconfig.tsbuildinfo
!! node_modules/
```

I reverted the dev-server touch to `apps/web/next-env.d.ts` before finishing.

Provider/deployment scope review:

- No deployment performed.
- No CD job added.
- No cloud provider login action added.
- No real `.env` file added.
- No production secret committed.
- Workflow remains local Docker Compose + build/test/smoke only.

## Commands Run + Exit Codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Required local gate chain:

```bash
CI=true pnpm install --frozen-lockfile           # 0
CI=true pnpm lint                                # 0
CI=true pnpm typecheck                           # 0
CI=true pnpm test                                # 0
CI=true pnpm --filter @wordle-royale/api test    # 0, 41/41 API tests passed
CI=true pnpm build                               # 0
CI=true pnpm smoke:api:prod-start                # 0
CI=true pnpm smoke:local                         # 0
CI=true pnpm deps:check                          # 0
CI=true pnpm secret-scan                         # 0
git diff --check                                 # 0
git status --short --branch                      # 0
```

Cleanup and additional verification:

```bash
pnpm deps:down                                   # 0
git ls-remote origin refs/heads/wave-m/preview-deploy-shape refs/heads/main # 0
GitHub API PR #3 check                           # 0
GitHub API check-runs for current head           # 0
Local API/web preview smoke                      # PASS, manual/browser-backed
pnpm deps:reset                                  # 0, used only to repair local dirty Docker volume state for browser smoke
pnpm deps:down                                   # 0 final cleanup
```

One setup attempt failed during local browser-smoke preparation because an existing local Postgres volume had mismatched credentials / non-empty schema state. I reset the local Docker volumes and reran migration/seed successfully before browser verification. This was a local environment issue, not an implementation failure.

## Browser / Visual Evidence

Browser smoke snapshots verified:

1. `/profile` no-session state:
   - explicit `Profile requires a session` panel;
   - `Start preview demo` button;
   - no silent fixture user.
2. `/profile` after demo start:
   - demo-labeled current profile rendered;
   - handle/display name were `demo_*` / `Preview Demo *`;
   - empty history rendered honestly.
3. `/lobbies` with live API:
   - server online/readiness shown;
   - open lobby visible;
   - join available;
   - start disabled until minimum players are present;
   - no browser console errors.

## Findings

### F1 — Current PR head CI is good

Severity: none / positive finding.

PR #3's current head (`b49ddf9...`) has a successful `Workspace checks` check run. The Wave L remote-CI blocker is closed.

### F2 — API deploy-shape is adequate for preview approval, not final production hosting

Severity: warning.

The API production-start smoke now works locally and remotely. It validates built API startup, Prisma client generation, local Docker Compose PostgreSQL/Redis, and `/readyz`. It does **not** validate a hosted provider's networking, migration policy, TLS/domain configuration, managed DB/Redis, or production secret store.

Owner for next wave: Yuna/Athena.

### F3 — Preview demo sessions satisfy Ticket 89 but are intentionally non-durable

Severity: warning.

This is acceptable for a controlled preview MVP because Ticket 89 explicitly allowed a small demo-session slice. Do not market it as durable account auth. Sessions reset on API restart and are not portable production accounts.

Owner for next wave: Elisa/Freya if durable account/session scope is desired.

### F4 — Physical mobile smoke remains deferred

Severity: warning / not blocking web/API preview deploy work.

Ticket 94 documented that Ashar could not check the phone and deferred Expo Go observation. This should stay visible in release notes. It blocks a full mobile visual approval claim, but not a web/API controlled preview deployment setup.

Owner for next wave: Luna + Ashar phone observation.

## Required Fixes / Owner

None required before Ashar can approve Wave N controlled preview deployment work.

Recommended Wave N tasks:

1. **Ashar/Athena:** Decide whether to merge PR #3 into `main` after reviewing this QA response.
2. **Yuna:** If approved, perform a controlled preview deployment plan/run without committing secrets: provider choice, secret-store mapping, DB/Redis provisioning policy, migration command, and rollback plan.
3. **Elisa/Freya:** Keep preview-demo copy explicit: demo sessions are not real accounts and may reset.
4. **Luna/Ashar:** Close physical Expo Go visual smoke when a phone is available.

## Residual Risks

- Hosted preview environment not tested yet: no provider networking/TLS/domain/managed DB/secret-store validation.
- Preview demo sessions are in-memory and unsuitable as real production auth.
- Mobile physical visual smoke is still deferred.
- API build uses pragmatic monorepo dist shims; acceptable for deploy-shape, but should be revisited before scaling deployment complexity.

## Wave N Recommendation

**Approve Wave N to proceed with controlled public-preview deployment setup/work, after Ashar explicitly approves merge/deployment.**

Do **not** auto-deploy or merge without Ashar approval. If Ashar approves, PR #3 is a reasonable candidate to merge first because local gates and current-head remote CI pass, and the remaining caveats are documented preview limitations rather than merge blockers.
