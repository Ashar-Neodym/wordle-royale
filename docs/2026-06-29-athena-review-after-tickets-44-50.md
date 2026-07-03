# Athena Review After Tickets 44–50 — Wave G First Playable Ranked Loop Foundation

Date: 2026-06-29

## Verdict

Wave G is **PASS with warnings**.

Athena independently inspected Tickets 44–50 responses and reran the representative verification gates. The project now has normalized Compose helper scripts, ranked gameplay API contracts, mobile API readiness UI, ranked REST endpoints, internal rating finalization, web live lobby/ranked-start flow, and Jasmine QA passed the wave.

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
```

All commands exited successfully.

Key evidence:

- `pnpm smoke:local` now resolves Compose using the normalized helper and validates config.
- `pnpm deps:check` passed without manually exporting `DOCKER_CONFIG`.
- API tests passed: 22/22.
- Root build passed.
- Web build passed.
- Mobile build passed.
- Secret scan passed: 161 source/config files scanned.
- Safe seed dry-run remains fixture-only and spoiler-safe.

## Ticket-by-ticket status

| Ticket | Owner | Status | Notes |
|---|---|---|---|
| 44 | Yuna | PASS | Compose normalization scripts/docs added; local smoke/deps checks work. |
| 45 | Elisa | PASS | Ranked REST/state/rating contract defined. |
| 46 | Luna | PASS with caveat | Mobile readiness card and safe-area normalization added; phone smoke not repeated by Athena. |
| 47 | Freya | PASS | Ranked start/state/guess REST endpoints implemented and tested. |
| 48 | Ruby | PASS | Rating finalization service updates rating profiles/events and match reports; no public route yet. |
| 49 | Luna | PASS with UX warning | Web live create/join/start flow works, but current UI direction does not match Ashar's desired human/lichess feel. |
| 50 | Jasmine | PASS with warnings | Independent QA found no P0/P1 blockers. |

## User product/design correction

Ashar reviewed the UI and said it looks too "AI generated." The desired direction is closer to **lichess**: human, calm, functional, minimal, game-first, community/sports-site style — not glossy AI SaaS/dashboard style.

This is now a product requirement for Wave H. UI work should avoid:

- generic gradient hero sections,
- over-polished SaaS cards everywhere,
- excessive marketing copy,
- loud neon/glassmorphism visuals,
- AI-generated-feeling decorative panels.

Preferred direction:

- lichess-like restrained layout,
- neutral board-first interface,
- compact navigation/sidebar areas,
- clear lobby/ranked controls,
- readable tables/lists,
- human copy that sounds like a real game site,
- strong focus on playing, ratings, profiles, and community.

## Remaining warnings / follow-ups

1. Web UI style must be redirected before more polish work.
2. Web live ranked flow starts matches and shows state, but does not yet provide full live guess gameplay UI and result finalization.
3. Rating finalization is internal; no public completion/result endpoint triggers it yet.
4. Leaderboard/profile rating reads are not yet first-class UI/API flows.
5. Auth is still local/stubbed.
6. Local DB state can accumulate smoke lobbies/matches; repeatable reset/isolation should improve.
7. Mobile readiness exists, but mobile live lobby/gameplay is not implemented yet.

## Wave H recommendation

Wave H should combine a **visual direction reset** with the missing end-to-end ranked loop pieces:

- first lock a lichess-style UI direction,
- add public result/finalization and leaderboard APIs,
- implement web guess/result/leaderboard UI in the new visual style,
- add repeatable DB reset/smoke support,
- then QA the complete loop.
