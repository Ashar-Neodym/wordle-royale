# Ticket 200 — Focused Trusted-Provider Boundary Recheck — Response

Task: Ticket 200 — Focused Trusted-Provider Boundary Recheck
Agent: Jasmine (QA)
Verdict: **FAIL**

Ticket 197 remains blocked. This QA did not authorize or perform a merge, deployment, Railway query/mutation, hosted-database access/mutation, lifecycle transition, or gameplay smoke.

## Acceptance criteria checked

Independently rechecked all four Ticket 196 blocker groups:

1. exact active Railway replica count and identities;
2. cancellation-ignoring timeout serialization and late settlement;
3. public-origin fencing for dangerous host/address forms;
4. exact replica-ID and regional lease allocation/digest binding.

Also reran the official focused operator suite, ten fresh disposable PostgreSQL runs, full API/contracts, build/typechecks, Prisma/workspace/security/diff gates, missing-auth/sanitization/no-public-endpoint checks, Standard isolation, and cleanup.

## Verdict basis

Three Ticket 196 blocker groups are closed. Public-origin fencing remains incomplete: the RFC 8215 local-use NAT64 prefix `64:ff9b:1::/48` is classified as public and can reach the pinned readiness transport.

Broad green suites do not neutralize this omitted trusted-origin bypass.

## Remaining release blocker

### RFC 8215 local-use NAT64 `/48` reaches readiness transport

**Owner: Freya**

`isPublicAddress()` handles the well-known NAT64 prefix `64:ff9b::/96`, but not the separate local-use prefix `64:ff9b:1::/48`.

Independent classification returned:

```text
64:ff9b:1::7f00:1     true
64:ff9b:1::a00:1      true
64:ff9b:1::a9fe:a9fe  true
```

These examples embed loopback, RFC1918, and link-local IPv4 values respectively. An independent verifier adversary using a provider-allowed public hostname whose mocked DNS answer was `64:ff9b:1::7f00:1` did not reject; it reached the mocked pinned transport and returned healthy readiness. The assertion requiring `railway_scope_mismatch` failed.

Relevant code:

- `apps/api/src/gameplay/public-origin-readiness.ts:66-90`
- translation-prefix handling at lines 75-77;
- transport authorization at `apps/api/src/gameplay/speed-lifecycle-operator.service.ts:149-166`.

Required fix:

- reject the entire RFC 8215 local-use `64:ff9b:1::/48` prefix before transport;
- add direct `isPublicAddress()` cases for the prefix;
- add verifier tests whose DNS answers embed loopback, RFC1918, and link-local IPv4 destinations and assert resolver output never reaches `transport.getJson()`;
- retain the current mixed-answer, address pinning, absolute-deadline, and redirect protections.

## Closed Ticket 196 blockers

### 1. Exact active fleet proof — closed

Independent zero/under/over/duplicate/blank/noncanonical active-instance cases all failed closed. The adapter now requires:

- exact equality with provider `numReplicas`;
- all instances successful;
- nonblank, trimmed, distinct replica IDs;
- agreement between linked and explicitly scoped status observations;
- replica IDs committed to the inventory/proof digest.

### 2. Command serialization and late settlement — closed

Independent cancellation-ignoring test proved:

- first observation timed out;
- a second observation did not start while the first executor remained unsettled;
- late success from the timed-out command did not revive or authorize the first observation;
- the next command began only after actual settlement;
- maximum command concurrency remained exactly **1**.

### 3. Exact regional lease binding — closed

Independent validation accepted the canonical two-region/two-replica set and rejected:

- both leases in one region;
- missing region;
- wrong replica identity;
- duplicate replica identity;
- extra lease.

The provider proof now carries canonical replica IDs, regional allocation, and their digests. Fresh transactional lease reads include `providerRegion`; the immutable audit's inventory and lease-set digests bind replica and regional facts.

## Verification results

### Independent adversaries

- Focused independent suite: **3/4 passed**.
  - Active replica identity/cardinality matrix: passed.
  - Cancellation-ignoring late-settlement serialization: passed.
  - Dangerous-origin matrix: failed on RFC 8215 local-use NAT64 `/48`.
  - Exact replica/region/digest lease binding: passed.
- Direct local-use NAT64 classification probe: **3/3 unsafe addresses incorrectly returned `true`**.

### Official focused and PostgreSQL verification

- Official focused operator suite: **29/29 passed**.
- Fresh PostgreSQL operator suite: **50/50 passed across ten disposable schemas**.
  - dry-run zero writes;
  - exact hostile lease/provider/generation checks;
  - schema tamper and canonical recovery;
  - atomic audit rollback and append-only enforcement;
  - creator-lock serialization;
  - close/open separation, queue drain, and generation acknowledgement;
  - rollback symmetry;
  - Standard availability.

### Canonical regressions and release gates

- Full API: **192/192 passed**.
- Contracts: **24/24 passed**.
- API typecheck: passed.
- Web typecheck: passed.
- Workspace production build: passed.
- Workspace validation: **9 packages passed**.
- Prisma validate: passed.
- Prisma generate: passed.
- Secret scan: passed across **281 source/config files**; docs and `agent-communication` remain scanner-excluded.
- `git diff --check`: passed.

### Missing auth, sanitization, and public surface

- Official provider fixtures fail closed for missing Railway authentication.
- Provider/configuration sentinel tests return sanitized failure codes without raw payload leakage.
- Static controller search found no activation/operator controller or public route.
- The local operator remains in its isolated allowlisted Nest application context rather than `AppModule`.
- No browser/visual check was applicable because no rendered UI changed.

## Commands run + exit codes

```text
pnpm exec node --import tsx --test /tmp/ticket200-jasmine-adversarial.test.ts
  exit 1 — 3/4 passed; public-origin assertion reproduced remaining blocker

pnpm exec tsx -e "...isPublicAddress local-use NAT64 probes..."
  exit 0 — all three unsafe addresses printed true

pnpm test:speed-lifecycle-operator
  exit 0 — 29/29

SPEED_OPERATOR_ITERATIONS=10 pnpm test:postgres:speed-lifecycle-operator
  exit 0 — 50/50 across ten disposable schemas

pnpm test  # apps/api
  exit 0 — 192/192

pnpm test  # packages/contracts
  exit 0 — 24/24

pnpm typecheck  # apps/api
  exit 0

pnpm --filter @wordle-royale/web typecheck
  exit 0

pnpm build
  exit 0

pnpm validate:workspace
  exit 0

pnpm db:validate && pnpm db:generate
  exit 0

pnpm secret-scan
  exit 0

git diff --check
  exit 0
```

## Browser / visual evidence

Not applicable. Ticket 199 changes local backend/operator tooling only and adds no UI or browser route.

## Cleanup

- Removed the temporary Ticket 200 adversarial test.
- Confirmed zero `ticket195_%`, `ticket199_%`, or `ticket200_%` PostgreSQL schemas remain.
- Confirmed zero PostgreSQL advisory locks remain for the local project database.
- Confirmed no QA operator process remains.
- No QA server or port was started.
- No hosted provider/database was contacted or mutated.
- Preserved the pre-existing local dependencies and intentional shared uncommitted worktree.

## Required fixes / owner

- **Freya:** reject `64:ff9b:1::/48` and add pre-transport local-use NAT64 adversaries.
- **Jasmine:** run a narrow final origin-fencing recheck after remediation.

## Residual risks

Ticket 197 checkpoint merge/deploy and Ticket 198 hosted activation must remain blocked until the local-use NAT64 gap is fixed and independently verified. A future PASS would only unblock the separately authorized Ticket 197 checkpoint; it would not authorize deployment or activation by itself.
