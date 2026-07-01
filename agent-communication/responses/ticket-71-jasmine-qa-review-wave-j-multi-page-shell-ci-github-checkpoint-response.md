# Ticket 71 — QA Review Wave J Multi-Page Shell, CI, and GitHub Checkpoint Response

Task: QA review Wave J multi-page shell, CI, and GitHub checkpoint
Agent: Jasmine (QA)
Verdict: **CONDITIONAL PASS**

## Summary

Wave J is functionally in good shape: the reset Compose resolver blocker from Wave I is fixed, the multi-page web shell exists and works across the intended routes, the new navigation/dropdowns are usable and visually aligned with the calm lichess-style direction, the root/package gates pass, the local ranked reset/bootstrap path passes without a manual `DOCKER_CONFIG` export, and the GitHub Actions workflow hardening is safe and appropriately CI-only.

I am keeping the verdict at **conditional pass** rather than clean PASS for one checkpoint-readiness issue: `git diff --check` reports a whitespace error in `apps/mobile/README.md` (`new blank line at EOF`). This is small, but it should be fixed before Athena/Ashar makes the GitHub checkpoint commit/push. No commit/push has occurred yet, so there is no remote commit or CI run to verify.

## Acceptance criteria checked

1. **`pnpm ranked:smoke:reset` works without manual `DOCKER_CONFIG` export** — PASS.
   - Verified with `CI=true env -u DOCKER_CONFIG pnpm deps:up && CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:reset`.
   - The reset script now uses the shared Compose resolver and reported `Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker` automatically.

2. **Multi-page/dropdown web shell usable and lichess-style/human** — PASS.
   - Verified routes: `/`, `/play`, `/lobbies`, `/leaderboard`, `/profile`, `/learn/rules`, `/server`, `/settings`, `/history`.
   - Verified desktop Play dropdown opens and displays `Play rated`, `Create lobby`, and `Join by code` without visible clipping.
   - The UI remains calm, dark, compact, game-site-like, and not glossy/SaaS-like.

3. **Responsive web/mobile bounds improved** — PASS with caveat.
   - Web at the available browser viewport had no horizontal overflow on sampled routes (`documentElement.scrollWidth === clientWidth`).
   - Visual inspection of home/dropdown did not show clipping or out-of-bounds layout.
   - Mobile build/config passed, and Ticket 68's static bounds math/source changes are plausible.
   - I did not rerun a physical-device Expo Go smoke in this QA pass.

4. **GitHub checkpoint plan and CI workflow safe** — PASS with pre-push cleanup condition.
   - Workflow uses PR and `main` push triggers, read-only contents permission, concurrency, Node 20, pnpm 11.1.1, frozen install, root gates, API behavior tests, build, smoke, deps config check, and secret scan.
   - No deployment/CD, paid services, service containers, or secret-dependent jobs were added.
   - Remote `origin` is reachable, but no commit/push occurred.

5. **Root/package gates and secret scan** — PASS.
   - Full local gate chain passed.
   - Secret scan passed: 179 source/config files scanned.

6. **Remote branch/commit and CI status if push occurred** — NOT APPLICABLE.
   - No new commit/push was made.
   - `main...origin/main` still points at previous remote state; recent commit remains `88aaf00 feat: complete wave D0 foundations`.
   - `gh` is not installed in this shell, so CI status could not be checked through GitHub CLI even if a run existed.

7. **If no push occurred, state why and whether Athena can push next** — CONDITIONALLY YES.
   - No push occurred because Ticket 69 intentionally prepared the checkpoint but did not perform an external side effect without explicit approval.
   - Athena can push next after fixing the whitespace finding below and rerunning the final short checkpoint gates (`git diff --check`, relevant build/test/secret scan if desired).

## Commands run + exit codes

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Broad local gate chain — exit 0

```bash
CI=true pnpm install --frozen-lockfile && \
CI=true pnpm lint && \
CI=true pnpm typecheck && \
CI=true pnpm test && \
CI=true pnpm build && \
CI=true pnpm smoke:local && \
CI=true pnpm secret-scan && \
CI=true pnpm deps:check && \
CI=true pnpm --filter @wordle-royale/api test && \
CI=true pnpm --filter @wordle-royale/web build && \
CI=true pnpm --filter @wordle-royale/mobile build
```

Key output:

```text
Already up to date
Workspace scaffold validation passed (9 workspace packages).
apps/web build: ✓ Compiled successfully
Route (app)
├ ○ /history
├ ƒ /leaderboard
├ ○ /learn/rules
├ ƒ /lobbies
├ ƒ /play
├ ƒ /profile
├ ƒ /server
└ ○ /settings
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (179 source/config files scanned).
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
ℹ tests 32
ℹ suites 6
ℹ pass 32
ℹ fail 0
```

### Reset without manual Docker config — exit 0

```bash
CI=true env -u DOCKER_CONFIG pnpm deps:up && \
CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:reset
```

Key output:

```text
$ node scripts/docker-compose.mjs up -d postgres redis
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.

$ node scripts/reset-ranked-smoke-db.mjs
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Local Compose PostgreSQL is accepting connections.
DROP SCHEMA
CREATE SCHEMA
🚀  Your database is now in sync with your Prisma schema. Done in 7.96s
Applied local fixture seed: en-5-test-vfixture.001
Ranked smoke local DB reset and fixture seed completed.
```

### API readiness and bootstrap — exit 0

Started API locally on port `4071`, then ran:

```bash
API_BASE_URL=http://127.0.0.1:4071 CI=true env -u DOCKER_CONFIG pnpm ranked:smoke:bootstrap
```

Key output:

```json
{
  "result": "ok",
  "apiBaseUrl": "http://127.0.0.1:4071",
  "note": "Created and joined a rated lobby without calling /auth/me first.",
  "lobbyCode": "924311",
  "members": [
    { "userId": "11111111-1111-4111-8111-111111111111", "handle": "player_one", "role": "host" },
    { "userId": "22222222-2222-4222-8222-222222222222", "handle": "guest_player", "role": "player" }
  ]
}
```

### Web route/browser smoke — pass

Started web locally on port `4072` with API pointed at `4071`, then inspected:

```text
http://127.0.0.1:4072/
http://127.0.0.1:4072/play
http://127.0.0.1:4072/lobbies
http://127.0.0.1:4072/leaderboard
http://127.0.0.1:4072/profile
http://127.0.0.1:4072/learn/rules
http://127.0.0.1:4072/server
http://127.0.0.1:4072/settings
http://127.0.0.1:4072/history
```

Browser console checks:

```text
console_messages: []
js_errors: []
total_errors: 0
```

Sample overflow checks:

```text
/play: scrollWidth=1265, clientWidth=1265, overflow=false
/server: scrollWidth=1265, clientWidth=1265, overflow=false
/history: overflow=false
```

### Git / remote / workflow checks

```bash
git status --short --branch
git remote -v
git log --oneline -5
git ls-remote --heads origin main
```

Result: exit 0.

Key output:

```text
## main...origin/main
origin git@github.com:Ashar-Neodym/wordle-royale.git (fetch)
origin git@github.com:Ashar-Neodym/wordle-royale.git (push)
88aaf00 feat: complete wave D0 foundations
origin main reachable
```

`gh` status:

```text
gh: not installed / not found in PATH
```

### Whitespace diff check — exit 2

```bash
git diff --check -- .github/workflows/pr-checks.yml .gitignore scripts/reset-ranked-smoke-db.mjs apps/web apps/mobile
```

Output:

```text
apps/mobile/README.md:26: new blank line at EOF.
```

### Cleanup — exit 0

```bash
pnpm deps:down
```

Key output:

```text
Container wordle-royale-redis Removed
Container wordle-royale-postgres Removed
Network wordle-royale_default Removed
```

## Browser / visual evidence

- Home page rendered as a compact game-site front door with top nav, `Play Wordle Royale.`, direct `Play rated` / `Find lobby` / `Rules` actions, route cards, and a secondary status strip.
- Desktop navigation displays: `Wordle Royale | Play ▾ | Lobbies | Leaderboard | Learn ▾ | Profile ▾ | Server`.
- Opening the Play dropdown showed three aligned menu items: `Play rated`, `Create lobby`, and `Join by code`; no visible clipping or off-screen menu behavior at the tested viewport.
- `/play` has board-first ranked workspace copy and keeps server authority/spoiler safety messaging.
- `/lobbies` separates room discovery from the board and still exposes live create/join/start actions.
- `/learn/rules` provides static rules/scoring/fair-play content.
- `/settings` and `/history` are honest placeholders and explicitly do not claim production auth/history functionality.
- Visual style remains calm, minimal, and human/game-like rather than glossy dashboard/SaaS.

## Findings

### 1. Pre-push cleanup needed: whitespace error in mobile README

Severity: Low / checkpoint hygiene
Owner: Luna or Yuna

Repro:

```bash
git diff --check -- .github/workflows/pr-checks.yml .gitignore scripts/reset-ranked-smoke-db.mjs apps/web apps/mobile
```

Actual:

```text
apps/mobile/README.md:26: new blank line at EOF.
```

Expected:

- `git diff --check` should be clean before a GitHub checkpoint commit/push.

Required fix:

- Remove the extra blank line at EOF in `apps/mobile/README.md`, then rerun `git diff --check`.

### 2. No remote CI evidence yet because no commit/push occurred

Severity: Informational
Owner: Yuna/Athena

- Ticket 69 intentionally did not push without explicit approval.
- Therefore I could verify local CI-equivalent commands and remote reachability, but not a GitHub Actions run.
- After the checkpoint commit/push, verify Actions status from GitHub UI or install/use `gh` if available.

### 3. Physical mobile bounds not independently verified on device

Severity: Low / residual
Owner: Luna/Ashar if phone confirmation is required

- Mobile build/config checks passed.
- Ticket 68's static bounds changes are reasonable.
- I did not perform a real-device Expo Go smoke during this QA pass.

## Required fixes / owner

1. **Luna or Yuna** — remove the extra blank line at EOF in `apps/mobile/README.md`; rerun `git diff --check`.
2. **Yuna/Athena** — after cleanup and explicit approval, create the GitHub checkpoint commit/push, then verify GitHub Actions status.

## Residual risks

- The repo still has a very large dirty/untracked working tree from multiple prior waves; I verified Wave J gates and surfaces but did not normalize history.
- CI is intentionally config-only for Docker dependencies; it does not start PostgreSQL/Redis or run local dependency service verification in GitHub Actions.
- Real production auth/multi-user flows remain future scope; local dev helpers and fixture data are still MVP scaffolding.
- Mobile physical device layout is not freshly verified by Jasmine.

## Verdict detail

**CONDITIONAL PASS**: Wave J meets the substantive product/CI/demo-stability criteria. Fix the one whitespace checkpoint issue before committing/pushing, then Athena can proceed with the GitHub checkpoint and verify CI.
