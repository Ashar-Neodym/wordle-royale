# Ticket 57 — QA Review Wave H Lichess-Style Ranked Loop Response

Task: QA review Wave H lichess-style UI reset and complete ranked loop
Agent: Jasmine (QA)
Verdict: **PASS with warnings**

## Summary

I independently reviewed Wave H after Tickets 51–56 responses were present. I read the Wave G Athena decision document, current ticket index, Wave H handoffs, inspected the working-tree change surface, reran the requested root/package gates, verified Docker/Compose and the new ranked smoke DB reset path, exercised the live ranked REST loop against local Postgres/Redis, browser-smoked the web live match/result/leaderboard UI and fixture fallback, checked spoiler-safety surfaces, and verified mobile build output.

Wave H materially advances the product toward Ashar's correction: the web shell is calmer, game-first, and closer to a lichess-style utility/game site than the earlier glossy AI/SaaS direction. The ranked flow now reaches accepted guesses, completion/result reads, idempotent rating finalization, and leaderboard/profile read models.

I found **no P0/P1 blocker** for the Wave H first playable ranked loop scope, but I found one important local-dev warning: after `pnpm ranked:smoke:reset`, direct `POST /lobbies` can 500 unless `/auth/me` or `/profile/me` has first created the stub local user. The web page currently calls `/auth/me` during its API snapshot, so the browser flow works, but the reset/smoke path should seed or ensure stub users explicitly before Wave I.

## Ticket-by-ticket matrix

| Ticket | Area | QA status | Evidence | Blockers | Warnings |
|---|---|---:|---|---|---|
| 51 | Lichess-style human UI direction | PASS | Response present; doc and web CSS/page/component surface inspected; browser visual smoke confirms calmer dark game-first layout | None | Final human acceptance by Ashar is still pending |
| 52 | Match completion/result/rating finalization endpoints | PASS | API tests 29/29 passed; live HTTP smoke completed match and fetched result | None | Live terminalization still needs direct DB manipulation for second participant because local auth is single-stub-user oriented |
| 53 | Leaderboard/rated profile read model | PASS | API tests include leaderboard/profile; live `GET /leaderboard?limit=5` returned 2 rated rows after completion; `/profiles/player_one/rating` returned rating 1232 | None | Ranking algorithm remains placeholder `placement_mmr_v1` |
| 54 | Web ranked guess/result/leaderboard UI | PASS | Browser live match page showed live board, server feedback, result panel, rating deltas, leaderboard rows; console had 0 JS errors | None | Completed server match still shows a fixture/demo board section below the live board, which can be visually noisy |
| 55 | Repeatable ranked smoke DB reset/dev script | PASS with warning | `pnpm ranked:smoke:reset` reset local Postgres schema and reseeded fixtures; `pnpm deps:verify` passed | None | Reset does not independently seed stub UUID auth users before direct lobby creation; web flow masks this via `/auth/me` |
| 56 | Mobile live lobby preview/readiness smoke | PASS with evidence caveat | `pnpm --filter @wordle-royale/mobile build` passed in the root gate chain | None | I did not perform phone/Expo Go visual acceptance in this session |

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Verify Tickets 51–56 responses and changed files | PASS | All six response files present/read; working-tree status/diff surface inspected |
| Re-run root/package gates | PASS | Requested gate chain exited 0 |
| Verify web UI moved away from AI/SaaS styling | PASS | Browser visual smoke showed flat dark surfaces, compact nav, board-first ranked play area, restrained copy, and no glossy gradient/glass hero treatment |
| Verify ranked completion/result/rating route | PASS | Live `POST /matches/:matchId/complete` returned 201 with rating event; repeated completion returned 201; rating event rows remained 2 |
| Verify leaderboard/rated profile read model | PASS | Live leaderboard returned 2 entries; profile rating returned 1232 for `player_one` |
| Verify web live ranked guess/result/leaderboard flow and fallback | PASS | Live browser page showed completed match, result deltas, leaderboard rows; API-off fallback showed fixture fallback and disabled live actions |
| Verify repeatable ranked smoke/reset path | PASS with warning | Reset script and Compose verification passed; warning below on stub-user prerequisite |
| Verify mobile build/readiness/live preview | PASS with caveat | Mobile build passed; no phone smoke repeated |
| Separate blockers from warnings | PASS | See Findings / Required fixes |
| List files changed | PASS | See Files changed / inspected |
| Write response path | PASS | This file written at the requested path |
| Do not push | PASS | No push performed |

## Commands run and results

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

### Context/discovery

```bash
read_file docs/2026-06-29-athena-review-after-tickets-44-50.md
read_file agent-communication/index.md
search_files agent-communication/responses 'ticket-5[1-6]-*.md'
read_file agent-communication/responses/ticket-51-lichess-style-human-ui-direction-and-web-redesign-plan-response.md
read_file agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md
read_file agent-communication/responses/ticket-53-leaderboard-and-rated-profile-read-model-slice-response.md
read_file agent-communication/responses/ticket-54-web-ranked-guess-result-and-leaderboard-ui-lichess-style-response.md
read_file agent-communication/responses/ticket-55-repeatable-ranked-smoke-db-reset-and-dev-script-response.md
read_file agent-communication/responses/ticket-56-mobile-live-lobby-preview-and-readiness-smoke-response.md
git diff --stat
git diff --name-only
git status --short
search_files content 'answerWord|answer_word|answerWordHash|answerWordSalt|salt|plaintext|solution' apps/web/src
```

Result: Ticket 51–56 responses were present. Web source search only found the player-facing statement `No answer, hash, or salt is exposed during play`; no web answer/hash/salt rendering surfaced.

### Requested root/package gates

```bash
pnpm install --frozen-lockfile && \
pnpm lint && \
pnpm typecheck && \
pnpm test && \
pnpm build && \
pnpm smoke:local && \
pnpm secret-scan && \
pnpm deps:check && \
pnpm --filter @wordle-royale/api test && \
pnpm --filter @wordle-royale/web build && \
pnpm --filter @wordle-royale/mobile build
```

Exit code: `0`.

Key evidence excerpts:

```text
Scope: all 10 workspace projects
Already up to date
Done in 354ms using pnpm v11.1.1
Workspace scaffold validation passed (9 workspace packages).
apps/api build: Done
Local smoke passed. This smoke test validates local config only; it does not start app services.
Secret scan passed (166 source/config files scanned).
Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.
ℹ tests 29
ℹ suites 6
ℹ pass 29
ℹ fail 0
apps/web build: ✓ Compiled successfully
apps/mobile build: $ expo config --type public >/dev/null && tsc --noEmit -p tsconfig.json
```

### Compose/reset verification

```bash
pnpm deps:up && pnpm ranked:smoke:reset && pnpm deps:verify
```

Exit code: `0`.

Key evidence excerpts:

```text
Container wordle-royale-postgres Started
Container wordle-royale-redis Started
Ranked smoke local DB reset guard passed.
Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.
The PostgreSQL database "wordle_royale_local" schema "public" at "localhost:5432" was successfully reset.
Applied local fixture seed: en-5-test-vfixture.001
Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.
```

`pnpm deps:verify` intentionally ended by bringing Compose down. I then restarted dependencies and reset again for live browser/API smoke:

```bash
pnpm deps:up && pnpm ranked:smoke:reset
```

Exit code: `0`.

### API dev server readiness

Started API:

```bash
PORT=3057 DATABASE_URL='<local compose postgres url>' pnpm --filter @wordle-royale/api dev
```

Readiness check:

```bash
curl -fsS http://127.0.0.1:3057/readyz
```

Result:

```json
{"data":{"status":"ok","service":"wordle-royale-api","environment":"development","dependencies":{"database":{"status":"ok"},"redis":{"status":"ok"}}},"error":null}
```

### Live ranked REST smoke

I exercised the live API with local Postgres/Redis:

1. `GET /auth/me` to create the local stub player.
2. `POST /lobbies` public rated room.
3. `POST /lobbies/:id/join` local guest.
4. `POST /matches/ranked/start`.
5. `POST /matches/:matchId/rounds/:roundId/guesses` with `CRANE`.
6. `GET /matches/:matchId/state`.
7. `GET /matches/:matchId/result` while active; correctly returned `400 match_result_not_ready`.
8. Direct local DB terminalization of both participants, matching the current known stub-auth smoke limitation.
9. `POST /matches/:matchId/complete`.
10. Repeated `POST /matches/:matchId/complete` for idempotency.
11. `GET /matches/:matchId/result`.
12. `GET /leaderboard?limit=5`.
13. `GET /profiles/player_one/rating`.
14. Queried `RatingEvent` count for the match.

Result:

```json
{
  "lobbyCode": "2FB2FB",
  "matchId": "5a675b8e-8ed4-40a6-874c-7dfe9a4edf42",
  "roundId": "b39674a1-cf1d-43d4-94c6-daa158ed0bf4",
  "guessStatus": 201,
  "guessAccepted": true,
  "stateStatus": 200,
  "activeResultStatus": 400,
  "activeResultCode": "match_result_not_ready",
  "completeStatus": 201,
  "ratingEventPresent": true,
  "repeatCompleteStatus": 201,
  "resultStatus": 200,
  "leaderboardEntries": 2,
  "profileRating": 1232,
  "ratingEvents": "2",
  "leaks": []
}
```

Notes:

- `ratingEvents: "2"` after repeated completion confirms no duplicate rating rows for the two-player match.
- `leaks: []` confirms the serialized live REST payloads I checked did not contain `answerWordHash`, `answerWordSaltRef`, `normalizedWord`, or `answerWord`.
- The current live smoke still needs direct DB terminalization for the second participant because local auth/user switching is not implemented yet.

### Browser live UI smoke

Started web:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:3057 pnpm --filter @wordle-royale/web exec next dev --hostname 127.0.0.1 --port 3058
```

Opened:

```text
http://127.0.0.1:3058/?matchId=5a675b8e-8ed4-40a6-874c-7dfe9a4edf42
```

Observed in browser snapshot/visual smoke:

- Title: `Wordle Royale — Rated word games`.
- Nav: `Play`, `Lobbies`, `Leaderboard`, `Profile`.
- Status: `Server online · ok`, `database: ok · redis: ok`.
- Main live region: `LIVE BOARD`, `Current game`, `Server game`, `completed`.
- Live grid showed submitted guess feedback for `CRANE`.
- Result panel showed `1216 → 1232 (+16)` and `1184 → 1168 (-16)`.
- Leaderboard showed `Player One` and `Guest Player` rating rows.
- Text explicitly stated `No answer, hash, or salt is exposed during play.`
- Visual assessment: calm dark flat surfaces, restrained buttons, compact nav, lobby rail + board-first layout. This is meaningfully closer to lichess-style functional game UI than the previous glossy AI/SaaS dashboard direction.

Browser console:

```text
JS errors: 0
Messages: React DevTools info, HMR connected
```

### Browser fallback smoke

After killing the API process, opened:

```text
http://127.0.0.1:3058/
```

Observed:

- `FIXTURE FALLBACK` label.
- Alert: `Showing local fixtures because http://127.0.0.1:3057 is unavailable: fetch failed`.
- Lobbies: `Server offline ... Showing fixture rooms; live actions are disabled.`
- `Create rated room` disabled.
- `Join live code` disabled.
- `Leaderboard API unavailable: fetch failed. Showing fixture preview.`

Browser console:

```text
JS errors: 0
Messages: React DevTools info, HMR connected
```

### Cleanup

```bash
# stopped API background process
# stopped web background process
pnpm deps:down
docker ps --filter 'name=wordle-royale' --format '{{.Names}} {{.Status}}'
```

Exit code: `0`. Final Docker query returned no project containers.

I also reverted the Next dev-server-generated change to `apps/web/next-env.d.ts` so QA did not leave that local artifact modified.

## Findings

### Blockers

None found for Wave H scope.

### Warnings / defects

1. **Local reset path has a hidden stub-user prerequisite.**
   - Severity: warning / should fix before Wave I automation.
   - Repro: run `pnpm deps:up && pnpm ranked:smoke:reset`, start API, then call `POST /lobbies` directly before `GET /auth/me` or `GET /profile/me`.
   - Observed earlier in this QA: `POST /lobbies -> 500 internal_server_error` until `/auth/me` creates the stub `11111111-...` user. The web flow masks this because its startup API snapshot calls `/auth/me` first.
   - Likely owner: Yuna/Freya.
   - Recommended fix: make `ranked:smoke:reset` seed the local stub host/guest users, or make lobby creation ensure the stub host exists before insert. Add a smoke assertion that direct reset → create lobby works without an incidental `/auth/me` side effect.

2. **Live completion still requires direct DB help for the second local participant.**
   - Severity: warning; previously known from Ticket 52.
   - Public APIs can complete/finalize once participants are terminal, but local smoke cannot naturally terminalize both participants because auth is single-stub-user oriented.
   - Likely owner: Freya/Yuna.
   - Recommended fix: add a dev-only user switch/admin smoke helper, or implement true multi-user auth before relying on fully public E2E completion smoke.

3. **Completed live match page still includes fixture/demo sections below the live board.**
   - Severity: UX warning.
   - The primary live board/result/leaderboard are clear, but the lower fixture board/lobby sections can make the completed live page feel noisy or mixed-mode.
   - Likely owner: Luna.
   - Recommended fix: when a live `matchId` is active/completed, visually demote or hide fixture demo sections unless explicitly in practice/demo mode.

4. **Human visual acceptance is pending.**
   - Severity: product warning.
   - I can verify the UI moved away from glossy AI/SaaS styling, but Ashar should still review the final look against his lichess-style taste.

5. **Mobile phone smoke not repeated.**
   - Severity: evidence caveat.
   - Mobile build passed locally, but I did not perform Expo Go or physical-device visual smoke.

6. **Broad uncommitted working tree remains.**
   - Severity: process warning.
   - Many tracked/untracked files from earlier tickets remain in the working tree. Athena should do a final wave-level diff review before commit.

## Security / spoiler / scope review

- `pnpm secret-scan` passed: `166 source/config files scanned`.
- No paid SaaS/cloud/proprietary dependency was introduced by my QA work.
- I did not create real `.env` files.
- I did not push.
- REST/browser smoke did not expose `answerWordHash`, `answerWordSaltRef`, `normalizedWord`, or `answerWord` in the checked live payloads.
- Web source search found only the copy statement about not exposing answer/hash/salt.
- The local DB direct update was QA-only to work around the known stub multi-user limitation; it was not a product code change.

## Files changed / inspected

### Response files inspected

- `agent-communication/responses/ticket-51-lichess-style-human-ui-direction-and-web-redesign-plan-response.md`
- `agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md`
- `agent-communication/responses/ticket-53-leaderboard-and-rated-profile-read-model-slice-response.md`
- `agent-communication/responses/ticket-54-web-ranked-guess-result-and-leaderboard-ui-lichess-style-response.md`
- `agent-communication/responses/ticket-55-repeatable-ranked-smoke-db-reset-and-dev-script-response.md`
- `agent-communication/responses/ticket-56-mobile-live-lobby-preview-and-readiness-smoke-response.md`

### Key source/docs inspected

- `docs/2026-06-29-athena-review-after-tickets-44-50.md`
- `agent-communication/index.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- `package.json`
- `docker-compose.yml`
- `scripts/reset-ranked-smoke-db.mjs`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/src/lobby/lobby.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/src/leaderboard/leaderboard.controller.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `apps/api/test/leaderboard-controller.test.ts`
- `apps/api/test/leaderboard-read-model.test.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/actions.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/GameplayScreen.tsx`
- `apps/web/src/components/LobbyScreens.tsx`
- `apps/web/src/components/ReportAndProfile.tsx`
- `apps/web/src/components/StatusPanels.tsx`
- `apps/web/src/components/web-shell.module.css`
- `apps/mobile/App.tsx`
- `apps/mobile/src/lib/api-client.ts`
- `apps/mobile/src/components/screens.tsx`

### Files changed by this QA ticket

- `agent-communication/responses/ticket-57-qa-review-wave-h-lichess-style-ranked-loop-response.md`

No product source files were intentionally changed by Jasmine. The transient `apps/web/next-env.d.ts` dev-server change was reverted before completion.

## Recommended Wave I

1. **Make smoke reset fully self-contained.** Seed/ensure stub host + guest users during `ranked:smoke:reset`, then add a scripted smoke that proves reset → create lobby → join → start → guess works without calling `/auth/me` first.
2. **Add a real dev multi-user smoke path.** Either dev auth switching or a dev-only terminalization/helper route so completion/rating E2E no longer requires direct DB edits.
3. **Clean live-vs-fixture page modes.** When live match data is present, make fixture sections clearly secondary/practice-only or hide them.
4. **Have Ashar visually review the lichess-style reset.** QA passes directionally, but final product taste belongs to Ashar.
5. **Run phone/Expo Go mobile smoke.** Verify the live preview and fallback copy on a real device/emulator.
6. **Athena final diff review before commit.** The working tree is broad and should be consolidated carefully.

## Evidence / Result

Wave H is **approved to proceed with warnings**. The main ranked loop now works locally through web/API with completion, result, ratings, leaderboard, and fallback behavior verified. The most important pre-Wave-I fix is making the reset/smoke path independent of incidental `/auth/me` side effects and reducing dependence on direct DB edits for multi-participant completion smoke.

## Risks / Blockers

Blockers: None.

Residual risks:

- Local stub auth remains a product/testing limitation.
- Rating model is placeholder/provisional.
- Human visual acceptance and phone smoke are pending.
- Large uncommitted working tree increases merge/review risk.
