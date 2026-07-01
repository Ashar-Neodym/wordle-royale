# Ticket 79 — QA Review Wave K GitHub Checkpoint and Product Depth Response

Task: QA review Wave K GitHub checkpoint and product depth  
Agent: Jasmine (QA)  
Verdict: **FAIL — GitHub checkpoint/CI blocker; local product-depth verification passes**

## Summary

I independently reviewed Wave K against Ticket 79 acceptance criteria.

The local Wave K product-depth work is substantially working: root/package gates pass, API behavior tests now cover 37 tests, the profile/history read models are live and spoiler-safe in targeted API smoke checks, web `/profile`, `/profile/:handle`, `/history`, `/matches/:matchId`, and `/lobbies` render against a local API, lobby discovery metadata is present, mobile build/config passes, and secret scan passes.

However, the Wave K checkpoint cannot be approved because the GitHub side is currently blocked:

1. PR `#1` exists for `wave-k/checkpoint-ranked-loop-shell`, but its GitHub Actions run failed.
2. The failed run is for commit `f6dc44ed546b9f56d3b5b84bd51b28848effa3e2` and failed at `Workspace checks / Setup Node.js`.
3. The remote PR branch is stale relative to the current local Wave K product-depth work: current local changes from Tickets 73–78 are dirty/uncommitted on top of `f6dc44e`, so the remote PR/CI run does not verify the product-depth implementation I tested locally.

Therefore: **do not merge PR #1 as the Wave K checkpoint yet.** Fix the GitHub Actions setup failure and push the current Wave K work to the PR branch, then rerun CI.

## Acceptance criteria checked

### 1. Verify GitHub checkpoint branch/PR or direct push status and CI result if available — FAIL

Evidence:

```text
Remote branch: wave-k/checkpoint-ranked-loop-shell
Remote SHA: f6dc44ed546b9f56d3b5b84bd51b28848effa3e2
PR: https://github.com/Ashar-Neodym/wordle-royale/pull/1
PR state: open
Actions run: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28520528001
Run status: completed
Run conclusion: failure
Failing job: Workspace checks
Failing step: Setup Node.js
```

Additional blocker:

```text
## wave-k/checkpoint-ranked-loop-shell...origin/wave-k/checkpoint-ranked-loop-shell
 M agent-communication/index.md
 M apps/api/README.md
 M apps/api/src/app.module.ts
 M apps/api/src/auth/auth.controller.ts
 M apps/api/src/gameplay/gameplay.controller.ts
 M apps/api/src/lobby/lobby.controller.ts
 M apps/api/src/lobby/lobby.service.ts
 M apps/api/test/api-skeleton.test.ts
 M apps/mobile/App.tsx
 M apps/mobile/src/components/screens.tsx
 M apps/web/src/app/history/page.tsx
 M apps/web/src/app/profile/page.tsx
 M apps/web/src/components/ReportAndProfile.tsx
 M apps/web/src/components/web-shell.module.css
 M apps/web/src/lib/api-client.ts
 M packages/contracts/src/auth/schemas.ts
 M packages/contracts/src/auth/types.ts
 M packages/contracts/src/gameplay/schemas.ts
 M packages/contracts/src/gameplay/types.ts
 M packages/contracts/src/lobby/schemas.ts
?? agent-communication/responses/ticket-72-yuna-github-checkpoint-branch-pr-and-ci-monitor-response.md
?? agent-communication/responses/ticket-73-elisa-product-navigation-and-route-contracts-v2-response.md
?? agent-communication/responses/ticket-74-freya-profile-and-match-history-api-read-model-slice-response.md
?? agent-communication/responses/ticket-75-luna-web-route-depth-profile-history-match-detail-ui-response.md
?? agent-communication/responses/ticket-76-ruby-lobby-discovery-and-matchmaking-ux-slice-response.md
?? agent-communication/responses/ticket-77-luna-mobile-navigation-and-bounds-follow-up-response.md
?? agent-communication/responses/ticket-78-elisa-privacy-safe-product-analytics-event-taxonomy-plan-response.md
?? apps/api/src/profile/profile-read.service.ts
?? apps/api/test/profile-history-read-model.test.ts
?? apps/web/src/app/matches/
?? apps/web/src/app/profile/[handle]/
?? apps/web/src/components/ProfileHistory.tsx
?? docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md
```

Interpretation: PR #1 currently verifies the earlier checkpoint commit only, not the current Wave K product-depth work.

### 2. Verify no secrets/generated artifacts were committed — LOCAL PASS, REMOTE NEEDS RECHECK AFTER PUSH

Local evidence:

```text
Secret scan passed (184 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Targeted generated-artifact search found no `tsconfig.tsbuildinfo`, `.next`, or real `.env` files tracked/visible in the repo search. I also reverted the local `apps/web/next-env.d.ts` dev-server/build churn generated during QA.

Caveat: because the current Wave K changes are not pushed, this must be rechecked on the final PR commit.

### 3. Verify route depth changes: profile/history/match detail/lobbies as implemented — PASS LOCALLY

I started local PostgreSQL/Redis, reset/seeded the local DB, ran the API on `127.0.0.1:4079`, ran the web app on `127.0.0.1:4080`, completed a ranked demo match, then inspected the route-depth pages.

Verified routes:

```text
/profile
/profile/guest_player
/history
/matches/9236fdb2-83db-4dd3-b483-6224a103119e
/lobbies
```

Observed behavior:

- `/profile` rendered `Player One`, `1216 rating`, `1 rated games`, profile metrics, recent match row, and linked leaderboard profiles.
- `/profile/guest_player` rendered public `Guest Player` rating summary and recent match row.
- `/history` rendered a real recent ranked match row linking to match detail.
- `/matches/:matchId` rendered completed result detail with placements, points, and rating movement.
- `/lobbies` rendered an open room with live join/start affordances and player-count/mode copy.
- Sample route overflow checks returned `overflow=false`.
- Browser console after inspected pages reported no JS errors.

Spoiler-safety checks:

- Targeted API smoke for `/profiles/me/summary`, `/profiles/player_one/summary`, `/matches/history/me?limit=20`, and filtered `/lobbies` returned HTTP 200 and no `answerWord`, `answerWordHash`, `answerWordSaltRef`, `answerHash`, `answerSalt`, or `normalizedWord` keys in response JSON.
- `/matches/:matchId` page body contained no answer/hash/salt leak terms.
- One dev-mode HTML search on `/profile` saw `answerWords` in dev-bundled source text, not in visible page body or API response data. I do not treat that as a product response leak, but production-source-map/dev-bundle exposure should remain on the radar before public deployment.

### 4. Verify lobby discovery/matchmaking UX slice and backend tests — PASS LOCALLY

Local API tests passed with the new lobby discovery test included:

```text
✔ discovers ranked lobbies with filters, join affordance, and start readiness blockers
ℹ tests 37
ℹ suites 7
ℹ pass 37
ℹ fail 0
```

Targeted API smoke:

```json
{"path":"/lobbies?status=waiting&mode=ranked&visibility=public&limit=20","status":200,"ok":true,"leaks":[],"sample":["items","pagination"]}
```

Web `/lobbies` showed:

```text
Waiting
public
8857B0
2/4 players · 1 rounds · 120s
Rated · Ranked-compatible
Join
Start ranked
```

### 5. Verify mobile bounds/navigation follow-up if implemented — PASS BY BUILD/STATIC REVIEW, NOT DEVICE-SMOKED

Evidence:

- `CI=true pnpm build` completed `apps/mobile build: Done`.
- Ticket 77 response implements mobile IA `Play | Lobbies | Ratings | Menu`, with menu sections for Profile, History, Rules, Settings, and Server.
- Local build validates Expo config generation and TypeScript compilation.

Caveat: I did not perform a physical Expo Go phone smoke in this QA pass.

### 6. Verify root/package gates and secret scan — PASS LOCALLY

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
ℹ tests 37
ℹ suites 7
ℹ pass 37
ℹ fail 0
apps/web build: ✓ Compiled successfully
Route (app)
├ ƒ /history
├ ƒ /leaderboard
├ ○ /learn/rules
├ ƒ /lobbies
├ ƒ /matches/[matchId]
├ ƒ /play
├ ƒ /profile
├ ƒ /profile/[handle]
├ ƒ /server
└ ○ /settings
apps/mobile build: Done
apps/api build: Done
Local smoke passed.
Secret scan passed (184 source/config files scanned).
Local dependency check passed.
```

### 7. Separate PASS/WARN/FAIL and recommend Wave L — COMPLETE

See findings and Wave L recommendations below.

## Commands run + exit codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Local gates — exit 0

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

### GitHub/PR status checks — exit 0

```bash
git ls-remote --heads origin wave-k/checkpoint-ranked-loop-shell
```

Output:

```text
f6dc44ed546b9f56d3b5b84bd51b28848effa3e2 refs/heads/wave-k/checkpoint-ranked-loop-shell
```

GitHub API checks:

```text
pulls 1
1 open https://github.com/Ashar-Neodym/wordle-royale/pull/1 f6dc44ed546b9f56d3b5b84bd51b28848effa3e2
runs 1
28520528001 pull_request completed failure f6dc44ed546b9f56d3b5b84bd51b28848effa3e2
job Workspace checks completed failure https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28520528001/job/84543199768
 step 4 Setup Node.js completed failure
```

Attempting unauthenticated job-log download returned:

```text
HTTP Error 403: Forbidden
```

### Local dependency/API/web route smoke — exit 0 except where noted

```bash
CI=true pnpm deps:up
CI=true pnpm ranked:smoke:reset
```

Passed; seed applied:

```text
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

Started API on port `4079`; readiness passed:

```json
{"status":"ok","service":"wordle-royale-api","environment":"development","dependencies":{"database":{"status":"ok"},"redis":{"status":"ok"}}}
```

```bash
API_BASE_URL=http://127.0.0.1:4079 CI=true pnpm ranked:smoke:bootstrap
API_BASE_URL=http://127.0.0.1:4079 CI=true pnpm ranked:demo:e2e
```

Passed; ranked demo match completed:

```text
result: ok
matchId: 9236fdb2-83db-4dd3-b483-6224a103119e
ratingDeltas: +16 / -16
leaks: []
```

Targeted API read-model smoke — exit 0:

```text
/profiles/me/summary -> 200, leaks=[]
/profiles/player_one/summary -> 200, leaks=[]
/matches/history/me?limit=20 -> 200, leaks=[]
/lobbies?status=waiting&mode=ranked&visibility=public&limit=20 -> 200, leaks=[]
```

Started web on port `4080` and inspected route pages with browser tools. Cleanup after smoke:

```bash
pnpm deps:down
```

Passed; PostgreSQL/Redis containers and network removed.

## Browser / visual evidence

Profile page screenshot/inspection showed:

- top navigation still compact and game-site-like;
- `Player One` profile hero with `@player_one · 1216 rating · 1 rated games`;
- profile metrics card: rating `1216`, rank `#1`, games `1`, status `Provisional`;
- recent match row: `Done`, `#1 · solved · 960 pts`, `+16 MMR`;
- leaderboard rows link to player profiles;
- no obvious clipping at the tested desktop viewport.

History/match detail browser evidence:

- `/history` exposed a real recent ranked match row.
- Clicking the row navigated to `/matches/9236fdb2-83db-4dd3-b483-6224a103119e`.
- Match detail rendered completed result standings and rating deltas.
- Body text did not include active answer/hash/salt leak terms.

Lobby browser evidence:

- `/lobbies` showed a local API route state with 1 open room.
- The lobby card showed `Waiting`, `public`, code, player count, ranked-compatible copy, Join, and Start ranked controls.
- No horizontal overflow at the tested desktop viewport.

## Findings

### FAIL 1 — GitHub Actions is failing on PR #1

Owner: Yuna / GitHub operations

Repro:

1. Open `https://github.com/Ashar-Neodym/wordle-royale/pull/1`.
2. Open run `https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28520528001`.
3. Inspect `Workspace checks`.

Observed:

```text
Run conclusion: failure
Failing step: Setup Node.js
```

Expected:

- PR CI should complete successfully before the checkpoint is mergeable.

Likely owner/action:

- Yuna should inspect authenticated GitHub logs for the exact `actions/setup-node` failure, then patch `.github/workflows/pr-checks.yml` if needed.
- Possible areas to inspect: pnpm cache setup, lockfile/cache dependency path, and ordering of `pnpm/action-setup`, `actions/setup-node`, and `corepack enable`.

### FAIL 2 — Remote PR branch is stale relative to current Wave K local work

Owner: Yuna / Athena

Evidence:

- `HEAD` and `origin/wave-k/checkpoint-ranked-loop-shell` are both `f6dc44e`.
- Current working tree has modified/untracked Tickets 73–78 implementation and response files on top of that commit.
- The remote PR CI failure is for `f6dc44e`, not for the local product-depth implementation verified in this QA pass.

Expected:

- After local Wave K product-depth work is complete, push a new commit to the PR branch and verify CI on that commit.

Required fix:

1. Review/stage intended Wave K files.
2. Exclude generated artifacts and real secrets.
3. Commit the Wave K product-depth work.
4. Push to `wave-k/checkpoint-ranked-loop-shell`.
5. Rerun/verify GitHub Actions.

### WARN 1 — Mobile route/navigation depth not device-smoked

Owner: Luna / Ashar if phone confidence is required

- Mobile build/config passed.
- Static bounds and source changes look reasonable.
- I did not run Expo Go on a physical phone.

### WARN 2 — Analytics taxonomy has a known consent enum mismatch to resolve before implementation

Owner: Elisa / Freya before instrumentation

Evidence from Ticket 78/doc review:

```text
Shared contracts use product_analytics.
Prisma currently has ConsentScope.analytics_events.
```

This is acceptable for a planning ticket, but should block any future analytics-write implementation until reconciled via migration or a single explicit adapter layer.

### WARN 3 — Dev bundle contains internal source term `answerWords`

Owner: Freya/Luna before public deployment

- API responses and visible/body text did not leak answer fields.
- In dev mode, searching full page HTML on `/profile` found source-bundled text `answerWords` from development tooling, not serialized product data.
- This is not a current MVP product leak, but production build/source-map exposure should be reviewed before public deployment.

## Required fixes / owner

1. **Yuna** — inspect PR #1 GitHub Actions logs and fix the `Setup Node.js` failure.
2. **Yuna/Athena** — commit and push the current Wave K product-depth changes to `wave-k/checkpoint-ranked-loop-shell`; the current PR branch is stale.
3. **Yuna/Jasmine** — rerun/verify PR CI after the new commit; do not merge until CI is green.
4. **Elisa/Freya** — before implementing analytics events, reconcile `product_analytics` vs `analytics_events` consent naming.
5. **Luna/Ashar optional** — perform a physical Expo Go smoke if phone layout confidence is required before Wave L.

## Recommended Wave L

1. **Checkpoint stabilization first:** make PR #1 green and update it with all Wave K work.
2. **CI observability:** document exact CI failure cause/fix in the next Yuna response; consider making branch pushes run checks too, not only PR and `main`, if the team wants earlier remote feedback.
3. **Product-depth hardening:** add web smoke tests or lightweight route smoke scripts for `/profile`, `/history`, `/matches/:matchId`, and `/lobbies` once CI is stable.
4. **Optional API polish:** consider a one-call `GET /matches/:matchId/summary` only if match detail needs simpler server-side composition.
5. **Analytics prep:** reconcile consent enum naming before any instrumentation write path.

## Residual risks

- GitHub job logs were not accessible unauthenticated (`403`), so I could identify the failed step but not the exact internal error text.
- Local verification used dev servers and local fixture data, not a deployed preview.
- The final pushed PR commit has not yet been created for the local Wave K product-depth work.
- Physical-device mobile behavior remains unverified by Jasmine.

## Final QA verdict

**FAIL** for Wave K checkpoint readiness because PR #1 CI is red and the PR branch is stale relative to the current local Wave K product-depth work.

**Local product-depth implementation passes targeted QA** and can proceed after the checkpoint/CI blockers are fixed and reverified.
