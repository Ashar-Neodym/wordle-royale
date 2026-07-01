# Ticket 67 — Web Multi-Page Shell and Dropdown Navigation

Assigned agent: Luna
Priority: High
Wave: J — GitHub checkpoint, CI, multi-page product shell
Dependencies: Prefer after Ticket 66 IA, but can start by preparing route-safe structure.
Parallelization: J.1 after Ticket 66.
Human action needed: Optional: Ashar should visually review the navigation/pages if available.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-58-64.md`
- `docs/2026-06-30-lichess-style-web-ui-direction.md`
- Ticket 66 response if available

## Task

Move the web app from a mostly one-page shell toward a lichess-like multi-page product shell.

## Deliverables

1. Implement top-level navigation and dropdown/menu groups per Ticket 66.
2. Add real routes/pages for the MVP areas: Play, Lobbies, Leaderboard, Profile, Learn/Rules, and Settings/Account placeholder if specified.
3. Reuse existing live widgets where appropriate; do not duplicate API logic unnecessarily.
4. Keep the style calm, human, game-first, and not SaaS/AI-generated.
5. Preserve live/fallback behavior and spoiler safety.
6. Make keyboard/focus states usable.

## Recommended verification

```bash
pnpm --filter @wordle-royale/web typecheck
pnpm --filter @wordle-royale/web build
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-67-luna-web-multi-page-shell-and-dropdown-navigation-response.md`

Do not answer only in chat. Write the Markdown response file.
