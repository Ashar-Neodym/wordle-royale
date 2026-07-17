# Ticket 161 — Wave T Speed Integration QA Response

Task: Wave T Speed Integration QA
Agent: Jasmine (QA)
Verdict: **FAIL**

Ticket 162 remains blocked.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Real-PostgreSQL concurrent Speed pairing | PASS | Independent disposable-schema probe issued both Speed joins with `Promise.all`; one shared match, two distinct tickets/users/participants, zero self-pair, duplicate match, or orphan participant. |
| Canonical Speed PostgreSQL gameplay | PASS with coverage gap | Canonical harness passed 5/5 for pairing, readiness/idempotency, concurrent final guesses, ready timeout/no-contest, post-reveal forfeit, hard deadline rejection, terminal rows, and two rating events. Its built-in pairing case is sequential and its reveal helper rewrites timestamps with Node time, so it does not independently prove every timing race. |
| Server-only time adjudication and 75s/100ms rules | PARTIAL | Rules tests passed and implementation samples PostgreSQL time. The canonical PostgreSQL harness does not control and assert a different-bucket winner plus same-bucket draw through genuine DB receipt timing; its concurrent-final assertion accepts either outcome. Required real-database tiebreak evidence is incomplete. |
| Reconnect/deadline recovery | PASS | Current-ticket recovery and fixed persisted deadlines passed focused and PostgreSQL tests. Production-build browser state transitioned from live countdown/round to truthful finalizing without client-side outcome inference or deadline extension. |
| Timeout/forfeit/no-contest | PASS at backend | PostgreSQL harness proved ready timeout creates no rating events, post-reveal forfeit produces win/loss plus exactly two events, and deadline expiry rejects without consuming an attempt. |
| Exactly-once Speed settlement | PASS | Dedicated fresh-schema settlement test passed 1/1; replay retained two apply events and profile/leaderboard/history values converged. Concurrent gameplay settlement also produced exactly two events. |
| Separate Standard/Speed ratings and reads | PASS with defect | Dedicated settlement/read-model test preserved separate Standard and Speed profiles, leaderboard identity, history, and `speed_1v1_glicko_v1`. However, repeated Speed result reads can rewrite the generic public completion reason; blocker below. |
| Standard regression | PASS | Standard real-PostgreSQL concurrency harness passed 3/3, including delayed cold joins; focused Standard unit tests passed; full API suite passed 135/135. |
| Spoiler safety | PASS | Speed opponent snapshots expose progress only. Contract/API/PostgreSQL checks and production DOM inspection found no answer/hash/salt or opponent-word leakage. |
| Browser countdown/accessibility | PASS for exercised states | Production Next build against deterministic API showed server-synchronized countdown, fixed-deadline transition, disabled input and no forfeit during finalizing, labeled input, `aria-busy`, polite atomic live region, no horizontal overflow, zero console messages, and zero JavaScript errors. Visual layout was readable without overlap. |
| Canonical gates | PASS after QA cleanup | Contracts 22/22; focused API 65/65; focused web 14/14; API 135/135; web typecheck/build; full workspace build; workspace validation; Prisma validation; secret scan; `git diff --check` all passed. |

## Blocking findings

### 1. Speed can be advertised live while runtime readiness is unavailable

**Owner:** Freya/Ruby

`LeaderboardReadService.listRankedModes()` derives Speed `enabled` and `queueEnabled` only from `SPEED_1V1_QUEUE_ENABLED`:

- `apps/api/src/leaderboard/leaderboard-read.service.ts:221-229`

Actual database, migrated-schema, dictionary, and expiry-reconciler readiness is computed separately:

- `apps/api/src/health/readiness.service.ts:18-53`

The mode catalog never consumes that runtime result. With the feature flag true but schema, dictionary, or reconciler unavailable, `/ranked/modes` can still advertise a live Speed queue. The web trusts this catalog. This violates the approved fail-closed rule that Speed is live only when the feature gate **and all runtime dependencies** are ready.

The catalog also omits the approved live-contract fields `timeControl.roundTimeSeconds=75` and `timeControl.tieBreaker=server_solve_time_bucket`, so the client cannot verify the full authoritative identity required by the Wave T contract.

**Required fix and regression:** make catalog enablement depend on the same authoritative readiness source; test database/schema/dictionary/reconciler failure separately and require `enabled=false`, `queueEnabled=false`, plus the stable unavailable queue response. Expose and test the approved time-control/tiebreak identity.

### 2. An uncertain repeated-word guess can lose its idempotency identity and consume an extra attempt

**Owner:** Luna

`SpeedGameplayPanel.apply()` clears the retained uncertain request solely when any accepted guess has the same word:

- `apps/web/src/components/SpeedGameplayPanel.tsx:43-56`

Reproduction:

1. Submit word X successfully once.
2. Submit the same word X again with a new request ID.
3. Let the second request commit but drop its response.
4. State refresh sees the earlier accepted X and clears the uncertain second request ID.
5. Retrying creates another UUID at `SpeedGameplayPanel.tsx:110-121`.
6. The server may accept a third attempt instead of replaying the committed second attempt.

This violates the no-duplicate-mutation and uncertain-response retry contract. Snapshot entries have no request identity, so matching only on guess text cannot distinguish repeated legal words.

**Required fix and regression:** correlate accepted attempts to `clientRequestId` or another authoritative operation identity. Add a production-browser/server integration test for same-word repetition with a response dropped after commit; retry must preserve the second request ID and must not create a third guess/mutation row.

### 3. Speed result reads overwrite the generic completion reason

**Owner:** Ruby

`getRankedMatchResult()` always re-enters finalization with `reason: 'all_players_final'`:

- `apps/api/src/gameplay/gameplay-persistence.service.ts:612-634`

When rating events already exist, Speed rebuilds and persists the report using that supplied reason:

- `apps/api/src/gameplay/gameplay-persistence.service.ts:683-701`
- `apps/api/src/gameplay/gameplay-persistence.service.ts:1107-1140`

Therefore reading a match completed by `forfeit` or `deadline` can rewrite `MatchReport.publicSummary.completionReason` to `all_players_final`, while `Match.completionReason` and `speedCompletionReason` still retain the authoritative Speed reason. The result/read models no longer converge on one immutable completion identity.

**Required fix and regression:** derive the public completion reason from persisted Speed adjudication, not the caller's generic read reason. Complete one forfeit and one deadline match, read each repeatedly, and require API result, `Match.completionReason`, `speedCompletionReason`, and persisted report summary to remain stable and consistent.

### 4. Required real-PostgreSQL timing-tiebreak proof is not deterministic

**Owner:** Freya

The canonical integration test directly rewrites reveal timestamps using Node `Date.now()` and accepts either draw or win for concurrent final guesses:

- `apps/api/test/speed-gameplay-postgres.integration.test.ts:60-72`
- `apps/api/test/speed-gameplay-postgres.integration.test.ts:128-152`

That does not prove the required equal-guess ordering through controlled PostgreSQL receipt buckets. It also leaves exact deadline-edge and immutable both-ready race behavior unverified in the real database.

**Required fix and regression:** add a guarded disposable-schema test that controls authoritative PostgreSQL event times and proves:

- equal guesses, lower 100ms bucket wins;
- equal guesses, same bucket draws;
- fewer guesses beats faster time;
- exact deadline edge is accepted and post-edge is rejected;
- concurrent ready acknowledgements persist one immutable reveal/deadline pair.

## Commands run + exit codes

- `pnpm --filter @wordle-royale/contracts test` — exit 0, 22/22.
- Focused API Speed/Standard/rating/read suites — exit 0, 65/65.
- Focused web Speed/Standard/profile suites — exit 0, 14/14.
- `pnpm --filter @wordle-royale/api test:postgres:speed-gameplay` — exit 0, 5/5; schema created, migrated, seeded, and dropped.
- `pnpm --filter @wordle-royale/api test:speed-rating:postgres` against guarded `ticket159_*` schema — exit 0, 1/1; schema dropped.
- Independent genuinely concurrent Speed-pairing probe against guarded `ticket161_*` schema — exit 0, 1/1; schema dropped.
- Standard PostgreSQL harness — one QA invocation exited 1 because the temporary runner passed an unusable sanitized URL; corrected credential-safe wrapper exited 0, 3/3. This was a QA harness configuration error, not a product failure.
- `pnpm --filter @wordle-royale/api test` — exit 0, 135 passed, PostgreSQL suites skipped by their normal environment gates and therefore run separately above.
- `pnpm --filter @wordle-royale/web typecheck` — exit 0.
- `pnpm --filter @wordle-royale/web build` — exit 0.
- `pnpm validate:workspace` — exit 0, nine packages.
- `pnpm --filter @wordle-royale/api db:validate` — exit 0.
- `pnpm secret-scan` — exit 0, 243 files.
- First `pnpm build` — exit 2 because the temporary QA probe itself had strict TypeScript warnings; probe removed.
- Final clean `pnpm build` — exit 0.
- Final `git diff --check` — exit 0.

## Browser/visual evidence

Production Next artifact served against a deterministic contract-compatible API:

- Speed and Standard appeared as separate live modes; Classic and Multiplayer stayed `Not live yet`.
- Speed live board displayed the authoritative countdown prominently.
- The round copy stated that the server deadline is authoritative.
- Input had the accessible label `Your five-letter word`.
- `aria-busy=false` when idle; a polite atomic live region was present.
- Finalizing disabled input, hid the forfeit action, and stated that the browser does not decide expiry, placement, or rating.
- Opponent progress remained count-only and spoiler-safe.
- No horizontal overflow, overlap, clipping, console messages, or JavaScript errors were observed.

This browser pass does not neutralize the uncertain repeated-word idempotency defect because the existing public snapshot lacks the operation identity needed to test/fix that flow correctly.

## Regression/security/scope notes

- No hosted service, provider setting, deployment, or hosted database was touched.
- Standard real-PostgreSQL matchmaking remained healthy.
- Speed and Standard rating/read identities remained separate in the tested normal path.
- No answer word, dictionary content, hash/salt authority, credentials, connection strings, or sensitive IDs are retained in this report.
- The shared intentionally uncommitted Wave T worktree was preserved.

## Cleanup

- Stopped the production Next server and deterministic API.
- Removed all Ticket 161 temporary scripts and probe tests.
- Verified no Ticket 130/158/159/161 disposable schema remains.
- Verified no Jasmine background process remains.
- Final `git diff --check` passed.

## Required fixes / owner

1. **Freya/Ruby:** couple mode-catalog live claims to complete Speed runtime readiness and expose the locked time-control/tiebreak identity.
2. **Luna:** preserve uncertain repeated-word guess identity using authoritative request correlation.
3. **Ruby:** preserve immutable forfeit/deadline completion reason through repeated result reads.
4. **Freya:** add deterministic real-PostgreSQL bucket/deadline/ready-race coverage.
5. **Jasmine:** focused blocker recheck after fixes; Ticket 162 remains blocked until PASS.

## Residual risks

- No load, soak, multi-process expiry-worker, or physical-mobile-device test was run.
- Browser testing used a production build with a deterministic API; real two-user PostgreSQL queue/gameplay behavior was tested separately at service/database level rather than through two browser contexts.

## Final recommendation

**FAIL.** Core Speed pairing, timeout/forfeit, settlement, Standard regression, spoiler boundaries, and browser countdown are substantially implemented and mostly green, but the fail-closed live catalog, uncertain mutation idempotency, immutable completion identity, and deterministic real-PostgreSQL timing proof are release blockers. Ticket 162 must remain blocked.
