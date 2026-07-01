# Ticket 68 — Responsive Web and Mobile Bounds Audit

Assigned agent: Luna
Priority: High
Wave: J — GitHub checkpoint, CI, multi-page product shell
Dependencies: Can run after Ticket 67, or in parallel if focused on mobile components.
Parallelization: J.1/J.2.
Human action needed: Optional phone check. If Luna asks, Ashar may need to open Expo Go and report if anything is clipped/out of bounds.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-58-64.md`
- Ticket 63 response
- Ticket 67 response if available

Ashar feedback: Expo/mobile UI felt a bit out-of-bounds. Future work must not break on web or mobile.

## Task

Audit and fix responsive layout bounds across web and Expo mobile.

## Deliverables

1. Check small/medium/desktop web viewport behavior for the new multi-page shell.
2. Check mobile app safe-area, scrolling, card widths, and text wrapping.
3. Avoid clipped buttons, overflowing rows, and horizontal scroll unless intentional.
4. Add CSS/component fixes for responsive behavior.
5. Provide exact manual test instructions for Ashar if phone verification is needed.
6. If real phone smoke is unavailable, mark it deferred but still run build/config checks.

## Recommended verification

```bash
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-68-luna-responsive-web-and-mobile-bounds-audit-response.md`

Do not answer only in chat. Write the Markdown response file.
