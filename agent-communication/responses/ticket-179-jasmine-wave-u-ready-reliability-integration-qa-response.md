# Ticket 179 — Wave U Ready Reliability Integration QA — Response

Task: Ticket 179 — Wave U Ready Reliability Integration QA
Agent: Jasmine (QA)
Verdict: **FAIL**
Date: 2026-07-17

Ticket 180 remains blocked.

## Acceptance criteria checked

| Area | Result | Evidence |
|---|---|---|
| V2 invitation and first-ready boundaries | PASS | Exact equality accepted and +1 ms rejected in real PostgreSQL timing suite; 7/7 passed in each of ten consecutive clean-schema runs. |
| Concurrent joins and simultaneous ready end state | CONDITIONAL | Standard delayed cold joins passed 3/3; Speed concurrent-ready end state passed in all ten timing runs, but the Speed test has no transaction-stage barrier and does not prove both requests reached the contested lock before either committed. |
| Idempotency, reconnect, immutable countdown/deadline | PASS under existing coverage | Real-PostgreSQL timing suite and Speed gameplay suite passed. |
| Expiry/no-contest, rated forfeit, settlement/read convergence | PASS under existing coverage | Speed gameplay 5/5 and Speed rating/read convergence 2/2 passed; no-contest produced no rating events in covered paths. |
| Standard isolation/regression | PASS | Delayed Standard PostgreSQL matchmaking 3/3 and Standard rating/read convergence 1/1 passed. |
| Generation-fenced reconciler health | PASS under existing coverage | Focused health/readiness/operation suites 18/18 passed. |
| Mutation uncertainty recovery | **FAIL** | Independent adversarial helper tests failed 0/2; unsafe `retry_safe` gating and false forfeit correlation remain in the rendered component. |
| Readiness/schema fail-closed behavior | **FAIL** | Canonically migrated isolated schema reported Speed lifecycle unavailable when another schema contained the same enum; operation-table/constraint and complete index predicates are not checked. |
| Accessibility/visual/spoiler smoke | PASS for the exercised invitation/9-second ready path | Production artifact rendered clearly, no horizontal overflow, zero console/JS errors, polite atomic mutation live region present, and no answer/hash/salt/opponent-word material rendered. This does not mitigate the recovery correctness failures. |
| Canonical build/security/cleanup gates | PASS | Build, typechecks, Prisma validation, workspace validation, secret scan, diff check, schema cleanup, process cleanup, and port cleanup passed. |

## Commands run + exit codes

- Focused API mutation/readiness/reconciler/operation tests — **18/18 passed**, exit 0.
- Focused web mutation/API/live-state/read-policy/Standard-state tests — **28/28 passed**, exit 0.
- Contracts — **24/24 passed**, exit 0.
- Full API — **154/154 passed**, exit 0.
- Real-PostgreSQL Speed timing/lifecycle hostile loop — **10 consecutive runs × 7/7 passed**, all exit 0.
- Real-PostgreSQL Speed gameplay — **5/5 passed**, exit 0; disposable schema dropped.
- Real-PostgreSQL delayed Standard matchmaking — **3/3 passed**, exit 0; included six-second-delayed cold joins and schema cleanup.
- Real-PostgreSQL Speed settlement/read convergence — **2/2 passed**, exit 0; disposable schema dropped.
- Real-PostgreSQL Standard rating/read convergence — **1/1 passed**, exit 0; disposable schema dropped.
- Independent web recovery contract probe — **0/2 passed**, exit 1:
  - equal-`serverTime` late `waiting_opponent_ready` snapshot was accepted after `countdown` (`actual=true`, expected `false`);
  - `countdown` + `viewerReady=true` + unavailable operation correlation did not confirm a lost ready response (`actual=false`, expected `true`).
- Independent PostgreSQL readiness diagnostic — exit 0 diagnostic, but canonical result was defective:
  - before dropping `MatchMutationRequest`: `applicationSchema=ok`, `speedLifecycleSchema=unavailable`;
  - after dropping it: `applicationSchema=ok`, `speedLifecycleSchema=unavailable`.
  - Root cause for the baseline false-unavailable result: `pg_enum` readiness count is not restricted to `current_schema()`, so an equivalent enum in another schema makes `count(*) = 2` false.
- `pnpm build` — exit 0.
- Workspace validation — 9 packages, exit 0.
- API and web typechecks — exit 0.
- Prisma validation — exit 0.
- Secret scan — 257 source/config files, exit 0.
- Final `git diff --check` — exit 0.

## Browser/visual evidence

A production Next artifact was exercised against a deterministic local API on ports 3178/3179.

- V2 `waiting_invitation` rendered “Accept your Speed invitation,” explicitly stated that the 20-second phase had not begun, and exposed “Accept and ready up.”
- A ready POST committed its operation identity, delayed its response for nine seconds, and was recovered through authoritative state as `waiting_opponent_ready`.
- Proof endpoint showed exactly **one POST** and one retained operation ID; no automatic replay occurred in this successful delayed-response case.
- The 20-second opponent-ready copy rendered after recovery.
- Browser console: **0 messages, 0 JavaScript errors**.
- Layout: no horizontal overflow (`scrollWidth == clientWidth`), no observed clipping/overlap, and the invitation/button were visually clear.
- Accessibility smoke: mutation region had `aria-live="polite"` and `aria-atomic="true"`; `aria-busy` was false after confirmation.
- No answer, hash, salt, opponent word, or other spoiler authority was visible.

## Findings

### 1. BLOCKER — retry is advertised as safe without the required proof

Owner: **Luna**

`apps/web/src/components/SpeedGameplayPanel.tsx:153-190`, with equivalent guess/forfeit paths around lines 203-248, changes the UI to `retry_safe` after the browser envelope or a failed action/recovery whenever the pending request reference remains.

It does **not** prove all contract prerequisites:

1. the original POST definitively ended;
2. an authoritative recovery read succeeded and proved the operation absent/unready;
3. the applicable authoritative server deadline remains open.

A failed recovery read can therefore expose a user-triggered second POST while the original server action is still completing. Reusing the same operation ID limits durable duplication but does not satisfy the single-flight/no-replay contract and can amplify contention during the exact hosted-latency condition Wave U is intended to fix.

Reproduction:

1. Keep the original ready/guess/forfeit server action alive beyond 35 seconds.
2. Fail or withhold the authoritative recovery GET.
3. Observe `retry_safe` and the retry affordance at browser-envelope expiry.
4. Allow the original action to commit after the affordance appears.

Required fix: track definitive POST settlement separately from browser-envelope uncertainty, require a successful authoritative absence proof, verify the applicable deadline from that snapshot, and only then enable a same-ID user retry.

### 2. BLOCKER — equal-time stale snapshots can regress lifecycle state

Owner: **Luna**

`apps/web/src/components/speed-live-state.ts:97-103` accepts `next.serverTime >= current.serverTime`. There is no local request generation/sequence fence. The independent probe proved that a late `waiting_opponent_ready` response with the same `serverTime` is accepted after a newer `countdown` snapshot.

Required fix: add local read-generation ordering and/or a monotonic lifecycle-state fence; equal timestamps alone cannot establish response freshness. Add component-level races for regular poll, recovery read, and late mutation response ordering.

### 3. BLOCKER — required lost-ready confirmation fallback is missing

Owner: **Luna**

`speedReadyOperationConfirmed()` at `apps/web/src/components/speed-live-state.ts:93-95` checks only exact `viewerReadyOperationId`. The approved contract also requires `countdown`/`in_progress` plus `viewerReady=true` to confirm readiness if the operation response/correlation field is unavailable.

The independent probe failed this exact case. The component can retain a pending ready ID after the authoritative match has started and later mislabel it expired.

Required fix: implement the approved fallback without weakening exact correlation in pre-start waiting states, then add focused and component-level tests.

### 4. BLOCKER — terminal state is falsely treated as forfeit confirmation

Owner: **Luna**

`apps/web/src/components/SpeedGameplayPanel.tsx:80-87` clears any pending forfeit and announces “Terminal server state confirmed the forfeit outcome” for every `completed` or `voided` snapshot. A worker `ready_timeout`, `invitation_timeout`, opponent action, or another terminal cause can therefore be misattributed to this operation.

Required fix: correlate forfeit by its exact persisted operation identity/outcome, or use truthful neutral copy when terminal state cannot prove causality.

### 5. BLOCKER — lifecycle readiness is not schema-isolated or complete

Owner: **Freya**

`apps/api/src/prisma/prisma.service.ts:127-161` counts `SpeedCompletionReason` enum labels without restricting `pg_type.typnamespace` to `current_schema()`. A fresh migrated QA schema therefore reported `speedLifecycleSchema=unavailable` solely because another schema contained the same enum.

Additionally:

- `requiredApplicationTables` at lines 26-45 omits `MatchMutationRequest`;
- readiness does not verify the operation table’s exact participant/kind/request-ID uniqueness needed for idempotency;
- index checks do not require the full canonical predicates, including `rankedMode='speed_1v1'` and `status='pending'`.

Required fix: namespace all catalog checks, require operation persistence and its exact uniqueness shape, and structurally verify complete due-index keys/predicates.

### 6. BLOCKER — required hostile PostgreSQL race evidence is incomplete

Owner: **Freya**

Ten clean-schema timing runs passed, but `speed-timing-postgres.integration.test.ts:186-206` uses `Promise.all` without a transaction-stage barrier. It proves the final concurrent end state, not that both ready requests reached lock contention before either committed.

The required matrix still lacks deterministic real-PostgreSQL proof for:

- ready versus pre-start cancellation;
- ready versus worker expiry;
- two reconcilers terminalizing the same due match exactly once;
- generation change after eligibility check but before transaction commit;
- cancellation immediately before versus exactly at `startsAt`;
- operation replay after expiry before a read/worker first terminalizes the row.

Required fix: add deterministic transaction-stage barriers/controlled DB clock advancement and repeat the hostile matrix on clean schemas.

### 7. BLOCKER — mixed-serving-version activation is not fenced

Owner: **Freya / Yuna**

The contract requires mixed API instances to fail readiness until every serving instance supports the active ready lifecycle. New match creation writes V2 unconditionally, while operational readiness checks local schema/dependencies only; no shared active lifecycle capability/generation is compared across the serving fleet.

Required fix: add a shared activation identity/capability gate, or provide an equivalent deployment/readiness mechanism that independently proves old and new instances cannot concurrently serve incompatible lifecycle semantics.

## Regression/security/scope review

- Standard queue and rating/read behavior remained green.
- Existing Speed timing, gameplay, settlement, and generation-health suites remained green.
- No secret, credential, cookie, connection string, answer authority, answer hash/salt, or spoiler was retained in the report.
- No deployment, provider/config change, commit, push, hosted database mutation, or feature activation was performed.
- Existing shared/uncommitted worktree changes were preserved.

## Cleanup

- Temporary QA tests and `/tmp/ticket179_mock.py` removed.
- Ports 3178 and 3179 confirmed closed.
- No tracked background process remained.
- No matching Ticket 179/170/158/130/169/131 disposable schema remained.
- Final `git diff --check` passed.

## Required fixes / owner

- **Luna:** fix retry-safe proof, equal-time/generation stale-response fencing, lost-ready fallback, exact/neutral forfeit reconciliation, and add component-level recovery/accessibility race tests.
- **Freya:** fix namespaced and complete readiness checks; add deterministic real-PostgreSQL hostile race coverage; establish mixed-version activation fencing.
- **Yuna:** keep Ticket 180 blocked until an independent rerun passes all hostile probes.

## Residual risks

The passing happy-path nine-second browser ready recovery and broad green suites show the intended architecture is close, but they do not cover the unsafe 35-second retry edge, ambiguous terminal outcomes, equal-timestamp response races, or contested worker/cancellation transitions. These are central reliability semantics, not cosmetic test gaps.
