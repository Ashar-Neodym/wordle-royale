# Ticket 116 — Profile Mode Card Accuracy Fix

Agent: Luna (web UX implementation)
Wave: Q — Wave P QA follow-up and deploy hardening
Status: New

## Context

Read:

- `agent-communication/responses/ticket-115-jasmine-qa-review-wave-p-chess-style-ranked-foundation-response.md`
- `apps/web/src/components/ProfileHistory.tsx`

Jasmine found two UI/product-accuracy warnings:

1. Prepared non-live mode cards show hard-coded rating-looking values (`1475`, `1450`, `1425`) and fake sparklines.
2. Standard card W/L/D is derived from recent match outcome labels instead of backend rating counters.

## Task

Fix profile mode card accuracy so prepared modes do not look like real ratings, and live Standard stats use backend rating counters.

## Scope

- Replace fake rating-like values/sparklines for non-live/prepared modes with unmistakable placeholder UI: `Prepared`, `Not live yet`, or similar.
- Use `profile.rating.wins`, `profile.rating.losses`, `profile.rating.draws`, and `profile.rating.abandons` for Standard mode stats where available.
- Keep demo/preview limitations visible.
- Do not claim Speed/Blitz, Classic, or Multiplayer are live until backend/UI are wired to real mode-specific data.

## Acceptance criteria

- Web build passes.
- Profile mode cards no longer show fake per-mode ratings for non-live modes.
- Standard W/L/D/abandon stats come from backend rating summary, not regex parsing of recent outcomes.
- Browser smoke confirms `/profile` and `/profile/[handle]` render accurately.

## Verification commands

```bash
CI=true pnpm --filter @wordle-royale/web build
CI=true pnpm smoke:local
CI=true pnpm secret-scan
git diff --check
```

## Output

Write response to:

`agent-communication/responses/ticket-116-luna-profile-mode-card-accuracy-fix-response.md`
