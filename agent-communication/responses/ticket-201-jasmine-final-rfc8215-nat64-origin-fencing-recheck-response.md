# Ticket 201 — Final RFC 8215 NAT64 Origin-Fencing Recheck — Response

Task: Ticket 201 — Final RFC 8215 NAT64 Origin-Fencing Recheck
Agent: Jasmine (QA)
Verdict: **PASS**

Ticket 200's remaining trusted-origin blocker is closed. Ticket 197 may proceed only under its own separate checkpoint, PR, and CI authorization. This PASS does not authorize a merge, deployment, Railway query or mutation, hosted-database access or mutation, lifecycle transition, gameplay smoke, or release.

## Acceptance criteria checked

- Verified the complete RFC 8215 local-use NAT64 prefix `64:ff9b:1::/48` is classified non-public.
- Verified direct loopback-, RFC1918-, and link-local-embedding cases fail.
- Verified provider-allowed hostnames resolving to those answers fail with sanitized `railway_scope_mismatch` before pinned transport, with transport call count exactly zero.
- Rechecked mixed-answer rejection, DNS pinning, one absolute deadline, redirect rejection, exact active-fleet proof, cancellation-ignoring timeout serialization, regional replica/lease binding, proof digests, dry-run behavior, and absence of a public operator endpoint.
- Ran the permanent focused suites, independent omitted-case adversaries, full API/contracts, builds, typechecks, Prisma/workspace validation, security scan, and diff checks.

## Evidence / result

### Source inspection

`apps/api/src/gameplay/public-origin-readiness.ts:85-89` computes the first 48 IPv6 bits and rejects exact value `0x64ff9b0001`. This covers all remaining 80-bit suffixes in `64:ff9b:1::/48`, not only the three reported examples.

`apps/api/src/gameplay/speed-lifecycle-operator.service.ts:149-164`:

1. resolves under the shared absolute deadline;
2. requires a nonempty answer set;
3. rejects when **any** answer is non-public;
4. only then invokes pinned `transport.getJson()` using a validated address.

The permanent tests at `apps/api/test/public-origin-readiness.test.ts:24-50` include direct classification and pre-transport verifier checks for:

- `64:ff9b:1::7f00:1` — embedded loopback;
- `64:ff9b:1::a00:1` — embedded RFC1918;
- `64:ff9b:1::a9fe:a9fe` — embedded link-local.

All return `railway_scope_mismatch` in verifier checks and leave the aggregate transport count at zero.

### Independent adversarial verification

A temporary QA suite additionally proved:

- lower boundary `64:ff9b:1::` rejected;
- upper boundary `64:ff9b:1:ffff:ffff:ffff:ffff:ffff` rejected;
- interior addresses with nonzero subnet/suffix bits rejected;
- expanded, uppercase, dotted-IPv4-tail, bracketed, and zone-suffixed forms rejected;
- adjacent global-unicast prefixes were not accidentally overblocked;
- dangerous single-answer and mixed public/NAT64 DNS sets failed before transport in either answer order;
- thrown errors were sanitized (`message === code === railway_scope_mismatch`);
- transport call count remained zero.

Result: **4/4 passed**.

### Preserved trusted-provider protections

The focused operator suite passed **30/30**, including:

- public-origin classification and verifier fencing;
- well-known NAT64/mapped/special-use handling;
- mixed-answer rejection and validated-address pinning;
- absolute DNS/transport deadlines and redirect rejection through non-2xx handling;
- exact Railway scope, deployment, artifact, active replica cardinality, identity, and regional allocation;
- cancellation-ignoring timeout serialization with maximum provider-command concurrency of one;
- exact capability replica/region identity and operator proof checks;
- approval/confirmation-bound dry-run and mutation behavior.

A static controller search found no reference to `SpeedLifecycleOperatorService`, `close-v2`, `open-v2`, or the operator CLI in any API controller.

## Commands run + exit codes

```text
pnpm exec node --import tsx --test /tmp/ticket201-jasmine-adversarial.test.ts
  exit 0 — 4/4

pnpm exec node --import tsx --test test/public-origin-readiness.test.ts
  exit 0 — 7/7

pnpm test:speed-lifecycle-operator
  exit 0 — 30/30

pnpm test  # apps/api
  exit 0 — 193/193

pnpm test  # packages/contracts
  exit 0 — 24/24

pnpm typecheck  # apps/api
  exit 0

pnpm typecheck  # apps/web
  exit 0

pnpm build  # workspace root
  exit 0 — all applicable workspace builds passed

pnpm validate:workspace
  exit 0 — 9 workspace packages

pnpm db:validate && pnpm db:generate  # apps/api
  exit 0

pnpm secret-scan
  exit 0 — 281 source/config files scanned

git diff --check
  exit 0
```

PostgreSQL operator integration was not rerun. Ticket 201 explicitly requires it only when source inspection finds a database/proof-schema change. The surgical remediation changed the address classifier and permanent address tests after Ticket 200; the existing database/proof-schema work predates this remediation and was not changed for Ticket 201.

## Browser / visual evidence

Not applicable. This patch changes backend/operator address classification and tests only; it adds no rendered UI or browser route.

## Findings

No release-blocking defect reproduced. The Ticket 200 RFC 8215 local-use NAT64 bypass is closed.

Non-blocking test-strengthening recommendation: permanently retain explicit lower-boundary, upper-boundary, nonzero-interior, and mixed public/local-use `/48` cases from the independent suite. The current permanent tests satisfy the ticket's three required embedded-destination cases, while the independent suite provides direct evidence for the entire prefix.

## Required fixes / owner

None for Ticket 201.

## Residual risks

- This was local trusted-boundary QA; no hosted Railway or hosted database was contacted.
- Ticket 197 still requires its own authorized checkpoint/PR/CI workflow before any merge or deployment.
- Ticket 198 hosted activation remains separately gated and is not authorized by this PASS.
- The provider/operator files remain untracked in a shared intentional dirty worktree, so the final checkpoint must ensure the exact reviewed artifacts are committed without unrelated changes.

## Cleanup

- Removed `/tmp/ticket201-jasmine-adversarial.test.ts`.
- Confirmed no Ticket 201/operator QA process remains; the only `pgrep` match was the cleanup command itself.
- Started no server, browser, container, schema, advisory lock, or hosted operation.
- Preserved the shared worktree and pre-existing intentional changes.
