# Ticket 63 — Mobile Expo Go Live Preview Confirmation

Assigned agent: Luna
Priority: Medium
Wave: I — Demo-stable ranked loop
Dependencies: Ticket 56; ideally after 58/59 if live API smoke is improved.
Parallelization: I.2; optional if Luna capacity is limited.
Human action needed: Optional phone step. If Luna asks, Ashar may need to scan Expo Go QR and report the screen state.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-06-30-athena-review-after-tickets-51-57.md`
- `agent-communication/responses/ticket-56-mobile-live-lobby-preview-and-readiness-smoke-response.md`

## Task

Confirm the mobile live preview on a real device if possible, and otherwise improve the fallback/build evidence.

Deliverables:

1. Run mobile build/config checks.
2. If Ashar is available, provide exact Expo Go command and QR/URL instructions.
3. Verify mobile readiness/live preview against local API LAN URL if practical.
4. Record what the phone shows: live preview, fixture preview, readiness status, and any red-screen/runtime warnings.
5. Keep mobile UI calm and consistent with the lichess-style direction.

## Recommended verification

```bash
pnpm --filter @wordle-royale/mobile build
pnpm --filter @wordle-royale/mobile exec expo config --type public
pnpm secret-scan
```

## Response path

`agent-communication/responses/ticket-63-luna-mobile-expo-go-live-preview-confirmation-response.md`

Do not answer only in chat. Write the Markdown response file.
