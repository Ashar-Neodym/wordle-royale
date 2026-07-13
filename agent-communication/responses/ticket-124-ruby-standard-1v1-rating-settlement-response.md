# Ticket 124 — Standard 1v1 Rating Settlement

Task: Implement production-safe Standard 1v1 rating settlement using the locked Wave P `baseline_glicko` parameters and the Wave R queue/match handoff.

Agent: Ruby (backend)

Status: Done

## Summary

Implemented a server-authoritative Standard 1v1 settlement path for queue-created matches tagged with:

- `rankedMode = standard_1v1`
- `algorithmConfigVersion = standard_1v1_glicko_v1`

The settlement updates both Standard rating profiles and appends both per-participant rating events atomically in a Serializable Prisma transaction. Legacy lobby-backed ranked matches remain on `placement_mmr_v1`; Speed, Classic, and Multiplayer settlement remain disabled.

## Algorithm/configuration

Production configuration matches Ticket 111's locked `baseline_glicko` candidate:

- initial rating: `1500`
- rating floor: `100`
- initial RD: `350`
- established RD target: `80`
- minimum RD: `50`
- established K: `24`
- provisional period: `10` matches
- established delta cap: `40`
- provisional delta cap: `64`
- inactivity RD inflation: `25` per completed 30-day period
- independent nearest-integer rounding with bounded non-zero-sum drift for asymmetric provisional/RD states

Equal established 1500/RD-80 players settle at `+12/-12`. Equal provisional 1500/RD-350 players settle at `+14/-14`, matching the reproducible rating-tools candidate.

## Behavior

- Win/loss settlement derives from persisted server standings.
- Equal-score matches settle as draws.
- A single abandoner is forced to second place/loss regardless of score, including equal-zero-score disconnects.
- Double abandon is rejected for operator/void handling rather than ambiguously rated.
- Provisional counters decrement per rated match.
- W/L/D/abandon counters, peak rating, RD, matches played, and `lastRatedAt` update together.
- Voided and unranked matches create no rating events.
- A Standard Glicko-tagged non-Standard mode is explicitly rejected.

## Atomicity/idempotency/concurrency

- Both public completion and direct finalization paths use Serializable transactions.
- `P2002` and `P2034` conflicts retry the entire transaction up to three attempts.
- Per-participant event keys derive from `rating:<matchId>:standard_1v1_glicko_v1:<participantId>`.
- Same-match retries reconstruct the previously committed result without applying deltas twice.
- Serializable isolation prevents concurrent different matches involving one profile from overwriting each other's absolute rating/RD updates.
- A partial Standard event pair is rejected as `incomplete_standard_1v1_rating_settlement` instead of being treated as a valid replay.

## Read-model/contract impact

`RatingEventContract` now accepts:

- `kind: standard_1v1_glicko_v1`
- `algorithmVersion: standard_1v1_glicko_v1`
- optional `ratingDeviationBefore`
- optional `ratingDeviationAfter`

Completed result summaries continue exposing rating-before, rating-after, and delta, now with Glicko-ready RD fields. Active gameplay responses remain unchanged and spoiler-safe.

## Files changed

- `apps/api/src/rating/standard-1v1-rating.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/standard-1v1-rating.test.ts`
- `apps/api/test/rating-finalization.test.ts`
- `apps/api/README.md`
- `packages/contracts/src/gameplay/constants.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `agent-communication/responses/ticket-124-ruby-standard-1v1-rating-settlement-response.md`

A narrow type annotation was also added to the concurrently developed `apps/api/test/matchmaking.test.ts` fixture so the integrated Wave R API build remains strict-TypeScript clean; matchmaking behavior was not changed by Ticket 124.

## Test coverage

Added/extended deterministic tests for:

- equal-rating established win/loss;
- expected favorite win versus upset magnitude;
- draw;
- abandon and equal-score abandon;
- provisional/high-RD movement;
- baseline-Glicko parity;
- inactivity RD inflation;
- exact-two-distinct-player validation;
- persisted profile/event before/after fields;
- idempotent replay;
- concurrent public completion attempts;
- void/unranked/no-event behavior;
- rejection of non-Standard Glicko-tagged modes.

## Commands and evidence

RED phase:

- `CI=true pnpm --filter @wordle-royale/contracts test` — exit `1`; new Standard event kind was rejected before contract implementation.

Final verification:

- `node --import tsx --test test/rating-finalization.test.ts test/standard-1v1-rating.test.ts` — exit `0`; `13/13` focused tests passed.
- `CI=true pnpm --filter @wordle-royale/api test` — exit `0`; `71/71` tests passed.
- `CI=true pnpm --filter @wordle-royale/api build` — exit `0`.
- `CI=true pnpm --filter @wordle-royale/contracts test` — exit `0`; `18/18` tests passed.
- `CI=true pnpm --filter @wordle-royale/rating-tools test` — exit `0`; `14/14` tests passed.
- `CI=true pnpm build` — exit `0` across API, web, mobile, and workspace packages.
- `CI=true pnpm --filter @wordle-royale/api db:validate` — exit `0`.
- `CI=true pnpm validate:workspace` — exit `0`; 9 workspace packages validated.
- `CI=true pnpm secret-scan` — exit `0`; 200 source/config files scanned.
- `/usr/bin/git diff --check` — exit `0`.

## Security/data risks

- No secrets, environment changes, paid dependencies, or production data operations.
- No Ticket 124 migration was added; settlement uses mode/RD/profile fields established by the Wave P/Wave R schema work.
- Rating decisions consume only persisted server-authoritative match state; clients cannot submit rating deltas or outcomes.
- Serializable isolation can increase transaction retries under contention, bounded to three attempts and surfaced as a failure rather than silently losing updates.
- Reversal/correction remains append-only follow-up work; this ticket does not mutate historical applied events.

## Follow-ups

- Ticket 126 should exercise queue -> gameplay -> completion -> profile/history/leaderboard integration against PostgreSQL, including a forced serialization retry if practical.
- Future Speed, Classic, and Multiplayer tickets must use separate algorithm versions/profiles and must not reuse Standard events.
- Add explicit append-only correction/reversal operations before operator tooling allows post-settlement adjudication changes.
