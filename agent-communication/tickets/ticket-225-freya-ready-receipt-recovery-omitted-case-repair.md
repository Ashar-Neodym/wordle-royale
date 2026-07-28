# Ticket 225 — Ready Receipt/Recovery Omitted-Case Repair

Agent: Freya (backend implementation)
Wave: W-Fix — Ticket 223 blockers
Status: Ready

## Scope

Close Ticket 223 backend blockers B1–B2 and missing backend evidence without regressing the now-green simultaneous-ready hosted-latency path.

## Required RED baselines

1. Real PostgreSQL: A ready at t=1s, B ready at t=2s, active match; A uses a different operation ID after the obsolete ready deadline. Current result is false `409 ready_deadline_passed`.
2. Real orchestration path: force post-commit projection failure for each receipt outcome: `committed`, same-ID `replay`, `already_ready`, `late`, and terminal without an existing acknowledgement. Current late/terminal messaging falsely says acknowledgement recorded.

## Repair requirements

- Keep same-ID operation-first replay before reconciliation.
- A participant already marked ready cannot become a late acknowledgement attempt under a different ID; return/project current monotonic state, preserve original operation identity, insert no second mutation, and never restart timestamps.
- Preserve expiry/cancellation terminalization and current-state projection for pending/terminal matches.
- Make projection-failure status/message/details receipt-aware. Only committed/replay/verified-existing-ack outcomes may claim known acknowledgement persistence. Late or terminal-without-ready must not claim a write or instruct unsafe same-ID recovery.
- Post-commit projection must fail closed on zero or multiple rounds rather than selecting arbitrary `findFirst` state.
- Permanently force every required direct/meta/nested P2028, P2034, 40001, 40P01, 55P03, 57014, and dependency class through a real rollback-capable ready flow with persistence assertions—not classifier-only mocks.
- Add a PostgreSQL barrier proving projection starts after the contested write lock is released.
- Align sanitized observability outcomes with retry, timeout, domain conflict, receipt, and projection classes; no IDs, SQL, raw errors, secrets, or spoiler data.
- Preserve 24s/8s/12s/3-attempt/1s budgets, serializable locks, first-ack identity, exactly-once settlement, Standard isolation, and `[201,201]` frozen D*=300ms success.

Run RED→GREEN focused suites, frozen latency, PostgreSQL timing/races, full API, contracts, typecheck/build/security/diff. No hosted access, lifecycle/provider/dictionary change, commit, push, PR, or deploy.
