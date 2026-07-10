# Ticket 110 — Chess-Style Ranked System Contract Response

Task: Ticket 110 — Chess-Style Ranked System Contract
Agent: Elisa (architecture)
Status: Complete — architecture/contract only; no code implemented

## Summary

Created the Wave P chess-style ranked Wordle contract:

- `docs/2026-07-09-chess-style-ranked-system-contract.md`

The contract defines ranked modes, 1v1 adjudication rules, ranked/unranked lobby semantics, per-mode rating profile shape, Elo/Glicko migration path, matchmaking queue semantics, endpoint/DTO/schema implications, server-authority rules, anti-abuse constraints, and decisions requiring Ashar approval.

## Key decisions / contracts

### MVP ranked modes

| Mode id | Product label | Players | Rated? | Core rule |
|---|---|---:|---|---|
| `standard_1v1` | Standard | 2 | yes | Fewer guesses wins; same guesses draw. |
| `speed_1v1` | Speed / Blitz | 2 | yes | Fewer guesses wins; same guesses faster solve wins. |
| `classic_1v1` | Classic | 2 | yes | Lower time pressure; fewer guesses wins; same guesses draw. |
| `multiplayer_lobby` | Multiplayer / Lobby | 2–4 MVP | yes or unranked | Placement-based; pairwise rating conversion when rated. |
| `casual_lobby` | Casual Lobby | 2–4 MVP | no | Same gameplay, no rating changes. |

### Important architecture decision

Current implementation has:

- Prisma `MatchMode = casual|ranked`;
- contracts `gameModes = ['standard']`;
- `RatingProfile.mode` tied to `MatchMode`.

Ticket 110 recommends adding an explicit **ranked format/time-control dimension** rather than overloading `MatchMode`:

```text
rating category: casual|ranked
ranked mode: standard_1v1|speed_1v1|classic_1v1|multiplayer_lobby
```

Existing `ranked` data should map to `standard_1v1` during migration/backfill.

### Rating model path

- Prefer Glicko-style internal model if feasible.
- Elo-compatible MVP is acceptable if schema preserves migration fields:
  - rating deviation/confidence;
  - volatility if using Glicko-2 later;
  - per-mode rating records;
  - append-only rating events.
- User-facing UI should stay simple: one rating number per mode, provisional status, W/L/D, recent delta, graph/history.

### Server authority / anti-abuse locks

- Server chooses puzzle/rules/timing.
- Server validates guesses and computes standings.
- Clients never submit final result, placement, rating delta, answer hash/salt, or opponent outcome.
- Rating events are append-only; corrections use void/reversal/adjustment.
- Private rated lobbies stay disabled for MVP.
- Speed tiebreaks use server-received timestamps.
- Redis remains omitted for now; DB-backed queue is acceptable for small preview, Redis later for hot queue/realtime scale.

## Endpoint / DTO / schema implications

The contract defines implications for:

- `GET /ranked/modes`
- `POST /matchmaking/tickets`
- `DELETE /matchmaking/tickets/{ticketId}`
- `GET /matchmaking/tickets/{ticketId}`
- `GET /leaderboard?mode=standard_1v1`
- `GET /profiles/{handle}/ratings`
- `GET /profiles/{handle}/ratings/{mode}/history`
- `GET /profiles/{handle}/matches?mode=...`

Schema implications include:

- add explicit `RankedMode` enum;
- decouple rated category from format/time-control;
- make `RatingProfile` per `RankedMode`;
- make `LeaderboardSnapshot` per `RankedMode`;
- add fields for W/L/D, abandons, peak rating, last rated time, confidence/deviation, and volatility-ready migration;
- add `MatchmakingTicket` table if queue work starts.

## Decisions requiring Ashar approval

The doc explicitly lists approval-needed decisions:

1. Final public names: Speed vs Blitz, Classic behavior.
2. Exact time controls for Standard/Speed/Classic.
3. Whether Speed same-guess tiebreak uses solve time from day one.
4. Whether both-fail Speed games are draws or use progress/time tiebreak.
5. Whether public rated lobbies launch in MVP or only automatic ranked queue.
6. Whether private rated lobbies remain disabled. Elisa recommends disabled for MVP.
7. Glicko-style now vs Elo-compatible MVP after Ruby simulation.
8. Starting rating and provisional duration. Elisa recommends `1500` and `10` games pending Ruby simulation.
9. Whether multiplayer/lobby ranked launches with 1v1 or remains prepared but disabled.
10. Whether inactive-player confidence decay ships in first implementation.

## Files changed

- `docs/2026-07-09-chess-style-ranked-system-contract.md`
- `agent-communication/responses/ticket-110-elisa-chess-style-ranked-system-contract-response.md`

No source code, package files, Prisma migrations, provider settings, deployment config, secrets, or `.env` files were changed.

## Tests / commands run

Inspection performed:

- `agent-communication/tickets/ticket-110-elisa-chess-style-ranked-system-contract.md`
- `agent-communication/index.md`
- `docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md`
- `apps/api/prisma/schema.prisma`
- `packages/contracts/src/lobby/schemas.ts`
- `packages/contracts/src/lobby/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `apps/api/src/profile/profile-read.service.ts`
- `apps/api/src/leaderboard/leaderboard-read.service.ts`
- `apps/api/src/lobby/lobby.service.ts`
- downstream tickets 111, 112, and 113.

Verification commands:

```text
# date +%F
2026-07-09

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (190 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md
?? agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md
?? agent-communication/responses/ticket-105-yuna-controlled-preview-provisioning-response.md
?? agent-communication/responses/ticket-108-yuna-wave-o-checkpoint-pr-ci-deploy-evidence-response.md
?? agent-communication/responses/ticket-109-jasmine-qa-review-wave-o-hosted-preview-response.md
?? agent-communication/responses/ticket-110-elisa-chess-style-ranked-system-contract-response.md
?? agent-communication/tickets/ticket-103-elisa-preview-provider-final-decision.md
?? agent-communication/tickets/ticket-104-yuna-preview-provisioning-preflight.md
?? agent-communication/tickets/ticket-105-yuna-controlled-preview-provisioning.md
?? agent-communication/tickets/ticket-106-freya-hosted-api-deploy-smoke.md
?? agent-communication/tickets/ticket-107-luna-hosted-web-preview-smoke.md
?? agent-communication/tickets/ticket-108-yuna-wave-o-checkpoint-pr-ci-deploy-evidence.md
?? agent-communication/tickets/ticket-109-jasmine-qa-review-wave-o-hosted-preview.md
?? agent-communication/tickets/ticket-110-elisa-chess-style-ranked-system-contract.md
?? agent-communication/tickets/ticket-111-ruby-rating-algorithm-simulation-and-mode-ladders.md
?? agent-communication/tickets/ticket-112-freya-mode-aware-rating-profile-foundation.md
?? agent-communication/tickets/ticket-113-luna-chess-style-profile-and-ranked-mode-ui.md
?? agent-communication/tickets/ticket-114-yuna-hosted-preview-migration-readiness-hardening.md
?? agent-communication/tickets/ticket-115-jasmine-qa-review-wave-p-chess-style-ranked-foundation.md
?? docs/2026-07-07-athena-review-after-revised-103-104.md
?? docs/2026-07-07-athena-wave-o-architecture-direction.md
?? docs/2026-07-07-preview-provider-final-decision.md
?? docs/2026-07-07-preview-provisioning-preflight.md
?? docs/2026-07-09-athena-hosted-preview-and-chess-ranked-direction.md
?? docs/2026-07-09-chess-style-ranked-system-contract.md
```

## Acceptance criteria status

- Clear contract doc with endpoint/DTO/schema implications: PASS.
- Separates user-facing product rules from internal rating algorithm details: PASS.
- Explicitly lists decisions requiring Ashar approval: PASS.
- Does not implement code: PASS.

## Implementation handoff

### Ruby / Ticket 111

Use the contract to simulate:

- Elo with provisional K vs Glicko-style internals;
- Standard, Speed/Blitz, Classic, Multiplayer ladders;
- draw/upset/provisional/inactive scenarios;
- multiplayer pairwise placement conversion and scaling;
- starting rating, provisional games, K/RD defaults, and delta caps.

### Freya / Ticket 112

Use the contract to implement backend foundation:

- explicit ranked mode dimension;
- mode-aware rating profiles;
- leaderboard/profile read model migration;
- Glicko-ready fields even if MVP uses Elo-compatible math;
- no breakage to hosted preview/demo behavior.

### Luna / Ticket 113

Use the contract for UI:

- profile/avatar entry;
- mode rating cards/tabs;
- W/L/D, provisional, recent delta, graph/history affordance;
- ranked mode choices without claiming live matchmaking before backend is ready.

### Jasmine / Ticket 115

Validate:

- server authority;
- no spoiler/answer leak;
- per-mode rating separation;
- no false UI claims;
- hosted preview still works.

## Risks / follow-ups

- Existing schema currently conflates rated category and mode; Freya must migrate carefully.
- Glicko-style rating needs Ruby simulation before hard implementation.
- Speed mode timing must be server-authoritative to avoid cheating.
- Public rated lobbies create collusion/rating-transfer risk; queue-first is safer.
- Redis is still intentionally omitted; use DB-backed queue only for small preview, revisit Redis before high-concurrency live matchmaking.
