# Ticket 77 — Mobile Navigation and Bounds Follow-Up

Assigned agent: Luna
Priority: Medium
Wave: K — GitHub checkpoint and product depth
Dependencies: Tickets 68 and 73; can run after web route contract stabilizes.
Parallelization: K.2; optional if Luna capacity is constrained.
Human action needed: Optional real-phone step. If Luna asks, Ashar should scan Expo Go QR and report whether anything is clipped/out of bounds.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-tickets-65-71.md`
- Ticket 68 response
- Ticket 73 response if available

Ashar previously saw Expo/mobile UI feel a bit out-of-bounds. Web now has multiple routes; mobile should not drift behind.

## Task

Add or plan the first mobile navigation/depth follow-up while keeping Expo layout safe.

## Deliverables

1. Review mobile current screen structure against the new web IA.
2. Add a minimal mobile navigation/menu if safe, or document the next required mobile nav change.
3. Check safe area, wrapping, scroll, and card width behavior.
4. Provide exact Expo Go instructions if real-phone smoke is requested.
5. If phone smoke is not possible, run build/config checks and mark runtime device smoke deferred.

## Recommended verification

```bash
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm build
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-77-luna-mobile-navigation-and-bounds-follow-up-response.md`

Do not answer only in chat. Write the Markdown response file.
