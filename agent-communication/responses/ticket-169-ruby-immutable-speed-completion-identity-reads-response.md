# Ticket 169 — Immutable Speed Completion Identity on Reads — Response

## Summary

Completed Ticket 169. Speed result reads now derive their public completion identity exclusively from persisted Speed adjudication state. Repeated reads of completed forfeit, deadline, and no-contest matches preserve one identical `completionReason` across the API result, `speedCompletionReason`, `Match.completionReason`, and `MatchReport.publicSummary` while retaining stale-report repair and exactly-once rating settlement.

Standard completion behavior remains unchanged. No Prisma migration or hosted/provider mutation was introduced.

## Decisions / Recommendations

- Treat `Match.completionReason` as the immutable Speed completion authority after server adjudication.
- Map the persisted Speed reason to the existing internal finalization reason only for settlement control; never use the generic caller reason as the public Speed identity.
- Require completed Speed result contracts to have `completionReason === speedCompletionReason`.
- Keep generic Standard completion input/output compatibility. Speed-only reasons are rejected for non-Speed result summaries.
- Rebuild stale Speed reports from persisted match, participant, and rating-event rows rather than trusting cached summary data.
- Sort reconstructed rating-event rows deterministically before emitting replayed summaries, so equal-timestamp database rows cannot change participant ordering across reads.

## Detailed Output

### Persisted completion authority

`GameplayPersistenceService.getRankedMatchResult()` now validates the persisted Speed completion reason and maps it to the appropriate internal finalization control:

- `all_players_terminal` → `all_players_final`
- `deadline` → `timeout`
- `forfeit` → `forfeit`
- `ready_timeout` / `operator_void` → `voided`

`persistRankedMatchResultSummary()` separately emits the exact persisted Speed reason into both public completion fields. A generic read request can therefore no longer rewrite a forfeit or deadline report to `all_players_final`.

### Replay and stale-report behavior

- Speed report summaries continue to be rebuilt from durable match, participant, and effective rating-event state.
- Repeated reads produce deeply equal API and persisted summary payloads.
- Rating-event reconstruction now applies a total deterministic ordering by placement, placement group, user ID, participant ID, and event ID.
- Replays do not create additional rating rows.
- No-contest/ready-timeout matches remain unrated.

### Shared contract boundary

The result-only completion schema accepts the immutable Speed completion values without broadening the generic completion request contract. Cross-field validation requires exact Speed reason equality and rejects Speed-only completion identity on Standard/non-Speed summaries.

## Open Questions

None for Ticket 169.

## Follow-up Tickets

None required from Ruby. Ticket 171 can consume this response during the focused Wave T blocker recheck.

## Files Changed

- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/rating-finalization.test.ts`
- `apps/api/test/speed-rating-postgres.integration.test.ts`
- `packages/contracts/src/gameplay/schemas.ts`
- `packages/contracts/src/common/contracts.test.ts`
- `apps/api/README.md`
- `agent-communication/responses/ticket-169-ruby-immutable-speed-completion-identity-reads-response.md`

## Tests / Commands Run

TDD RED evidence:

- `node --import tsx --test --test-name-pattern='keeps persisted Speed' test/rating-finalization.test.ts` — exit `1`; expected `forfeit`, observed `all_players_final`.
- `pnpm --filter @wordle-royale/contracts test` — exit `1`; expected Speed persisted completion values were rejected by the old result schema.
- Deterministic replay regression with alternating rating-row source order — exit `1` before sorting; replay participant order changed.
- Cross-mode contract regression — exit `1` before refinement; a Standard result incorrectly accepted Speed-only `deadline` identity.

Final verification:

- `node --import tsx --test test/rating-finalization.test.ts` — exit `0`, 12/12 passed.
- `pnpm --filter @wordle-royale/contracts test` — exit `0`, 24/24 passed.
- `pnpm --filter @wordle-royale/api typecheck` — exit `0`.
- `pnpm --filter @wordle-royale/api test` — exit `0`, 141/141 passed.
- Guarded disposable-schema `pnpm --filter @wordle-royale/api test:speed-rating:postgres` — exit `0`, 2/2 passed after all four migrations; schema dropped afterward.
- `pnpm build` — exit `0` for all participating workspace packages, including web/mobile/API.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`.
- `pnpm validate:workspace` — exit `0`, 9 packages.
- `pnpm secret-scan` — exit `0`, 249 source/config files scanned.
- `/usr/bin/git diff --check` — exit `0`.

Two intermediate disposable-schema setup invocations exited `1` before tests because of a local URL-construction mistake and transient Prisma advisory-lock contention. Both guarded schemas were dropped by the cleanup trap; the corrected final run passed 2/2.

## Evidence / Result

- Focused unit regressions cover repeated forfeit, deadline, and ready-timeout/no-contest reads, stale report repair, alternating effective event row order, deep replay equality, persisted match identity, and exact rating-event counts.
- Shared contracts accept all approved persisted Speed completion reasons, enforce exact public reason equality, and reject cross-mode identity drift.
- Real PostgreSQL coverage creates and reads forfeit, deadline, and no-contest matches, corrupts the cached report summary, repairs it through the real service, rereads it, verifies durable identity convergence, and confirms event counts of 2/2/0.
- The final disposable PostgreSQL schema used a guarded `ticket169_*` name, applied four migrations, passed 2/2 tests, and was dropped with its fixture-owned objects.
- Independent final review: **PASS**, with no remaining correctness or security blocker.

## Risks / Blockers

- No blocker remains for Ticket 169.
- No production or hosted data was touched.
- No credential was persisted.
- No answer word, hash, salt, dictionary content, or raw opponent guess was added to a public read.
- No migration or destructive legacy-data rewrite was introduced.
- The checkout remains shared with adjacent Wave T-Fix tickets; this response attributes only the Ticket 169 changes listed above.
