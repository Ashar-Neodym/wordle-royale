# Ticket 126 — Jasmine Wave R Standard Queue Integration QA Response

Task: Wave R Standard queue integration QA
Agent: Jasmine (QA)
Verdict: **FAIL**

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---|---|
| Required repository gates | PASS after local environment repair | `lint`, `typecheck`, root `test`, `build`, API production-start smoke, local smoke, dependency audit, secret scan, and `git diff --check` all completed successfully. The first combined run stopped at API production-start smoke because the pre-existing local Postgres volume password did not match `docker-compose.yml`; aligning the local role password with the checked-in local-only default restored the gate. |
| Real DB-backed two-user queue join | **FAIL under concurrent cold start** | On a newly migrated and seeded `jasmine_ticket126` Postgres schema, two concurrent first joins produced one `201 queued` and one `409 rating_profile_unavailable`. Postgres logged two serialization failures, including `could not serialize access due to read/write dependencies among transactions` and `The transaction might succeed if retried`. |
| Atomic pairing after retry | PASS | After retrying/requeuing, both users reached `matched` with shared match `6f506836-34e2-4289-8588-00f219b117b7`. DB evidence: 2 matched tickets, 2 distinct users, 2 participant rows, 0 self-match pairs, 1 match. |
| Duplicate/self pairing resistance | PASS for warmed/replayed path | Concurrent replays returned HTTP `200`, the original per-user ticket IDs, and the same match ID. DB still contained exactly 1 match and 2 participants. |
| Cancel/reconnect/timeout semantics | PARTIAL PASS | Matched-ticket cancellation correctly returned `409 ticket_already_matched`; current-ticket reconnect returned the same matched ticket to each user. Unit coverage passed for queued cancellation, reconnect, expiry, rating-window expansion, cooldown, and provisional filtering. The required browser reconnect path did not settle (see blocker 3). |
| Server-authoritative, spoiler-safe match state | PASS | Both authenticated participants received HTTP `200`, state `in_progress`; serialized responses contained none of `answerWord`, `answerWordHash`, or `answerWordSaltRef`. |
| Rating settlement and exactly-once behavior | PASS at persistence layer | A real DB-backed win/loss completed twice concurrently with one shared rating event identity. DB contained exactly 2 participant rating-event rows, 1 match, and updated Glicko profiles `1514` / `1486`, one match each, RD `290`. API tests also passed draw and abandon settlement. |
| Profile/leaderboard expose updated Standard rating and history | **FAIL** | Match history correctly showed the completed match and `+14/-14`, but `/leaderboard?mode=standard_1v1` and both profile summaries continued to expose the older `placement_mmr_v1` profiles at rating `1500`, 0 games. The updated `standard_1v1_glicko_v1` rows existed in Postgres but were not selected by read models. |
| Browser queue states and non-live modes | **FAIL / PARTIAL** | `/play` rendered Standard as `Live queue`; Speed, Classic, and Multiplayer were visibly `Not live yet`. However, the Standard panel remained indefinitely at `Checking for an active search…` / disabled `Checking…` despite healthy API readiness and after repeated navigation. No browser console error was emitted. Searching/matched UI states therefore could not be accepted. |
| Security/scope review | PASS with warning | Parameterized values are used in the raw matchmaking queries; no answer/hash/salt leaked in exercised API states; secret scan passed. No unrelated files were modified by QA. Warning: current automated matchmaking tests use a Prisma mock despite the suite title `database-backed`; they did not detect the real Postgres serialization defect. |

## Commands run + exit codes

- `CI=true pnpm lint && CI=true pnpm typecheck && CI=true pnpm test && CI=true pnpm build && CI=true pnpm smoke:api:prod-start ...` — **exit 1** at `smoke:api:prod-start`; preceding lint/typecheck/test/build succeeded. Failure was local Postgres authentication drift.
- `docker exec wordle-royale-postgres psql ... ALTER USER ...` — **exit 0** (`ALTER ROLE`), aligning the existing local volume with the checked-in local-only Compose credentials.
- `CI=true pnpm smoke:api:prod-start && CI=true pnpm smoke:local && CI=true pnpm deps:check && CI=true pnpm secret-scan && git diff --check` — **exit 0**.
- `pnpm --filter @wordle-royale/api db:migrate:deploy && pnpm --filter @wordle-royale/api db:seed:local` against schema `jasmine_ticket126` — **exit 0**; all 3 migrations applied and deterministic fixtures seeded.
- Real API `/readyz` — HTTP **200**, database `ok`, application schema `ok` with 18 required tables, Redis `ok`.
- Concurrent cold-profile join probe — completed; responses **201** and **409**.
- `docker logs ... wordle-royale-postgres` — **exit 0**; captured real serialization failures during that probe.
- Warm/retry pairing, replay, cancel, match-state, terminalization, and completion probes — completed successfully except the expected matched-cancel `409` responses.
- Postgres integrity queries through `docker exec ... psql` — **exit 0**; 1 match, 2 distinct participants, 0 self-pairs, exactly 2 rating-event rows.
- `CI=true pnpm --filter @wordle-royale/api test` — **exit 0**, 72 pass / 0 fail.
- `CI=true pnpm --filter @wordle-royale/contracts test` — **exit 0**, 18 pass / 0 fail.
- `CI=true pnpm --filter @wordle-royale/rating-tools test` — **exit 0**, 14 pass / 0 fail.
- `CI=true pnpm --filter @wordle-royale/api db:validate` — **exit 0**, Prisma schema valid.

## Browser/visual evidence

Local web: `http://127.0.0.1:3125/play`

Observed:

- Server panel: `Server online · ok`; database/application schema/Redis all `ok`.
- Standard: `Live queue` with `Find match` affordance.
- Speed / Blitz, Classic, Multiplayer: each marked `Not live yet` and exposed only `View prepared mode`.
- Queue client remained in `RECONNECT / Checking for an active search…` with disabled `Checking…` for multiple minutes and after a fresh navigation.
- Browser console: no JavaScript exceptions; only React DevTools informational messages.
- The same page visibly showed leaderboard ratings of 1500 / 0 games, corroborating the API/read-model defect after the DB-backed match had settled to 1514 / 1486.

## Findings

### Blocker 1 — Concurrent first joins can reject one legitimate user

**Likely owner: Freya**

Reproduction:

1. Migrate and seed a fresh Postgres schema with users that do not yet have `standard_1v1_glicko_v1` profiles.
2. Start the real API against that schema.
3. Concurrently POST valid Standard queue joins for Player One and Guest Player.
4. Observe one `201 queued` and one `409 rating_profile_unavailable`.
5. Inspect Postgres logs; observe serialization failures (`could not serialize access due to read/write dependencies`).

Likely cause: `findOrCreateRatingProfile()` converts non-`P2002` create errors to `ConflictException`. A `P2034` serialization failure can therefore be transformed before the outer `inTransaction()` retry loop handles it. The existing mock-based test cannot reproduce Postgres Serializable behavior.

### Blocker 2 — Settled Standard ratings are not exposed by profile/leaderboard reads

**Likely owners: Freya / Ruby**

Reproduction:

1. Seed the current local fixture data.
2. Queue and complete one Standard Glicko match.
3. Verify Postgres contains active `standard_1v1_glicko_v1` profiles at `1514` and `1486` with one game each.
4. GET `/leaderboard?mode=standard_1v1` and `/profiles/player_one/summary`.
5. Observe the APIs return the older active `placement_mmr_v1` profile at 1500 / 0 games, while recent match history shows `+14`.

The system currently allows old and new active profiles for the same user/mode, and read models select the stale profile. This directly fails the acceptance criterion that profile/history/leaderboard expose the updated Standard rating.

### Blocker 3 — Queue reconnect UI does not resolve

**Likely owner: Luna**

Reproduction:

1. Run the local API with healthy database/schema readiness.
2. Run the web app with `NEXT_PUBLIC_API_URL` pointing to that API.
3. Open `/play` as the local authenticated fixture user.
4. Wait or navigate again.
5. Observe the queue panel remain at `Checking for an active search…` with a disabled `Checking…` button indefinitely.

No console exception is emitted. Add a browser/client test that proves active-session reconnect reaches `idle`, `searching`, or `matched`, and ensure the action has a bounded failure path instead of remaining busy forever.

## Required fixes / owner

1. **Freya:** preserve/retry `P2034` at the transaction boundary; add a true PostgreSQL integration test for concurrent cold-profile joins, not only the Prisma mock.
2. **Freya / Ruby:** establish one authoritative active Standard algorithm/profile per user and mode. Migrate or deactivate legacy profiles, and/or make profile/leaderboard reads explicitly select `standard_1v1_glicko_v1`. Add an integration test proving settlement changes are returned by leaderboard and profile APIs.
3. **Luna:** fix and browser-test the reconnect transition so it settles from `reconnecting` and can reach idle/searching/matched/error states.
4. Re-run Ticket 126 after all three blockers are addressed. Do not checkpoint or deploy Wave R from this result.

## Residual risks

- Draw and abandon correctness is backed by passing API/service tests rather than a separate real-Postgres browser flow.
- The existing automated suite overstates database coverage because `apps/api/test/matchmaking.test.ts` replaces `PrismaService` with an in-memory mock.
- Hosted behavior was not evaluated because Ticket 126 is the pre-checkpoint local integration gate; hosted preview is assigned to later Wave R tickets.
