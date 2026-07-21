# Ticket 164 — Final Hosted Wave T Speed QA Response

Task: Ticket 164 — Final Hosted Wave T Speed QA
Agent: Jasmine (QA)
Verdict: **FAIL**

Wave T Speed is not ready for final release. The concurrent-ready reliability warning from Ticket 163 reproduced as a deterministic hosted failure: two ready acknowledgements dispatched within 0.535 ms of each other did not both commit before the server-owned 20-second ready deadline. The second request returned `409 ready_deadline_passed`, and the match was voided with only one participant ready.

## Acceptance criteria checked

| Criterion | Result | Evidence |
|---|---:|---|
| Exact merged SHA, main CI, and provider deployment identity | PASS | Independently verified PR #10 merged to `07aa546b157199a192cc8d156b52a26a4eeb8118`; remote `main`, successful main workflow `29559649001`, Vercel production deployment `5484991195`, and Railway production deployment `5484986014` all identify that SHA. |
| Hosted health/schema/dictionary/reconciler readiness | CONDITIONAL PASS | Health was 200. Readiness initially failed closed with `speedRuntime=unavailable` and Speed catalog disabled, then recovered. Twelve subsequent one-second samples were 12/12 `ok`; final readiness and catalog were healthy/live. The transient cold/reconciliation flap is a reliability observation, not the primary blocker. |
| Mode catalog identity and gating | PASS | Standard enabled; Speed exposed the locked 75/20/3/6/100 ms ruleset/tiebreak/rating identity; Classic and Multiplayer disabled. Catalog correctly disabled Speed while runtime health was unavailable. |
| Two-session Speed queue/pairing | PASS | Two isolated preview users produced distinct tickets, one shared Speed match, distinct users, and no self-pairing. Concurrent join responses were 7.519 s and 17.760 s. |
| Simultaneous two-client ready acknowledgements | **FAIL** | Dispatch skew was 0.535 ms. First ready returned 201 in 8.391 s; second returned 409 `ready_deadline_passed` in 18.894 s. Both state reads converged on `voided`, `readyCount=1`; one viewer was ready and the other was not. |
| Server-authoritative countdown/reconnect | **FAIL / blocked by ready failure** | No countdown/reveal was created. Reconnect correctly preserved the same match/round and voided state, but successful countdown/reconnect could not be exercised in this run. |
| Timeout and forfeit paths | PARTIAL | The hosted ready deadline correctly voided the failed match. A post-reveal forfeit could not be exercised because the match never reached reveal. Ticket 163's prior forfeit evidence is useful context but is not substituted for independent final QA. |
| Exactly-once Speed settlement and profile/history/leaderboard convergence | NOT REACHED | The ready-timeout match was no-contest/voided, so no rated settlement was expected. Final rated lifecycle checks were blocked by the release defect. |
| Standard isolation/regression | PARTIAL | Standard remained enabled and its public UI/read surfaces were healthy. The attempted Standard join occurred only after Speed had already voided, so its 201 response was correct and cannot prove active-match isolation. |
| Browser console/network/accessibility/layout | PASS with polish note | Hosted `/play` rendered correct mode labels and healthy runtime state, exposed six live/status regions, had no horizontal overflow, no failed browser resources, zero console messages, and zero JavaScript errors. The narrow left-column demo-session card wraps excessively on desktop but remains usable. |
| Spoiler/secret safety | PASS for inspected surface | No credential, cookie, token, connection string, answer authority, hash, or salt value was exposed or retained. Browser explanatory copy mentions the words “answer/hash/salt” but exposes no authoritative value. Result-body safety was not reached. |
| Cleanup | PASS with natural-expiry note | In-memory cookies and the temporary local probe were removed; no local QA process remains. The Speed match is terminal/voided. A Standard ticket created after voiding could not be cancelled after the intentionally in-memory cookie jar exited, but its 60-second queue window elapsed and it is no longer active. No hosted database/provider edit was used. |

## Release blocker

### Concurrent ready cannot reliably complete inside the advertised ready window

**Owners:** Freya (backend/runtime), Luna (web mutation budget/recovery), Elisa/Athena if the 20-second contract itself must change
**Severity:** Release blocker

Reproduction:

1. Create two isolated hosted preview sessions.
2. Submit two Speed joins concurrently.
3. Confirm one shared non-self match.
4. Pre-generate one stable ready operation ID per user.
5. Release both `POST /matches/{matchId}/ready` requests behind one local barrier.
6. Observe dispatch skew of 0.535 ms.
7. First request returns 201 after 8.391 s.
8. Second request returns 409 `ready_deadline_passed` after 18.894 s.
9. Read authoritative state from both users.
10. Both return `voided`, `readyCount=1`; only one participant is persisted ready.

This independently reproduces and sharpens Ticket 163's prior >120-second concurrent-ready warning. The failure is not caused by sequential diagnostic reads: no match-state read occurred before both ready requests were dispatched.

The practical window is smaller than the advertised 20 seconds because `readyDeadlineAt` begins at server match creation, while the concurrent join response itself took up to 17.760 seconds. The ready requests then required 8.391 and 18.894 seconds. Even perfectly simultaneous human actions therefore cannot reliably satisfy the current hosted timing/transaction path.

## Related web risk

Static review found that Speed ready, forfeit, and guess server actions use the generic API mutation timeout:

- `apps/web/src/lib/api-client.ts:217` defaults to 1,200 ms.
- `markSpeedMatchReady()` and `forfeitSpeedMatch()` do not override it (`apps/web/src/lib/api-client.ts:384-389`).

Observed hosted API mutations took 8–19 seconds in this recheck and up to 14.491 seconds in Ticket 163. The production web path therefore aborts these calls long before ordinary hosted completion, then relies on uncertain-state recovery. For ready, that recovery competes with the same 20-second window. This materially worsens the reproduced blocker.

## Required fixes

### Freya

1. Diagnose hosted concurrent-ready transaction latency/serialization and the fact that most of the ready window can elapse before clients receive pairing.
2. Preserve server-authoritative timestamps, generation-fenced health, operation idempotency, and single-match invariants.
3. Add a deterministic two-client integration test that includes response/transaction delay and proves both simultaneously dispatched ready operations commit before the contract deadline.
4. Do not merely weaken fail-closed deadline enforcement.

### Luna

1. Give ready/forfeit/guess mutations explicit lifecycle-derived budgets appropriate to hosted latency.
2. Preserve stable operation IDs across uncertain responses.
3. Ensure ready recovery cannot consume the entire ready window before authoritative state is known.
4. Add production-shaped tests where ready takes 8–19 seconds.

### Elisa/Athena

If the 20-second ready contract or when its clock starts must change, approve that contract explicitly. Do not silently widen or shift it as an implementation workaround.

### Yuna

Keep Wave T unreleased. If Speed is already publicly enabled, use the approved fail-closed feature gate or a reviewed revert/deployment procedure; do not destructively remove the additive schema.

## Commands and runtime evidence

- GitHub PR/API checks — exit 0; merged SHA and main CI aligned.
- GitHub deployments/status APIs — exit 0; Vercel and Railway production success aligned to merge SHA.
- Hosted health/readiness/catalog probes — HTTP 200; initial Speed fail-closed, 12/12 subsequent warm samples healthy, final healthy.
- Independent hosted lifecycle probe — exited 1 on the expected final assertion because the match was authoritatively voided before countdown.
- Concurrent joins — HTTP 201/201, 7.519 s / 17.760 s.
- Concurrent ready — HTTP 201/409, 8.391 s / 18.894 s, 0.535 ms dispatch skew.
- Authoritative post-ready states — HTTP 200/200, both `voided`, one of two ready.
- Browser `/play` — zero console/JS errors, zero failed resources, no horizontal overflow.
- Final `git diff --check` — exit 0.

## Browser/visual evidence

The production `/play` page visibly showed:

- Standard — Live queue;
- Speed / Blitz — Live queue;
- Classic — Not live yet;
- Multiplayer — Not live yet;
- Server online / ready with `speedRuntime: ok`;
- accessible session-start buttons and status/live regions.

No clipping, overlap, failed resources, console errors, or JavaScript errors were observed. A non-blocking desktop polish issue remains: the left-column “Start demo mode before lobby writes” card becomes excessively narrow and wraps almost every word.

## Harness disclosure

The first authorized attempt created two preview sessions but stopped before queueing because the probe expected `publicHandle` instead of the committed `handle` field. No ticket or match was created. Ashar explicitly approved one clean replacement run. The corrected run is the only lifecycle evidence credited.

After the ready failure, the probe attempted the planned Standard-isolation mutation. Because authoritative Speed state was already `voided`, Standard correctly accepted a new ticket. The probe then stopped at its in-progress assertion; this is a QA sequencing consequence, not a Standard product defect. The ticket's active queue window subsequently elapsed.

## Residual risks

- Rated forfeit, gameplay deadline, exactly-once settlement, and profile/history/leaderboard convergence were not independently reached because the release blocker terminated the lifecycle.
- No load/soak, multi-region, browser-mobile, or multi-process leader-election test was performed.
- Result endpoint public-access policy and GET-triggered settlement remain outside this focused failure reproduction.

## Final recommendation

**FAIL. Do not release Wave T Speed.** The final hosted environment cannot reliably accept two genuinely simultaneous ready acknowledgements within its own advertised window. The prior Ticket 163 warning is now a reproduced release blocker. Keep Speed fail-closed/disabled until a focused fix is deployed and Jasmine passes a new hosted concurrent-ready recheck followed by the full countdown, reconnect, timeout/forfeit, exactly-once settlement, profile/history/leaderboard, Standard-isolation, and spoiler-safety lifecycle.
