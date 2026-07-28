# Ticket 235 — Freya Ready Lock-Hold Round-Trip Reduction Repair Response

Status: **Implemented and locally verified**

## Implementation

Changed only the Speed ready lock/hydration path and its focused PostgreSQL latency test:

- Preserved the dedicated `Match ... FOR UPDATE` as the first/global serialization statement.
- Replaced the separate `MatchRound` and ordered `MatchParticipant` lock reads with one joined, narrowly aliased query using `ORDER BY round_state."roundNumber", participant."id" FOR UPDATE OF round_state, participant`.
- Hydrates the round and participants from that same result.
- Fails closed unless the joined result is exactly two rows, one distinct round, and two distinct participants; viewer membership remains checked before writes.
- Did not change isolation, timeout/lifecycle constants, environment, Standard gameplay, schema, receipt behavior, or projection behavior.
- Existing sanitized structured error metrics/mapping remain in place and the real rollback matrix was re-run.

## PostgreSQL evidence

Command:

```text
pnpm --filter @wordle-royale/api run test:postgres:speed-ready-hosted-latency
```

Result: **PASS, 4/4 tests**, disposable schema migrated/seeded and dropped successfully.

Latency matrix emitted by the test:

```json
{"result":"GREEN_FROZEN","frozenLatencyMs":300,"callbackEntries":5,"lockWaitObserved":true,"elapsedMs":[4553,7372],"latencyMatrix":[{"latencyMs":400,"elapsedMs":[6238,9976]},{"latencyMs":500,"elapsedMs":[8025,12166]},{"latencyMs":300,"elapsedMs":[4553,7372]}],"publicStatuses":[201,201],"persistence":{"readyCount":2,"mutationCount":2,"ratingCount":0}}
```

The 400ms case directly exercises the diagnosed 5–6s holder-pressure region (first completion 6238ms), while 500ms reaches 8025/12166ms. All 300/400/500ms simultaneous pairs fulfilled. The focused test additionally proves on real PostgreSQL:

- lock waiting was observed;
- the first captured contended lock SQL is `Match FOR UPDATE`;
- every successful callback has one joined round/participant locking round trip;
- both ready rows and exactly two ready receipts persist;
- one ready window/start and aligned round start/deadline persist;
- zero rating applies occur;
- HTTP pair is `[201,201]`;
- replay and different-ID B1 do not replace timestamps or add receipts;
- projection-failure outcomes remain truthful;
- direct/meta/nested `P2034`, `40001`, `40P01`, `55P03`, `P2028`, `57014`, connection and unknown classes preserve retries/status sanitization and rollback;
- malformed round cardinality and post-commit projection lock barrier remain covered.

## Other verification

```text
CI=true pnpm --filter @wordle-royale/api exec node --import tsx --test test/speed-mutation-policy.test.ts
PASS: 10/10

pnpm --filter @wordle-royale/api run typecheck
PASS

git diff --check
PASS
```

No full API/validate run was attempted within the ticket's short timebox. No network, hosted/provider, environment, lifecycle/config, GitHub, commit, push, PR, or deployment action occurred.

## Files modified by Ticket 235

- `apps/api/src/gameplay/speed-gameplay.service.ts`
- `apps/api/test/speed-ready-hosted-latency-postgres.integration.test.ts`

## Preserved pre-existing accepted harness changes

These remain untouched and are not Ticket 235 implementation files:

- `package.json` (pre-existing modified)
- `scripts/hosted-speed-smoke-core.mjs` (pre-existing untracked)
- `scripts/hosted-speed-smoke.mjs` (pre-existing untracked)
- `scripts/hosted-speed-smoke.test.mjs` (pre-existing untracked)
