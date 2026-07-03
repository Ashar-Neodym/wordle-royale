# Ticket 52 — Match Completion Result and Rating Finalization Endpoints Response

## Summary

Ticket 52 is complete.

Implemented the missing public/local ranked result endpoints on the existing NestJS gameplay API:

- `POST /matches/:matchId/complete`
- `GET /matches/:matchId/result`

The endpoints use the Ticket 45 contract schemas and the Ticket 48 `GameplayPersistenceService.finalizeRankedMatchRatings(...)` transaction slice. Active/incomplete ranked matches are rejected before rating finalization, result summaries are unavailable until completion, repeat completion/result calls do not double-apply rating events, and explicit pre-rating void completion returns a spoiler-safe result with `ratingEvent: null`.

## Decisions / Recommendations

1. **Completion remains server-authoritative.**
   - `POST /matches/:matchId/complete` accepts the shared `completeRankedMatchRequestSchema`, but it does not trust the client to decide rating eligibility.
   - For normal `all_players_final` completion, every participant must already have a terminal outcome: `solved`, `failed`, `abandoned`, or `voided`.
   - Incomplete/active matches return `match_not_ready_for_completion` and do not create rating rows.

2. **Result reads are completion-gated.**
   - `GET /matches/:matchId/result` returns the persisted `MatchReport.publicSummary` only after the match status is `completed`.
   - Active matches return `match_result_not_ready`.

3. **Rating application is idempotent through the existing Ticket 48 service.**
   - Repeated completion calls reconstruct the existing logical rating event from persisted per-participant `RatingEvent` rows.
   - Tests and live smoke confirmed only two `apply` rows exist for a two-player completed match after repeated completion.

4. **Void completion is exposed only for pre-rating no-rating completion.**
   - `reason: "voided"` marks pending participants voided and returns a completed summary with `ratingEvent: null`.
   - If an applied rating event already exists, void completion now rejects with `match_already_rated` so future reversal/void-rating work can handle it explicitly instead of silently hiding applied rating history.

5. **Spoiler safety preserved.**
   - Completion/result responses return final standings and rating deltas only.
   - They do not expose plaintext answers, `answerWordHash`, or `answerWordSaltRef`.

## Detailed Output

### Endpoint behavior added

#### `POST /matches/:matchId/complete`

Request body:

```json
{
  "clientRequestId": "uuid",
  "matchId": "uuid",
  "reason": "all_players_final"
}
```

Implemented behavior:

- validates request body through `completeRankedMatchRequestSchema`;
- rejects route/body `matchId` mismatch with `route_body_mismatch`;
- rejects non-ranked matches with `match_not_ranked`;
- rejects active/incomplete normal completion with `match_not_ready_for_completion`;
- calls `finalizeRankedMatchRatings(...)` only after normal terminal eligibility is satisfied;
- supports explicit `reason: "voided"` no-rating completion when no applied rating rows exist;
- returns the shared `RankedMatchResultSummary` envelope.

#### `GET /matches/:matchId/result`

Implemented behavior:

- rejects unknown/non-ranked matches;
- rejects active/incomplete matches with `match_result_not_ready`;
- returns the persisted public match result summary once available;
- falls back to idempotent finalization for completed matches without an existing report.

### Tests added/expanded

Expanded `apps/api/test/gameplay-controller.test.ts` to cover:

- active/incomplete completion rejection;
- result-read rejection before completion;
- successful terminal completion with rating deltas;
- idempotent repeated completion with no double rating application;
- explicit void completion with no rating rows.

## Open Questions

None blocking this ticket.

Non-blocking follow-up: the current local stub auth only submits guesses for one local user, so live end-to-end terminalizing the second participant still needs either a true multi-user auth path or a dev/admin test helper. For this ticket's live smoke, I used a direct local DB update to put the second participant into a terminal outcome before calling the public completion endpoint.

## Follow-up Tickets

1. Add a true multi-user/dev-auth path or admin test helper so local live smoke can terminalize every participant without direct DB edits.
2. Add explicit post-rating void/reversal endpoints/services using `RatingEventType.void` / `reversal` instead of overloading match completion.
3. Improve gameplay progression so all participants reaching max attempts can terminalize round/match state naturally without manual DB setup.
4. Ticket 55 can wrap this into a repeatable reset + ranked completion smoke script.

## Files Changed

Ticket 52 implementation/testing:

- `apps/api/src/gameplay/gameplay.controller.ts`
- `apps/api/src/gameplay/gameplay-persistence.service.ts`
- `apps/api/test/gameplay-controller.test.ts`
- `agent-communication/responses/ticket-52-match-completion-result-and-rating-finalization-endpoints-response.md`

Note: the repository working tree already contains many modified/untracked files from prior tickets and parallel Wave H work. I kept code changes focused to the gameplay controller/service and controller tests.

## Tests / Commands Run

- `pnpm --filter @wordle-royale/api test` — exit `0`; 29/29 tests passed.
- `pnpm --filter @wordle-royale/api build` — exit `0`; API typecheck passed.
- `pnpm --filter @wordle-royale/api db:validate` — exit `0`; Prisma schema valid.
- `pnpm deps:check` — exit `0`; Docker Compose v5.2.0 config check passed.
- `pnpm deps:up` — exit `0`; local Postgres/Redis started for live smoke.
- `DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:migrate:deploy` — exit `0`; no pending migrations.
- `DATABASE_URL='<local-postgres-url>' pnpm --filter @wordle-royale/api db:seed:local` — exit `0`; applied local fixture seed.
- Started API on port `3022`; tracked API dev process was stopped after smoke.
- Live HTTP/DB smoke against local Postgres/Redis — completed with notes below.

Earlier live-smoke attempts/notes:

- One attempted direct Prisma smoke helper failed with Prisma auth initialization in the temporary standalone script. I switched to public HTTP calls plus `docker exec ... psql` for the one local-only participant terminalization step.
- One live completion attempt correctly returned `400 match_not_ready_for_completion` while a participant was still pending.

## Evidence / Result

### API test evidence

```text
▶ ranked gameplay REST endpoints
  ✔ starts a lobby-backed ranked match and returns a spoiler-safe success envelope
  ✔ rejects route/body match mismatch with the shared error envelope
  ✔ submits guesses through server-authoritative scoring and exposes only my safe state
  ✔ rejects result and rating finalization while a ranked match is still active/incomplete
  ✔ completes terminal matches, returns rating deltas, and remains idempotent
  ✔ allows explicit void completion without applying rating rows
✔ ranked gameplay REST endpoints
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

### API build evidence

```text
$ pnpm run typecheck
$ tsc --noEmit -p tsconfig.json
```

### DB validation evidence

```text
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

### Dependency check evidence

```text
Using Docker Compose from DOCKER_CONFIG=/home/ashar/.hermes/profiles/yuna/home/.docker.
Docker Compose version v5.2.0
docker compose config passed.
Local dependency check passed.
```

### Live smoke evidence

Observed public HTTP sequence:

```text
POST /lobbies -> 201 error=null
POST /lobbies/<lobbyId>/join -> 201 error=null
POST /matches/ranked/start -> 201 error=null
POST /matches/<matchId>/rounds/<roundId>/guesses -> 201 error=null
POST /matches/<matchId>/complete -> 400 error=match_not_ready_for_completion
```

After using local DB setup to mark both participants terminal:

```text
UPDATE 1
POST /matches/<matchId>/complete -> HTTP 201, error=null
GET /matches/<matchId>/result -> HTTP 200, error=null
POST /matches/<matchId>/complete -> HTTP 201, error=null
SELECT count(*) FROM "RatingEvent" WHERE matchId=<matchId> AND type='apply' -> 2
```

Smoke match IDs:

```text
matchId=722ce73f-11e7-4372-b53d-ade3f8482dfd
roundId=637192a4-0294-48b9-81d2-0844cf8a2c33
ratingDeltas=+16,-16
```

Void/no-rating live smoke:

```text
POST /matches/c2345678-1234-4234-8234-123456789abc/complete reason=voided -> HTTP 201, error=null, ratingEvent=null
SELECT count(*) FROM "RatingEvent" WHERE matchId='c2345678-1234-4234-8234-123456789abc' -> 0
```

### Runtime cleanup

- Stopped the tracked API dev process after smoke.
- Left Docker Compose Postgres/Redis running for follow-on Wave H tickets, consistent with recent local workflow. Cleanup command if needed:

```bash
pnpm deps:down
```

## Risks / Blockers

- No blocker remains for Ticket 52.
- Auth is still local/stubbed; true multi-user completion smoke needs future auth/dev-helper work.
- Local DB state is not isolated/reset; this ticket added smoke rows. Ticket 55 is expected to improve repeatability/reset.
- Post-rating void/reversal is intentionally not implemented here; current endpoint rejects `reason: "voided"` once applied rating rows exist.
