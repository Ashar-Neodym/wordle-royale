# Ticket 199 — Exact Railway Fleet Proof, Safe Command Serialization, and Public-Origin Fencing

Agent: Freya (frontend, provider-bound operator remediation)
Status: Complete — independent architecture/security review PASS

## Outcome

Closed all four Ticket 196 trusted-provider boundary blockers without contacting Railway or changing hosted state.

1. **Exact active fleet proof**
   - Railway status parsing now requires exactly one successful target deployment and a complete active instance inventory.
   - Active replica IDs must be present, canonical, nonblank, distinct, successful, untruncated, and exactly equal to both Railway's authoritative count and the operator's expected count.
   - Linked and explicitly scoped status observations must agree exactly.
   - Sorted replica identities and canonical regional allocation are committed into provider inventory proof/digests.

2. **Safe command serialization**
   - The adapter owns an adapter-wide command gate.
   - A timed-out command receives abort, but the gate is not released until the underlying executor actually settles.
   - Timed-out queued observers retain their place behind the unsettled predecessor; a later observer cannot jump the chain.
   - Three-observation cancellation-ignoring adversarial coverage proves one executor call and maximum concurrency one.
   - CLI child process, timeout, abort signal, and output cap remain owned by the executor; provider output stays sanitized.

3. **Public-origin fencing**
   - Readiness accepts only a provider-observed HTTPS hostname with no credentials, custom port, path, query, or fragment.
   - Dangerous hostnames and literal/WHATWG-normalized dangerous addresses fail before DNS/transport.
   - IPv4, IPv6, mapped, translated, loopback, unspecified, private, link/site-local, metadata-adjacent, documentation, transition, discard-only, benchmark, multicast, and other covered special-use destinations fail closed.
   - Every DNS answer must be public; mixed answers fail.
   - HTTPS connects to a validated pinned address while retaining the original hostname for TLS SNI/certificate validation; redirects are not followed.
   - DNS and transport share the absolute monotonic operator deadline. The real transport destroys its owned request on expiry and caps response bytes.

4. **Exact regional lease binding**
   - Railway multi-region allocation is normalized and must sum exactly to the provider replica count.
   - Fresh leases are selected and validated inside the guarded serializable transaction.
   - Lease provider replica IDs must equal the exact provider-observed set; region counts must equal the provider allocation.
   - Missing, extra, duplicate, noncanonical, wrong-generation, wrong-provider, wrong-replica, and wrong-region leases fail before authority mutation.
   - Inventory and lease-set digests bind these facts to the immutable atomic audit row.
   - Runtime heartbeat/freshness now requires and compares `providerRegion` as part of complete Railway identity.

## Files changed for Ticket 199

- `apps/api/package.json`
- `apps/api/src/gameplay/public-origin-readiness.ts`
- `apps/api/src/gameplay/railway-inventory.adapter.ts`
- `apps/api/src/gameplay/speed-lifecycle-capability.service.ts`
- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts`
- `apps/api/src/gameplay/speed-lifecycle-proof.ts`
- `apps/api/test/public-origin-readiness.test.ts`
- `apps/api/test/railway-inventory-adapter.test.ts`
- `apps/api/test/speed-lifecycle-capability-railway.test.ts`
- `apps/api/test/speed-lifecycle-operator.test.ts`
- `apps/api/test/speed-lifecycle-operator-postgres.integration.test.ts`
- `agent-communication/index.md`
- this response

The worktree also contains the intentionally preserved uncommitted Ticket 195/earlier Wave V files.

## Verification evidence

All commands exited 0 unless the interrupted combined-gate note says otherwise.

- Focused Ticket 199/operator tests: **29/29 passed**.
- Fresh PostgreSQL Ticket 199 hostile matrix: **50/50 passed across ten disposable schemas**.
- Independent architecture/security review: **PASS**.
  - Independently reproduced bounded never-settling DNS.
  - Independently reproduced special-use/public IPv6 decisions.
  - Independently reproduced three cancellation-ignoring observations with one executor call and maximum concurrency one.
- Full API tests: **192/192 passed**.
- Contracts: **24/24 passed**.
- Mixed-version activation: **60/60 passed across ten schemas**.
- Hostile lifecycle races: **70/70 passed across ten schemas**.
- Exact schema readiness: **8/8 passed**.
- Speed timing: **7/7 passed**.
- Speed gameplay: **5/5 passed**.
- Prisma validate/generate: passed.
- API typecheck: passed.
- Workspace validation: passed for **9 packages**.
- Production workspace build: passed.
- Production API startup smoke: `/readyz` returned `status=ok`.
- Secret scan: passed across **281 source/config files**.
- `git diff --check`: passed.
- Final PostgreSQL residue: zero attributable `ticket158|177|184|185|187|195|199` schemas and zero advisory locks.

### Interrupted combined-gate note

The initial combined activation/race/schema/timing/gameplay shell reached the tool's 600-second ceiling after activation 60/60 and races 70/70. It interrupted schema-readiness, leaving two attributable Ticket 184 schemas. Those exact schemas were dropped through the local PostgreSQL container, then schema-readiness was rerun cleanly at 8/8, followed by timing 7/7 and gameplay 5/5. Final residue is zero.

## Preserved guarantees

- Canonical PostgreSQL/database time remains authoritative for freshness and transitions.
- Provider proof validation, authority locking, exact lease validation, CAS transition, and audit append remain transaction-bound.
- Dry-run performs no transition or audit write.
- Close/open remain separate, confirmation-bound operations with drain/generation fencing.
- Standard readiness and persisted Speed reads/reconciliation remain isolated from Speed creation closure.
- No public activation endpoint was added.
- No hosted credentials, Railway query, provider mutation, deployment, lifecycle activation, commit, push, or merge occurred.
- Browser/visual/accessibility checks are not applicable because no rendered UI changed.

## Handoff

Ticket 200 is ready for Jasmine's independent focused trusted-provider boundary recheck. Ticket 197 remains blocked until Ticket 200 returns PASS. Ticket 198 remains blocked on an approved Ticket 197 merge and separate explicit hosted activation authorization.
