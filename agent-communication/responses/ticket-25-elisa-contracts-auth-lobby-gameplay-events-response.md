# Shared Contracts for Auth, Lobby, Gameplay, and Realtime Events — Response

## Summary

Expanded `packages/contracts` into a shared TypeScript/Zod contract source for the Ticket 25 areas:

- Common primitives/envelopes.
- Auth/profile/consent DTOs.
- Lobby and matchmaking DTOs.
- Gameplay schemas and server-authoritative guess results.
- Realtime Socket.IO event names and payload schemas.
- Match report and spoiler-safe share-card DTOs.

The package-level contract test and build now pass. Root `pnpm build` was run and currently fails in `apps/web` on pre-existing workspace package resolution for `@wordle-royale/design-tokens` and `@wordle-royale/fixtures`; details are below.

## Decisions / Recommendations

1. **Contracts remain Zod-first.** Every major DTO/event shape added in this ticket is represented as a Zod schema with inferred TypeScript types.
2. **Event names are centralized constants.** Client/server event names now export from `packages/contracts/src/realtime/constants.ts` instead of requiring scattered strings.
3. **Client gameplay payloads are intent-only.** `submitGuessRequestSchema` accepts guess intent and idempotency metadata only; it does not accept authoritative answer, score, feedback, rating, or placement fields.
4. **Private rated lobbies are rejected for V1.** `createLobbyRequestSchema` rejects `visibility: "private"` with `rated: true`, matching the V1 decision lock.
5. **Consent scope spelling follows the ticket exactly.** The exported consent scopes include exact `training_insights_opt_in` and reject the older/singular `training_insight_opt_in` spelling.
6. **Share cards are explicitly spoiler-safe.** `shareCardSchema` requires `spoilerSafe: true`.

## Detailed Output

Implemented the following contract areas.

### Common contracts

Added:

- `idSchema`
- `timestampSchema`
- `idempotencyKeySchema`
- `requestIdSchema`
- pagination request/response schemas
- error envelope schema
- success envelope factory
- common inferred types

### Auth/profile/consent contracts

Added:

- user/session/public-profile/current-user DTO schemas
- register/login/token response schemas
- handle availability response schema
- update profile request schema
- consent state/update schemas
- exact consent scope enum:
  - `necessary_gameplay`
  - `product_analytics`
  - `training_insights_opt_in`

### Lobby/matchmaking contracts

Added:

- lobby visibility/state/member enums
- lobby settings schema
- lobby settings validation schema
- create/join/leave/ready request schemas
- private-rated-lobby V1 disabled shape
- lobby member and lobby DTO schemas
- quick join request schema
- matchmaking ticket DTO schema

### Gameplay contracts

Added:

- match/round/player-round state enums
- letter feedback schema
- score breakdown schema
- participant standing schema
- round snapshot schema
- match snapshot schema
- submit guess request schema
- accepted/rejected guess result schemas

### Realtime contracts

Added centralized event constants for client-to-server and server-to-client events.

Client events include:

- `lobby.subscribe`
- `lobby.set_ready`
- `lobby.update_settings`
- `lobby.start_match`
- `lobby.leave`
- `matchmaking.subscribe`
- `match.subscribe`
- `guess.submit`
- `session.resync`

Server events include:

- `connection.ready`
- `connection.state_changed`
- `lobby.snapshot`
- `lobby.ready_reset`
- `lobby.start_failed`
- `matchmaking.status`
- `matchmaking.duplicate_queue`
- `match.snapshot`
- `guess.accepted`
- `guess.rejected`
- `round.ended`
- `match.completed`
- `session.resync_result`
- `error`

### Match report/share card contracts

Added:

- report visibility schema
- round player report schema
- match report round schema
- match report participant schema
- participant-only-capable match report schema
- spoiler-safe share-card schema

### Tests added

Added representative parsing tests for:

- exact consent scope spelling
- private rated lobby rejection
- client guess payload not containing authoritative fields
- centralized event name constants
- accepted guess realtime event payload
- participant-only match report with score breakdown
- spoiler-safe share card requirement

## Open Questions

None for Elisa on Ticket 25 contracts.

Root `pnpm build` has an unrelated `apps/web` build blocker that should be routed to Luna/Ruby/Yuna depending on ownership of the Next.js workspace-package resolution issue.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/API implementation.
- **Exact task:** Use `@wordle-royale/contracts` schemas/types for Ticket 27 NestJS auth/lobby/API DTOs and Socket.IO gateway payload validation.
- **Inputs/context they need:** Ticket 25 response, `packages/contracts/src/**`, Ticket 27 backend skeleton ticket.
- **Expected output back to Athena:** Backend DTOs/controllers/events using the shared contracts, with build/test evidence.

### Follow-up Ticket 2

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns frontend/product-facing implementation.
- **Exact task:** Use `@wordle-royale/contracts` types for lobby, gameplay, report, reconnect, and share-card UI fixtures/client boundaries.
- **Inputs/context they need:** Ticket 25 response and `packages/contracts/src/**`.
- **Expected output back to Athena:** Frontend usage plan or implementation summary proving no duplicated local DTO definitions.

### Follow-up Ticket 3

- **Target agent:** Ruby or Yuna
- **Why that agent is needed:** Root `pnpm build` currently fails in workspace package resolution outside the contracts package.
- **Exact task:** Fix `apps/web`/workspace package resolution for `@wordle-royale/design-tokens` and `@wordle-royale/fixtures` so root `pnpm build` passes again.
- **Inputs/context they need:** Root build output from this response; affected packages are `apps/web`, `packages/design-tokens`, and `packages/fixtures`.
- **Expected output back to Athena:** Root `pnpm build` passing with exact command output.

## Files Changed

- `packages/contracts/src/index.ts`
- `packages/contracts/src/common/schemas.ts`
- `packages/contracts/src/common/types.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `packages/contracts/src/auth/constants.ts`
- `packages/contracts/src/auth/schemas.ts`
- `packages/contracts/src/auth/types.ts`
- `packages/contracts/src/lobby/constants.ts`
- `packages/contracts/src/lobby/schemas.ts`
- `packages/contracts/src/lobby/types.ts`
- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/gameplay/types.ts`
- `packages/contracts/src/realtime/constants.ts`
- `packages/contracts/src/realtime/schemas.ts`
- `packages/contracts/src/realtime/types.ts`
- `packages/contracts/src/match-report/schemas.ts`
- `packages/contracts/src/match-report/types.ts`
- `agent-communication/responses/ticket-25-elisa-contracts-auth-lobby-gameplay-events-response.md`

## Tests / Commands Run

### Command

```bash
PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm --filter @wordle-royale/contracts test
```

Result: passed.

```text
✔ consent scope uses exact training_insights_opt_in spelling
✔ private rated lobbies are rejected for V1
✔ guess submit request contains intent only and no score or answer authority
✔ server event names are exported string literals
✔ guess accepted realtime event validates feedback payload
✔ match report is participant-only capable and includes score breakdown
✔ share card schema requires spoilerSafe true
✔ word list artifact schema accepts fixture list metadata and words
✔ manifest schema requires deterministic list checksums
✔ validation report schema exposes failed checks
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

### Command

```bash
PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm --filter @wordle-royale/contracts build
```

Result: passed.

```text
$ tsc -p tsconfig.json
```

### Command

```bash
PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm build
```

Result: failed in `apps/web` after all package-level builds including `packages/contracts` completed.

Relevant output:

```text
packages/contracts build: Done
apps/web build: Error: Turbopack build failed with 43 errors:
apps/web build: ./packages/fixtures/src/index.ts:1:1
apps/web build: Module not found: Can't resolve './auth.js'
apps/web build: ./packages/design-tokens/src/index.ts:1:1
apps/web build: Module not found: Can't resolve './border.js'
...
apps/web build: Export tileStates doesn't exist in target module
apps/web build: Failed
/home/ashar/Desktop/hermes-projects/wordle-royale/apps/web:
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] @wordle-royale/web@0.0.0 build: `next build`
Exit status 1
```

### Setup/verification command

```bash
CI=true pnpm install --frozen-lockfile --ignore-scripts
```

Result: passed.

This was needed because plain `pnpm --filter @wordle-royale/contracts test` initially triggered pnpm install/dependency-status checks that failed on ignored Prisma build scripts in this environment.

## Evidence / Result

Ticket 25 implementation is complete at the contracts package level:

- Zod schemas and inferred TypeScript types export from `@wordle-royale/contracts` via `packages/contracts/src/index.ts`.
- Event names are centralized string-literal constants in `packages/contracts/src/realtime/constants.ts`.
- Client guess request schema excludes authoritative score/answer fields.
- Private rated lobbies are rejected for V1 by `createLobbyRequestSchema`.
- Consent scope uses exact `training_insights_opt_in`.
- Representative valid/invalid parsing tests pass.
- `PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm --filter @wordle-royale/contracts build` passes.
- `PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm --filter @wordle-royale/contracts test` passes.

## Risks / Blockers

1. **Root build blocker:** `PNPM_CONFIG_IGNORE_SCRIPTS=true pnpm build` currently fails in `apps/web` due unresolved `.js` module imports/exports from `@wordle-royale/design-tokens` and `@wordle-royale/fixtures`. This is outside the contracts implementation, but it blocks the Ticket 25 root-build acceptance criterion until fixed.
2. **Runtime integration not performed:** This ticket only implemented shared contracts. Backend controllers, frontend clients, and Socket.IO runtime validation still need follow-up implementation.
3. **Schema breadth risk:** The contracts are intentionally broad enough for Auth/Lobby/Gameplay/Realtime/Reports, but Freya/Luna should import these directly rather than copy local DTOs, or drift will return.
4. **Environment caveat:** Commands used `PNPM_CONFIG_IGNORE_SCRIPTS=true` because the environment’s pnpm install path fails on ignored Prisma build scripts without approval. No paid or external services were added.
