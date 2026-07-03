# Athena Review After Tickets 51–57 — Wave H Lichess-Style Ranked Loop

Date: 2026-06-30

## Verdict

Wave H is **PASS with warnings**.

Athena verified Tickets 51–57 responses, read Jasmine's QA, and reran the representative repo gates. Wave H materially improved both product direction and gameplay completeness: the web UI moved toward a calmer lichess-style game-first shell, ranked match completion/result endpoints exist, leaderboard/rated profile reads exist, web ranked guess/result/leaderboard UI exists, local ranked reset exists, mobile has a read-only live preview, and Jasmine found no P0/P1 blockers.

## Athena verification commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
pnpm --filter @wordle-royale/api db:validate
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/api db:seed:dry-run
pnpm deps:up
pnpm ranked:smoke:reset
pnpm deps:verify
```

All commands exited successfully.

Key evidence:

- API tests passed: 29/29.
- Root build passed.
- Web build passed.
- Mobile build passed.
- Secret scan passed: 166 source/config files scanned.
- `pnpm smoke:local` and `pnpm deps:check` passed.
- `pnpm ranked:smoke:reset` reset local Compose Postgres and reseeded fixtures.
- `pnpm deps:verify` confirmed Postgres/Redis healthy and cleaned containers down.

## Ticket-by-ticket status

| Ticket | Owner | Status | Notes |
|---|---|---|---|
| 51 | Luna | PASS | Lichess-style UI direction doc and first web shell reset. Human acceptance still useful. |
| 52 | Freya | PASS | Match completion/result endpoints wired to rating finalization. |
| 53 | Ruby | PASS | Leaderboard and rated profile read model implemented. |
| 54 | Luna | PASS with UX warning | Web can submit guesses, show result/rating/leaderboard. Fixture/demo board still visually noisy below live board. |
| 55 | Yuna | PASS with warning | Ranked DB reset exists. It does not explicitly seed/ensure local stub auth users before direct lobby creation. |
| 56 | Luna | PASS with caveat | Mobile live preview/readiness builds. No fresh phone smoke by Athena. |
| 57 | Jasmine | PASS with warnings | Independent QA found no P0/P1 blockers. |

## Main warnings to carry forward

1. Local live smoke still needs true multi-user/dev-auth or admin helper; Jasmine had to terminalize the second participant directly in DB.
2. After `pnpm ranked:smoke:reset`, direct `POST /lobbies` can 500 unless `/auth/me` or `/profile/me` first creates the stub local user. The reset path should seed/ensure local auth users.
3. Web completed-match UI still shows fixture/demo board content below the live board, which can confuse the product feel.
4. Mobile live preview passed build checks but needs a real phone smoke if Ashar wants runtime confirmation.
5. Auth is still local/stubbed; this is okay for MVP foundations but blocks realistic multi-player testing.
6. Ranking algorithm remains placeholder `placement_mmr_v1` rather than full Elo/Glicko.

## Wave I recommendation

Wave I should stabilize the first playable loop so it can be demonstrated without manual DB edits:

- fix local stub-user seeding after reset,
- add dev multi-user/test-helper flow,
- make match progression/completion natural without DB terminalization,
- refine the lichess-style web UI and remove fixture noise from live-match view,
- repeat phone smoke for mobile if available,
- then have Jasmine QA the end-to-end demo loop.
