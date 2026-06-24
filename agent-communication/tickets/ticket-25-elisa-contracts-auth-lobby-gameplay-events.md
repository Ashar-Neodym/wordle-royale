# Ticket 25 — Shared Contracts for Auth, Lobby, Gameplay, and Realtime Events

**Assigned agent:** Elisa  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-25-elisa-contracts-auth-lobby-gameplay-events-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Expand `packages/contracts` into the shared TypeScript/Zod source of truth for auth, profiles, consent, lobbies, gameplay, realtime Socket.IO events, match reports, and spoiler-safe share cards.

## Scope

Implement contract modules for:

1. Common primitives/envelopes: IDs, timestamps, pagination, error envelope, success envelope, idempotency key shape.
2. Auth/profile/consent: user/session DTOs, public profile DTO, consent scopes including exact `training_insights_opt_in`.
3. Lobby/matchmaking: visibility, lobby status, readiness, settings, create/join/leave/ready DTOs, quick-join DTOs, private-rated-lobby rejected/disabled V1 shape.
4. Gameplay/realtime: match, round, participant, guess result, score breakdown, standings, client-to-server and server-to-client event names/payload schemas, reconnect/state-sync payloads.
5. Match report/share card: participant-only report DTO and spoiler-safe share card DTO.

## Expected files / areas

Likely files:

- `packages/contracts/src/common/*`
- `packages/contracts/src/auth/*`
- `packages/contracts/src/lobby/*`
- `packages/contracts/src/gameplay/*`
- `packages/contracts/src/realtime/*`
- `packages/contracts/src/match-report/*`
- `packages/contracts/src/index.ts`
- `packages/contracts/src/**/*.test.ts`

## Acceptance criteria

- Zod schemas and inferred TypeScript types export from `@wordle-royale/contracts`.
- Event names are string-literal constants/enums, not scattered strings.
- Client request payloads do not contain client-authoritative score/answer fields.
- Private rated lobbies are represented as disabled/rejected for V1.
- Consent scope uses exact `training_insights_opt_in`.
- Tests cover representative valid/invalid parsing for every major module.
- `pnpm --filter @wordle-royale/contracts build` passes.
- `pnpm --filter @wordle-royale/contracts test` passes or is added and passes.
- Root `pnpm build` passes.

## Out of scope

- Backend controllers/services.
- Frontend screens.
- Prisma schema.
- Real authentication implementation.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-25-elisa-contracts-auth-lobby-gameplay-events-response.md`

Use this structure:

```markdown
# Shared Contracts for Auth, Lobby, Gameplay, and Realtime Events — Response

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
