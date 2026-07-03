# Ticket 83 — Player-Facing Ranked Loop Polish: Rematch, Share, and Result Actions

Assigned agent: Ruby
Priority: High
Wave: L — Public-preview readiness
Dependencies: Wave K merged; Ticket 80 useful but not blocking
Parallelization: L.1 parallel with Ticket 82 after L.0 direction is available
Human action needed: None.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- current gameplay/rating/lobby services
- current web match detail/profile/history routes

Wave K made profile/history/match-detail pages real. The next gameplay improvement should make a completed match feel like a replayable product loop, not just a terminal result page.

## Task

Design and implement the smallest backend/API contract slice for player-facing post-match actions.

## Deliverables

1. Add or refine spoiler-safe result payload fields needed for:
   - rematch affordance,
   - shareable result summary,
   - profile/history links,
   - next ranked game CTA.
2. If cheap and safe, add a rematch/lobby creation helper; otherwise define follow-up and expose enough data for web UI CTAs.
3. Ensure result/share payloads never leak hidden answers/hashes/salts.
4. Add API/contract tests for completed match result actions and active-match spoiler safety.
5. Coordinate expected fields with Luna Ticket 84.

## Verification

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm build
pnpm secret-scan
git diff --check
```

## Response path

`agent-communication/responses/ticket-83-ruby-ranked-loop-rematch-share-result-actions-response.md`

Do not answer only in chat. Write the Markdown response file.
