# Ticket 76 — Lobby Discovery and Matchmaking UX Slice

Task: Improve the first lobby discovery/matchmaking experience so `/lobbies` and `/play` can show better competitive-game actions/states without overbuilding a full queue.

Agent: Ruby (backend)

Status: Done

## Summary

Implemented a small backend/API contract refinement for lobby discovery:

- `GET /lobbies` remains backward-compatible.
- Added optional query filters for lobby discovery:
  - `status=waiting|ready|in_match|closed`
  - `mode=ranked|casual`
  - `visibility=public|private` with public as the default
  - `limit=1..50` with `20` as the default
- Extended lobby DTO payloads with product-action metadata for lobby cards:
  - `status`
  - `visibility`
  - `mode`
  - `playerCount`
  - `maxPlayers`
  - `canJoin`
  - `canStart`
  - `blockerReason`
- Added regression coverage for open/rated lobby discovery, joining, and start readiness.
- Kept full matchmaking queues out of scope, per ticket guidance.

## Decisions / Recommendations

1. **Use filtered `GET /lobbies` instead of adding a new matchmaking endpoint.**
   - This gives Luna enough for `/lobbies` and `/play` cards without committing to a queue system.

2. **Keep the existing `LobbyDto` compatible and enrich it with optional fields.**
   - Existing consumers that only need `settings`, `members`, and `state` continue to work.
   - New UI can prefer the derived fields for compact lobby cards.

3. **Treat `blockerReason` as start-readiness copy.**
   - `waiting_for_players` means not enough joined players for `minPlayers`.
   - `lobby_not_open` means the lobby is no longer waiting/ready.
   - `null` means start is not blocked by discovery readiness.
   - `canJoin` independently tells the UI whether a lobby is open and not full.

4. **No server-authority or spoiler boundary changes.**
   - Lobby discovery reads only lobby settings/members/status.
   - Gameplay answer/scoring/rating authority remains in gameplay/rating services.

## Detailed Output

### API behavior

Default compatible list:

```http
GET /lobbies
```

Filtered discovery for ranked/public/open lobbies:

```http
GET /lobbies?status=waiting&mode=ranked&visibility=public&limit=20
```

Each item now includes fields like:

```ts
type LobbyDto = {
  id: string;
  code: string;
  hostUserId: string | null;
  status?: 'waiting' | 'ready' | 'in_match' | 'closed';
  visibility?: 'public' | 'private';
  mode?: 'ranked' | 'casual';
  playerCount?: number;
  maxPlayers?: number;
  canJoin?: boolean;
  canStart?: boolean;
  blockerReason?: 'waiting_for_players' | 'lobby_full' | 'lobby_not_open' | null;
  // existing LobbyDto fields remain present
};
```

### Readiness semantics

- `canJoin = true` when lobby status is waiting/ready and joined players are below `maxPlayers`.
- `canStart = true` when lobby status is waiting/ready and joined players are at/above `minPlayers`.
- `blockerReason = 'waiting_for_players'` before `minPlayers` is reached.
- `blockerReason = null` once the lobby is start-ready.

## Open Questions

None blocking.

Potential future product questions:

1. Should `GET /lobbies/:lobbyId` be added for a detail drawer/page, or should Luna keep using list state plus join/start endpoints for now?
2. Should start readiness eventually require per-member `ready=true`, or is joined-player count enough for the current local ranked smoke flow?
3. Should private lobbies ever appear in discovery for the current user, once real auth/session ownership exists?

## Follow-up Tickets

1. Luna can wire `/lobbies` and `/play` cards to the enriched list payload:
   - show ranked/casual filters,
   - use `playerCount/maxPlayers`,
   - show Join vs Start/Waiting copy from `canJoin`, `canStart`, and `blockerReason`.
2. If a lobby detail route becomes necessary, add `GET /lobbies/:lobbyId` as a narrow read endpoint rather than introducing a queue.
3. Future real-auth work should revisit private lobby discovery and current-user-specific `canJoin`/`canStart` rules.

## Files Changed

- `apps/api/src/lobby/lobby.controller.ts`
- `apps/api/src/lobby/lobby.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `packages/contracts/src/lobby/schemas.ts`
- `apps/api/README.md`
- `agent-communication/responses/ticket-76-ruby-lobby-discovery-and-matchmaking-ux-slice-response.md`

## Tests / Commands Run

TDD RED phase:

```bash
pnpm --filter @wordle-royale/api test -- test/api-skeleton.test.ts
```

Result: exit `1`; new lobby discovery test failed before implementation because filtered/ranked discovery metadata was missing.

Final verification:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/contracts test
pnpm build
pnpm --filter @wordle-royale/api db:validate
pnpm validate:workspace
pnpm secret-scan
```

All final verification commands exited `0`.

## Evidence / Result

API tests:

```text
▶ api skeleton
  ✔ creates, lists, and joins lobbies through the Prisma-backed lobby service
  ✔ discovers ranked lobbies with filters, join affordance, and start readiness blockers
✔ api skeleton
ℹ tests 37
ℹ pass 37
ℹ fail 0
```

API build/typecheck:

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

Contracts tests:

```text
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

Root build:

```text
$ pnpm -r --if-present build
apps/api build: Done
apps/web build: Done
apps/mobile build: Done
```

Prisma validation:

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

Secret scan:

```text
Secret scan passed (181 source/config files scanned).
```

Workspace validation:

```text
Workspace scaffold validation passed (9 workspace packages).
```

## Risks / Blockers

### Blockers

None.

### Risks / warnings

1. `blockerReason` is intentionally lightweight and not a complete permissions model while auth remains stubbed.
2. The current start-readiness rule is joined-player-count based. If the product later requires explicit player ready toggles, `canStart` should include member readiness.
3. Query invalid values currently fall back to safe defaults instead of returning validation errors; this preserves compatibility but can be tightened later if Elisa wants stricter public route contracts.
