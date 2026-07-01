# Ticket 64 — QA Review Wave I Demo-Stable Ranked Loop

Assigned agent: Jasmine
Priority: High
Wave: I — Demo-stable ranked loop
Dependencies: After Tickets 58–63 responses exist, or explicitly mark optional/deferred items.
Parallelization: I.3 last.
Human action needed: Optional. Include Ashar's visual feedback if he reviews web/mobile UI.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `agent-communication/index.md`
- Tickets/responses 58–63 when present

## Task

Independently verify Wave I.

Scope:

1. Verify reset/seed no longer leaves direct ranked smoke blocked by missing stub users.
2. Verify ranked E2E can complete without manual DB edits, or clearly mark the remaining blocker.
3. Verify natural terminalization/dev-helper guard behavior.
4. Verify web UI no longer shows confusing fixture/demo content during live match view.
5. Verify leaderboard/result/rating display still works.
6. Verify mobile build and phone smoke if Ashar is available.
7. Re-run root/package gates and secret scan.
8. Separate PASS/WARN/FAIL and recommend Wave J.

## Recommended verification

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
pnpm deps:check
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
pnpm deps:up
pnpm ranked:smoke:reset
# plus live ranked API/web smoke per new docs/scripts
pnpm deps:down
```

## Response path

`agent-communication/responses/ticket-64-jasmine-qa-review-wave-i-demo-stable-ranked-loop-response.md`

Do not answer only in chat. Write the Markdown response file.
