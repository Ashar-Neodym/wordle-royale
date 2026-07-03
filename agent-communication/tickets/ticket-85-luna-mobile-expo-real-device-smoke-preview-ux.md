# Ticket 85 — Mobile Expo Real-Device Smoke Closure and Preview UX Polish

Assigned agent: Luna
Priority: Medium
Wave: L — Public-preview readiness
Dependencies: Wave K merged; Ticket 80 useful but not required
Parallelization: L.2; send if Luna has capacity, otherwise after Ticket 84
Human action needed: Optional but recommended. Ashar may need to scan Expo Go QR and report visible clipping/navigation issues.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `agent-communication/responses/ticket-77-luna-mobile-navigation-and-bounds-follow-up-response.md`
- current `apps/mobile/README.md`

Mobile has build/static verification, but physical Expo Go smoke has repeatedly remained a caveat.

## Task

Close the mobile real-device caveat or make the fallback/deferred state explicit and actionable.

## Deliverables

1. Provide exact Expo Go smoke instructions for Ashar:
   - commands,
   - expected QR/URL behavior,
   - what to look for,
   - what screenshots/notes to return.
2. If a device/simulator is available to Luna, run the smoke and report results.
3. Polish mobile navigation/bounds if issues are found and can be fixed safely.
4. Ensure API readiness card and fixture/demo fallback remain honest.
5. Keep local build/config verification passing.

## Verification

```bash
pnpm --filter @wordle-royale/mobile build
pnpm build
pnpm secret-scan
git diff --check
```

If device smoke is not possible, explicitly mark: `physical Expo Go smoke deferred` and include next-step instructions.

## Response path

`agent-communication/responses/ticket-85-luna-mobile-expo-real-device-smoke-preview-ux-response.md`

Do not answer only in chat. Write the Markdown response file.
