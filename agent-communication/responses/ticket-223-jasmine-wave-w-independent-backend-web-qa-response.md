Task: Ticket 223 — Wave W Independent Backend/Web QA
Agent: Jasmine (QA)
Verdict: FAIL

## Verdict rationale

The simultaneous-ready happy path is materially improved: the frozen hosted-latency PostgreSQL gate independently produced HTTP `[201,201]`, two ready participants, two mutation identities, one start/deadline identity, no rating event, and no budget widening. Canonical API, contracts, web, build, and security gates are green.

However, independent omitted-case testing found two backend correctness/recovery defects and three web authority/truthfulness defects. Two were reproduced in real PostgreSQL and a production Next browser fixture; the others were reproduced through the real orchestration/authority functions. Ticket 224 checkpoint/deploy work is not authorized.

## Acceptance criteria checked

### Backend

- Frozen `D*=300ms` hosted-latency PostgreSQL GREEN: PASS.
- Simultaneous HTTP ready acknowledgements: PASS, `[201,201]`.
- Persisted simultaneous-ready cardinality: PASS, `readyCount=2`, `mutationCount=2`, `ratingCount=0`.
- One immutable ready window/countdown/deadline identity: PASS in canonical PostgreSQL gates.
- No timing/budget widening: PASS; constants remain `24s / 8s maxWait / 12s execution / 3 attempts / 1s reserve`.
- Direct/meta/nested structured classifier table: PASS in focused pure tests.
- Standard isolation, reconciler safety, cancellation/expiry races, and spoiler-safe canonical tests: PASS in the executed suites.
- Same-ID replay after expiry: PASS in canonical PostgreSQL timing/race tests.
- Different-ID already-ready request after the obsolete ready deadline: FAIL.
- Truthful post-commit projection error for late/terminal receipts: FAIL.
- Every required direct/meta/nested class forced through a real rollback-capable ready-flow matrix: NOT PROVEN; current flow tests use selected shapes and mocked pre-write transaction failures.
- Projection-after-lock-release database proof: NOT PROVEN by the permanent hosted test; separate transactions are visible structurally, but no projection barrier inspects lock release.

### Web/API

- One configured credential-free origin and web/API revision agreement: PASS for normal fixtures.
- Coherent enabled and explicit configured-disabled authority fixtures: PASS.
- Temporary configured Speed unavailability represented as unavailable rather than disabled: FAIL.
- Healthy-looking minimal/noncanonical stub rejected: FAIL.
- Cross-origin redirected authority reads rejected: FAIL.
- Canonical production build and desktop browser flow: PASS mechanically.
- Browser console/JavaScript errors: PASS, 0/0.
- Standard queue remains visibly live in the Speed-degraded fixture: PASS, but the global status simultaneously presents the API as authoritative while exposing lifecycle unavailability.
- Secret/spoiler scan of rendered page: PASS; only explicitly labeled practice fixture content and safe origin/revision diagnostics appeared.
- Mobile responsive browser proof: not credited; available browser viewport remained desktop-only. No obvious desktop horizontal overflow was observed.

## Blocking findings

### B1 — Different-ID already-ready calls become falsely late after the old ready deadline

Severity: release-blocking backend idempotency/correctness defect
Owner: Freya

`commitReady()` calculates/reconciles lateness and returns `ready_deadline_passed` before checking `state.viewer.readyAt`:

```text
replay check
DB time
calculate readyLate
reconcile
return late
return terminal
return already_ready
```

A temporary real-PostgreSQL test performed:

1. Player A ready at database time `t=1s`.
2. Player B ready at `t=2s`; match becomes active with start `t=5s` and round deadline `t=80s`.
3. At `t=30s`, player A calls ready with a different operation ID.

Expected under Ticket 220 §5.6:

- normal current snapshot;
- original ready operation identity;
- no second mutation identity;
- no timestamp/window restart.

Actual:

```text
ConflictException
409 ready_deadline_passed
```

The seven canonical timing cases passed, but the eighth omitted-case adversary failed exactly at `speed-gameplay.service.ts:190`.

Required fix:

- Preserve operation-first same-ID replay.
- Ensure an already-ready participant's different-ID request cannot be converted into a stale ready-window acknowledgement attempt.
- Preserve terminalization/current-state projection semantics without inserting a second mutation or rewriting timestamps.
- Add this real PostgreSQL after-deadline/active-game case permanently.

### B2 — Late/terminal projection failure falsely says a ready acknowledgement was recorded

Severity: release-blocking backend recovery-contract defect
Owner: Freya

`markReady()` sends every receipt through post-commit projection and maps every projection failure to the same acknowledgement-recorded response. A direct orchestration adversary forced a `late` receipt and projection failure.

Actual public output:

```json
{
  "status": 503,
  "code": "speed_snapshot_unavailable",
  "message": "The ready acknowledgement was recorded, but the latest Speed state is temporarily unavailable.",
  "details": { "commitKnown": true, "retrySafe": true }
}
```

A `late` or pre-existing `terminal` receipt may contain no new ready mutation identity. The message and same-ID recovery implication are therefore false.

Required fix:

- Make projection-failure messaging/details receipt-aware.
- Do not claim an acknowledgement was recorded when the receipt did not represent `committed`, `replay`, or an actual existing acknowledgement.
- Add late, terminal-without-ready, already-ready, and committed projection-failure tests with persistence assertions.

### W1 — Configured but temporarily unavailable Speed is rendered authoritative disabled

Severity: release-blocking web truthfulness defect
Owner: Luna

The API intentionally emits:

```json
{
  "enabled": true,
  "queueEnabled": false,
  "unavailableReason": "speed_temporarily_unavailable"
}
```

when Speed is configured but operational/lifecycle availability is temporarily closed. `assessWebApiAuthority()` collapses any non-`enabled && queueEnabled` pair to authoritative disabled before checking runtime/lifecycle status.

Independent function result:

```json
{
  "status": "disabled",
  "availability": "authoritative",
  "reason": null
}
```

Production-browser evidence showed the contradiction on `/play`:

- Speed panel: **“Speed queue is not enabled”**.
- Speed card: **“Not live yet”**.
- Global diagnostics: `speedLifecycleActivation: unavailable`.
- Global status: **“Authoritative API online · ok”**.
- Standard remained **“Live queue”**.

Required fix:

- Treat only a coherent explicit configuration-disabled identity as `disabled`.
- Treat `enabled=true, queueEnabled=false`, supported `unavailableReason`, runtime/lifecycle non-OK, and contradictory booleans as `unavailable`.
- Add component/browser fixtures as well as authority-unit cases.

### W2 — Minimal healthy-looking noncanonical stub can become authoritative enabled

Severity: release-blocking canonical-authority defect
Owner: Luna

The API client casts arbitrary JSON instead of parsing the shared runtime schemas. Authority assessment does not require canonical API service identity or complete contract shape.

Independent minimal fixture omitted canonical service/contract fields but supplied matching revisions and hand-shaped Speed status. Actual result:

```json
{
  "status": "enabled",
  "availability": "authoritative",
  "apiOrigin": "https://unintended-stub.example"
}
```

This directly violates Ticket 223's requirement that canonical play cannot silently use a healthy-looking stub.

Required fix:

- Runtime-parse health, readiness, ranked-mode, and envelope payloads with shared schemas.
- Require canonical API service identity and exact authority-critical fields.
- Fail closed on malformed booleans/statuses, duplicate Speed rows, missing service identity, malformed revision, or partial dependency shape.

### W3 — Cross-origin redirects bypass the one-origin authority proof

Severity: release-blocking API-origin proof defect
Owner: Luna

Fetch follows redirects by default. `ApiClientResult.apiUrl` is populated from the configured origin rather than `response.url`. Authority therefore compares three copied configuration strings, not the origins that actually served the responses.

Independent mock used configured origin:

```text
https://configured.example
```

All final response URLs were:

```text
https://redirected-stub.example
```

Actual authority still returned:

```json
{
  "status": "enabled",
  "availability": "authoritative",
  "apiOrigin": "https://configured.example"
}
```

Required fix:

- Reject redirects for authority reads, or bind and verify every final response origin against the configured canonical origin.
- Store actual validated response origin, not a copied configured value.
- Add same-origin redirect policy and cross-origin redirect tests.

## Commands run + exit codes

### Backend/PostgreSQL

- Temporary real-PostgreSQL post-deadline different-ID timing matrix: exit 1 as expected blocker reproduction — 7 canonical PASS, omitted adversary FAIL with `409 ready_deadline_passed`; schema dropped and test restored.
- Frozen hosted-latency gate: exit 0 — 1/1; `D*=300ms`, callback entries 5, lock wait observed, elapsed `4928/7768ms`, HTTP `[201,201]`, ready 2, mutations 2, ratings 0.
- PostgreSQL Speed gameplay: exit 0 — 5/5.
- PostgreSQL hostile lifecycle race, one disposable iteration: exit 0 — 8/8.
- Focused mutation/operational/reconciler suites: exit 0 — 23/23.
- Late-receipt projection diagnostic: exit 0 as a diagnostic; false acknowledgement-recorded contract reproduced.
- Full API: exit 0 — 234/234; environment-gated PostgreSQL suites skipped by design.

### Web/contracts/build

- Temporary configured-unavailable authority assertion: exit 1 as expected blocker reproduction; actual `disabled` versus expected `unavailable`.
- Minimal-stub authority assertion: exit 1 as expected blocker reproduction; actual `enabled` versus expected `unavailable`.
- Cross-origin redirect assertion: exit 1 as expected blocker reproduction; final origin ignored and actual `enabled`.
- Web unit suite: exit 0 — 51/51.
- Web typecheck: exit 0.
- Production web build with one local origin and fixed revision: exit 0.
- Browser `/play` smoke: loaded production build; console 0 messages/0 errors.
- Contracts tests/typecheck: exit 0 — 24/24 plus TypeScript PASS.
- Full nine-project workspace build: exit 0.
- Secret scan: exit 0 — 297 source/config files; standard exclusions apply.
- `git diff --check`: exit 0.

## Browser/visual evidence

Production Next was exercised at `http://127.0.0.1:3223/play` against a deterministic local API at `http://127.0.0.1:3222` with matching 40-character revisions.

Fixture state:

- health `ok`;
- core readiness `ok`;
- Speed runtime `ok`;
- Speed lifecycle activation `unavailable`;
- catalog `enabled=true`, `queueEnabled=false`, `unavailableReason=speed_temporarily_unavailable`.

Observed:

- false disabled Speed copy reproduced visually;
- Standard displayed live independently;
- safe origin and 12-character revision displayed;
- no credential, answer hash, salt, cookie, connection string, SQL, or provider payload displayed;
- no JavaScript errors or console messages;
- no obvious desktop horizontal overflow.

The available interactive browser viewport was 1280px and could not be changed by page script, so mobile responsive acceptance is not claimed.

## Regression/security/scope review

- Budget constants were not widened.
- Canonical simultaneous ready now closes the original one-success/one-rollback happy-path defect at frozen hosted latency.
- Canonical cancellation, expiry, replay, reconciler, and exactly-once settlement suites remained green in executed coverage.
- Unknown ready dependency/transaction failures map to sanitized 503 instead of generic 500 in focused tests.
- No raw database code, SQL, provider response, credentials, answer authority, hashes, or salts appeared in independent diagnostics or browser output.
- The secret scan excludes generated/build outputs, docs, and agent-communication; no broader claim is made.
- No hosted access, provider/config mutation, lifecycle operation, dictionary change, commit, push, PR, merge, or deployment occurred.

## Additional required evidence before a future PASS

- Expand actual ready-flow forced-error coverage to direct/meta/nested forms for each required class, including rollback/persistence assertions. Pure classifier coverage alone does not prove transaction effects.
- Add a projection barrier/monitor proving projection starts only after the contested write lock is released.
- Make post-commit projection fail closed on zero or multiple rounds rather than selecting `findFirst` from malformed Speed state.
- Align sanitized observability vocabulary with the fixed architecture contract, including distinguishable retry and domain-conflict outcomes.
- Add committed UI/browser tests for enabled, explicit disabled, configured-but-unavailable, malformed contract, redirect, revision mismatch, partial-read recovery, direct Speed leaderboard URL, Standard isolation, and mobile/zoom overflow.

## Required fixes / owner

- Freya: close B1 and B2; extend database/error/projection evidence.
- Luna: close W1, W2, and W3; add durable authority/component/browser coverage.
- Jasmine: rerun focused omitted-case adversaries, frozen PostgreSQL gate, canonical suites, and production-browser matrix after remediation.
- Yuna: keep Ticket 224 blocked until Ticket 223 receives PASS.

## Residual risks

- Provider revision environment availability was not checked because hosted access is unauthorized.
- The exact Ticket 181 web misroute remains unproven from preserved evidence; this QA evaluates whether the source now prevents the class of false authority, and it currently does not.
- Only one hostile lifecycle-race iteration was rerun in this failed QA cycle; no ten-iteration claim is made.

## Cleanup

- Temporary PostgreSQL test changes were restored.
- All disposable schemas were dropped.
- Local API/Next fixture processes and temporary files were removed.
- PostgreSQL/Redis containers, volumes, and network were removed.
- Ports 3222/3223 and QA process patterns were checked closed.
