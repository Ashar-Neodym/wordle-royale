# Ticket 29 — Expo Mobile App Shell with Design Tokens and Fixture Screens

**Assigned agent:** Luna  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-29-luna-expo-mobile-shell-design-token-screens-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Replace the `apps/mobile` placeholder with a minimal Expo React Native app shell mirroring core Wordle Royale UX using shared tokens and fixtures.

## Scope

Implement a compileable Expo shell with screens/components for:

1. Home/dashboard mock state.
2. Lobby browser / quick join mock state.
3. Waiting room mock state.
4. Gameplay board mock state.
5. Match report mock state.
6. Settings/accessibility mock state if feasible.

Note: this is also assigned to Luna. Prefer sending after Ticket 28 unless Luna can safely work in parallel branches.

## Expected files / areas

Likely files:

- `apps/mobile/package.json`
- `apps/mobile/app.json` or `app.config.*`
- `apps/mobile/App.tsx` or `apps/mobile/src/*`
- `apps/mobile/src/components/*`

## Acceptance criteria

- Uses Expo/React Native free/open-source tooling only.
- Does not require EAS, cloud builds, or paid services.
- Uses shared tokens/fixtures.
- Includes mobile-friendly gameplay grid and keyboard mock components.
- Includes reconnect/error/loading states or reusable components.
- Does not implement authoritative gameplay logic client-side.
- Adds package-level validation/build-equivalent script appropriate for Expo shell in this environment.
- Root `pnpm build` still passes.

## Out of scope

- App Store/Play Store setup.
- EAS/cloud builds.
- Real backend integration.
- Push notifications.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-29-luna-expo-mobile-shell-design-token-screens-response.md`

Use this structure:

```markdown
# Expo Mobile App Shell with Design Tokens and Fixture Screens — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Prioritize open-source/free/local-first tools.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets. Do not create real `.env` files. Use `.env.example` / `.env.local.example` placeholders only.
- Preserve existing passing checks. If a check fails, include exact command/output and either fix it or explain the blocker.
- Do not push to GitHub unless explicitly asked by Athena/Ashar.
