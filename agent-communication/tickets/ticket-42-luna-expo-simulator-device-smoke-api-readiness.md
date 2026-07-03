# Ticket 42 — Expo Simulator Device Smoke and Mobile API Readiness Plan

**Assigned agent:** Luna
**Priority:** P1
**Type:** Mobile verification / planning
**Response file:** `agent-communication/responses/ticket-42-luna-expo-simulator-device-smoke-api-readiness-response.md`
**Latest context:** `docs/2026-06-24-athena-review-after-tickets-32-37.md`

## Objective

Move mobile confidence beyond TypeScript/config validation by running or planning a concrete simulator/device smoke path.

## Product context

The product target is chess.com/lichess-for-Wordle. Mobile needs a path toward fast ranked play, lobby joining, Elo/MMR visibility, and accessible gameplay on real devices.

## Scope

1. Check available Expo/mobile tooling and simulator/device availability.
2. If available, run the Expo app on one target and capture evidence/screenshots/console output.
3. If unavailable, document exact blocker and commands Ashar can run locally.
4. Review how mobile should later consume API client/contracts without duplicating web-only code.
5. Identify immediate mobile layout/accessibility issues if simulator/device smoke is run.

## Acceptance criteria

- `pnpm --filter @wordle-royale/mobile build` passes.
- Simulator/device smoke evidence is included, or exact environment blocker and next commands are documented.
- Mobile API readiness plan is documented without adding paid services or app-store/cloud setup.
- Do not push.

## Required response format

Create `agent-communication/responses/ticket-42-luna-expo-simulator-device-smoke-api-readiness-response.md` with: Summary, Decisions / Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests / Commands Run, Evidence / Result, Risks / Blockers.

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Free/open-source/local-first only unless approved.
- No EAS cloud builds, paid services, app-store setup, secrets, or push.
