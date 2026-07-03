# Ticket 87 — QA Review Wave L Preview Readiness Response

Task: QA Review Wave L Preview Readiness
Agent: Jasmine (QA)
Verdict: **FAIL / BLOCKED FOR PREVIEW CHECKPOINT** — local Wave L behavior passes targeted QA, but there is no PR/remote CI yet and API preview deployment remains not production-start ready.

## Summary

I independently verified Wave L against Ticket 87 using the current working tree at:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Local implementation quality is good: the full root/package gate chain passes, preview/session-required auth boundaries reject current-user/write actions without silently impersonating fixture users, ranked result actions are spoiler-safe, lobbies expose safe invite/share copy, web responsive checks passed on sampled pages, secret scan passes, and mobile has repeatable LAN/Expo instructions plus build/typecheck evidence.

However, I cannot approve Wave L as preview-checkpoint ready yet because two checkpoint/deployment blockers remain:

1. **No PR exists for `wave-l/preview-readiness`, so GitHub Actions has not run remotely for Wave L.** Branch push is verified, but the workflow only runs on PRs and `main` pushes.
2. **API preview deployment is still not production-start ready.** Ticket 81 correctly identifies that `apps/api` build is typecheck-only and no production `start` script exists. That is acceptable as a known plan gap, but it blocks claiming public-preview deployment readiness.

Mobile physical-device Expo Go smoke remains deferred with good instructions; I treat that as a warning/condition rather than a blocker because Ticket 85 explicitly documented the deferral and actionable phone checklist.

## Acceptance criteria checked

### 1. Auth/account/deployment boundary is clear and no fake production auth was introduced — PASS with deployment blocker noted

Evidence reviewed:

- Ticket 80 decision lock: `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`.
- Ticket 82 implementation response and source inspection of `CurrentUserService`.
- Preview-mode API smoke with `APP_ENV=preview`, `AUTH_MODE=session_required`, `ENABLE_DEV_AUTH=false`, and `ENABLE_DEV_ROUTES=false`.

Preview-mode current-user routes rejected fixture/dev-header impersonation:

```text
GET /auth/me + x-wordle-dev-user-id -> HTTP 401 not_authenticated
GET /profiles/me/summary + x-wordle-dev-user-id -> HTTP 401 not_authenticated
GET /matches/history/me + x-wordle-dev-user-id -> HTTP 401 not_authenticated
POST /lobbies with valid create body + x-wordle-dev-user-id -> HTTP 401 not_authenticated
POST /auth/register with valid body -> HTTP 401 not_authenticated
```

Example response:

```json
{"data":null,"error":{"code":"not_authenticated","message":"Sign in is required for this action.","details":{"authMode":"session_required","appEnv":"preview"}},"requestId":"..."}
```

No OAuth, email provider, real credential flow, fake production auth, token minting, or external account provider was introduced.

Deployment boundary caveat: Ticket 81 says the API is not deploy-start ready yet because `apps/api` has no production `start` script and its build is currently typecheck-only. I agree with that finding.

### 2. Preview/session behavior is safe by environment mode — PASS

Automated test evidence from the full API suite:

```text
✔ requires an authenticated session for current-user auth/profile endpoints in preview mode
✔ requires an authenticated session for ranked current-user gameplay actions in preview mode
✔ requires authentication for current-user profile summary and match history in preview mode
ℹ tests 40
ℹ suites 7
ℹ pass 40
ℹ fail 0
```

Independent preview API smoke confirmed:

- dev header does not bypass session-required mode;
- current-user profile/history are `not_authenticated` rather than fake local-player data;
- write actions are gated before lobby creation;
- stub register does not emit stub tokens in preview mode.

### 3. Ranked result/rematch/share/lobby flows remain spoiler-safe — PASS

I reset/seeded the local DB, started the API, ran the ranked demo E2E, and fetched the completed result.

Ranked E2E evidence:

```text
result: ok
statuses.ready: 200
statuses.createLobby: 201
statuses.joinLobby: 201
statuses.startMatch: 201
statuses.complete: 201
statuses.result: 200
ratingDeltas: +16 / -16
leaks: []
```

Completed result action evidence:

```json
{
  "resultActionsKeys": ["links", "rematch", "share"],
  "rematch": {
    "available": false,
    "reason": "not_implemented",
    "label": "Create rematch lobby"
  },
  "share": {
    "spoilerSafe": true,
    "text": "I finished a ranked Wordle Royale match: #1 960 pts, #2 120 pts.",
    "path": "/matches/0b0b1d5a-8077-4fa1-a514-fbd82bb1cf92"
  },
  "leaks": []
}
```

Spoiler markers checked against result JSON and web body text:

```text
answerWord
answerWordHash
answerWordSaltRef
answerHash
answerSalt
normalizedWord
```

No such markers appeared in the checked API response or visible page text.

### 4. Web preview polish and responsive bounds — PASS on sampled browser smoke

I started the web app locally against the local API and smoke-checked:

- `/lobbies` invite/share disclosure;
- `/matches/:matchId` completed result actions;
- `/profile` in preview/session-required mode.

Observed `/lobbies` behavior:

```text
Invite / share
Safe invite copy
Join my Wordle Royale room B7D033: /lobbies?code=B7D033
Contains only the room code and lobby link; no account data or answers.
```

Observed `/matches/:matchId` behavior:

```text
What now?
Create rematch lobby
Not available yet: not implemented.
Share result
This text is generated from final placement and score only; no answer, hash, salt, or hidden guesses.
History / Leaderboard / Profile links
```

Observed `/profile` in preview mode:

```text
Preview profile
Current-player profile requires a real session in preview; fixture sign-in is not silently assumed.
Profile requires a session
not_authenticated: Sign in is required for this action.
```

Browser checks:

```text
/lobbies overflow=false, JS errors=0, visible spoiler leaks=[]
/matches/:matchId overflow=false, visible spoiler leaks=[]
/profile preview overflow=false, JS errors=0, visible spoiler leaks=[]
```

Visual evidence: the `/lobbies` invite/share textarea stayed inside the lobby card, with no obvious clipping or horizontal overflow at the tested desktop viewport.

### 5. Mobile Expo status — WARN, physical smoke deferred with actionable instructions

Ticket 85 provides a repeatable LAN/Expo Go smoke path and evidence for:

- mobile typecheck passing;
- local dependency/API readiness;
- LAN API readiness;
- mobile API adapter reaching health/readiness/lobbies/leaderboard/profile;
- Metro LAN startup emitting `exp://192.168.18.79:8087`;
- mobile build/config checks passing;
- `expo install --check` passing.

Ticket 85 explicitly states physical Expo Go smoke is deferred because no phone observation was available. The response includes exact Ashar phone checklist items for nav chips, board/keyboard bounds, API card, fallback labeling, and screenshots to return.

I did not claim physical-device pass.

### 6. No secrets/generated artifacts are present — PASS locally

Secret scan passed:

```text
Secret scan passed (185 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Generated-artifact checks:

```text
git diff --name-only origin/main...HEAD | grep -E '(^|/)(\.env)$|tsconfig.tsbuildinfo$|(^|/)\.next/|(^|/)\.expo/'
# no output
```

Repository search found no `tsconfig.tsbuildinfo`, `.next`, `.expo`, or real `.env` files. Env templates contain placeholders/redacted values only.

During QA, Next generated local `apps/web/next-env.d.ts` churn; I reverted it before writing this response. Final pre-response status was clean.

### 7. Local gates and GitHub PR/CI if Ticket 86 created a PR — LOCAL PASS, REMOTE CI BLOCKED

Full local gate chain passed:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:local
CI=true pnpm secret-scan
CI=true pnpm deps:check
git diff --check
git status --short --branch
```

Key output:

```text
Already up to date
Workspace scaffold validation passed (9 workspace packages).
ℹ tests 40
ℹ suites 7
ℹ pass 40
ℹ fail 0
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
Local smoke passed.
Secret scan passed (185 source/config files scanned).
Local dependency check passed.
## wave-l/preview-readiness...origin/wave-l/preview-readiness
```

Remote branch evidence:

```text
01b15194de3dd45c582fb98dd209968a01099a3a refs/heads/wave-l/preview-readiness
```

PR/CI evidence:

```text
pulls?head=Ashar-Neodym:wave-l/preview-readiness&state=all -> count 0
actions/runs?branch=wave-l/preview-readiness -> runs 0
```

This is a blocker for checkpoint readiness. The branch exists, but no PR exists and no remote CI has run.

### 8. PASS/WARN/FAIL and Wave M recommendation — COMPLETE

See findings and Wave M recommendation below.

## Commands run + exit codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Discovery and GitHub checks

```bash
git fetch origin main wave-l/preview-readiness
git status --short --branch
git log --oneline --decorate -5
git diff --stat origin/main...HEAD
```

Exit code: `0`.

```bash
git ls-remote --heads origin wave-l/preview-readiness
curl ... /pulls?head=Ashar-Neodym:wave-l/preview-readiness&state=all
curl ... /actions/runs?branch=wave-l/preview-readiness&per_page=5
```

Exit code: `0`; remote branch exists, PR count `0`, Actions run count `0`.

### Full local gates

```bash
CI=true pnpm install --frozen-lockfile && \
CI=true pnpm lint && \
CI=true pnpm typecheck && \
CI=true pnpm test && \
CI=true pnpm --filter @wordle-royale/api test && \
CI=true pnpm build && \
CI=true pnpm smoke:local && \
CI=true pnpm secret-scan && \
CI=true pnpm deps:check && \
git diff --check && \
git status --short --branch
```

Exit code: `0`.

### Local dependency reset/API/web smoke

```bash
CI=true pnpm deps:up
CI=true pnpm ranked:smoke:reset
```

Exit code: `0`.

```bash
APP_ENV=preview AUTH_MODE=session_required ENABLE_DEV_AUTH=false ENABLE_DEV_ROUTES=false PORT=4091 ... pnpm --filter @wordle-royale/api dev
curl /auth/me
curl /profiles/me/summary
curl /matches/history/me
curl -X POST /lobbies
curl -X POST /auth/register
```

Endpoint curls exited `0`; current-user/write endpoints returned HTTP `401 not_authenticated` as expected.

```bash
PORT=4092 ... pnpm --filter @wordle-royale/api dev
API_BASE_URL=http://127.0.0.1:4092 CI=true pnpm ranked:demo:e2e
curl /matches/:matchId/result
```

Exit code: `0`; ranked demo and result-actions check passed with `leaks=[]`.

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:4092 pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 4093
NEXT_PUBLIC_API_URL=http://127.0.0.1:4094 pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 4095
```

Web servers started after stopping conflicting dev server. Browser smoke completed for lobbies, match detail, and preview profile.

Cleanup:

```bash
pnpm deps:down
git checkout -- apps/web/next-env.d.ts
process list
```

Exit code: `0`; no tracked background processes remained.

## Browser/visual evidence

- `/lobbies`: safe invite/share disclosure opened; textarea contained only `Join my Wordle Royale room B7D033: /lobbies?code=B7D033`; no visible clipping or horizontal overflow.
- `/matches/:matchId`: completed result displayed disabled rematch, spoiler-safe share text, History/Leaderboard/Profile links, and no answer/hash/salt visible text.
- `/profile` in preview mode: displayed auth-required state and did not fake current-player identity.
- Browser console after checked pages: no JavaScript errors observed.

## Findings

### PASS — Preview auth boundary is enforced

Owner: Freya

`session_required` mode returns `not_authenticated` for current-user and write endpoints even when `x-wordle-dev-user-id` is supplied. Local fixture behavior remains scoped to local/test dev-stub mode.

### PASS — Ranked result actions and lobby invite/share are spoiler-safe

Owner: Ruby/Luna

Completed result actions use final placements/scores only. Rematch is honestly disabled with `not_implemented`. Lobby invite text contains only room code and route link.

### PASS — Local gates are green

Owner: all implementation agents

Full local gate chain, build, API tests, secret scan, and diff hygiene passed before response writing.

### FAIL/BLOCKER — No Wave L PR and no remote CI

Owner: Yuna/Athena/Ashar

Repro/evidence:

```text
PR count for branch wave-l/preview-readiness: 0
Actions runs for branch wave-l/preview-readiness: 0
```

Expected:

- Open PR from `wave-l/preview-readiness` into `main`.
- Verify GitHub Actions completes successfully on the PR head.
- Do not merge before Jasmine/Athena has remote CI evidence.

### FAIL/BLOCKER — API is not public-preview deploy-start ready

Owner: Yuna/Freya

Ticket 81 found and I agree:

```text
apps/api build is typecheck-only: pnpm run typecheck
apps/api has no production start script
No preview migration-run policy is locked yet
```

Expected before actual public preview deployment:

- add/verify API production build output;
- add/verify production `start` script;
- smoke the built API process, not only `pnpm --filter @wordle-royale/api dev`;
- lock preview DB migration/start policy.

### WARN — Physical Expo Go smoke is deferred

Owner: Luna/Ashar

Machine-verifiable mobile checks passed, and the LAN/Expo instructions are actionable. A real phone still needs to scan/open the Expo URL and report the checklist before claiming device-level layout pass.

## Required fixes / owner

1. **Yuna/Athena/Ashar:** open PR from `wave-l/preview-readiness` into `main` and trigger GitHub Actions.
2. **Jasmine/Athena:** re-check PR head SHA, CI status, mergeability, and diff hygiene once PR exists.
3. **Yuna/Freya:** before any actual public preview deployment, implement and smoke-test API production build/start plus preview migration policy.
4. **Ashar/Luna:** run physical Expo Go smoke using Ticket 85 instructions if mobile preview confidence is required for Wave M.

## Recommended Wave M

Do not start broad new feature work until the checkpoint is stabilized.

Recommended Wave M order:

1. **Wave L checkpoint closure:** create PR, get Actions green, merge only after remote CI verification.
2. **Preview deploy-shape slice:** add real API production build/start and built-process smoke; keep deployment manual/no-CD until Ashar approves providers/secrets.
3. **Preview auth decision:** either implement real minimal session/login or explicitly keep preview read-only/current-user-gated.
4. **Mobile device closure:** collect actual Expo Go phone screenshots/checklist result.
5. **Then** proceed to next product depth work.

## Residual risks

- Browser smoke was local dev-server smoke, not a deployed preview.
- No remote CI exists yet for Wave L.
- API readiness used `pnpm --filter @wordle-royale/api dev`; built production API start remains unverified because the script does not exist yet.
- Physical phone layout remains unverified by Jasmine.
- If new commits are pushed after this response, repeat PR head/CI/diff/secret checks.

## Final QA verdict

**FAIL / BLOCKED FOR PREVIEW CHECKPOINT.**

Local Wave L implementation behavior is promising and passes targeted QA, but Wave L is not ready to merge or claim public-preview readiness until a PR exists, GitHub Actions passes on that PR, and the API deploy-start gap is resolved or explicitly scoped out of the preview-readiness claim.
