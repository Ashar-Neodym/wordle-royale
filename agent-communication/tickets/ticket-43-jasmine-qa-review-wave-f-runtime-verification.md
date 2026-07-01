# Ticket 43 — QA Review Gates for Wave F Runtime Verification

**Assigned agent:** Jasmine
**Priority:** P0
**Type:** QA / verification
**Response file:** `agent-communication/responses/ticket-43-jasmine-qa-review-wave-f-runtime-verification-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

Independently verify Wave F after Tickets 38–42 are completed.

## Product context

Wordle Royale is targeting chess.com/lichess-for-Wordle: competitive ranked Wordle with Elo/MMR, leaderboards, server authority, and reliable web/mobile play. QA should evaluate whether the wave moves toward that standard without over-claiming production readiness.

## Dependency note

Send this only after response files for Tickets 38–42 exist. If sent early, produce gate definitions only and say final approval is pending.

## Scope

Review and verify:

1. Docker Compose v2 / local dependency verification.
2. Live local DB migration/seed/API endpoint smoke.
3. Web live API and fallback behavior.
4. Ranked gameplay persistence plan or first implementation slice.
5. Mobile simulator/device smoke or blocker.
6. Secret/env safety and free/open-source policy.
7. Root and package quality gates.

## Suggested commands

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
```

If Compose v2 is available, also run:

```bash
pnpm deps:verify
```

## Acceptance criteria

- Provides pass/fail matrix by ticket 38–42.
- Runs exact verification commands where possible.
- Separates blockers from warnings.
- Confirms whether root checks and relevant package checks pass.
- Confirms no obvious secrets, paid services, or proprietary datasets were added.
- Recommends whether Athena should commit/push the wave.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-43-jasmine-qa-review-wave-f-runtime-verification-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Free/open-source/local-first only unless approved.
- No secrets, paid services, proprietary datasets, or push.
