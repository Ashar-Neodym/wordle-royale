# Ticket 225 — Ready Receipt/Recovery Omitted-Case Repair Response

Agent: Freya implementation recovered and independently verified by Athena
Status: Complete candidate; ready for Ticket 227 after Ticket 226

## Repairs

- Same-ID replay remains operation-first.
- Different-ID calls from an already-ready participant no longer become false late acknowledgements after the obsolete ready deadline; current monotonic state projects without a second mutation or timestamp restart.
- Projection-failure errors are receipt-aware. Committed/replay/already-ready outcomes report known acknowledgement persistence; late and terminal-without-ready outcomes explicitly report no acknowledgement recorded and disable unsafe retry guidance.
- Commit and projection paths require exactly one round and two participants.
- The real ready-flow structured error matrix now covers direct/meta/nested retry, timeout, dependency, and unknown classes with rollback/persistence assertions.
- A PostgreSQL barrier proves projection starts only after the write transaction releases its locks.
- Budgets remain 24s lifecycle / 8s maxWait / 12s execution / 3 attempts / 1s reserve.

## Verification

- Focused mutation policy: 10/10 PASS.
- API typecheck: PASS.
- Hosted-latency PostgreSQL gate: 4/4 PASS.
  - frozen D*=300ms;
  - HTTP [201,201];
  - ready=2, mutations=2, ratings=0;
  - lock-wait and post-commit lock-release proof PASS;
  - receipt matrix and malformed round cardinality PASS.
- PostgreSQL timing: 7/7 PASS.
- Hostile lifecycle races: 80/80 PASS across ten disposable iterations.
- Full API suite: PASS.
- Disposable schemas were dropped.

## Recovery note

The Freya subagent timed out before writing its response. Athena inspected and preserved the partial implementation. Two test-fixture mistakes were corrected during independent verification: a negated-message substring assertion and an in-progress assertion one second before countdown completion. No production invariant was weakened.

## Safety

No hosted access, deployment, lifecycle/provider/dictionary change, commit, push, PR, merge, or gameplay write occurred.
