Task: Ticket 217 — Operator Public-Readiness Compatibility Recheck
Agent: Jasmine (QA)
Verdict: FAIL

## Verdict rationale

The three intended compatibility corrections are substantially present: the real public `{data:{dependencies}}` envelope works, legacy direct dependencies still work, lookup handles scalar and `all=true` callbacks, IPv4 is selected deterministically before IPv6, transport remains pinned, and the readiness fetch is capped at 12 seconds inside the absolute deadline.

However, the envelope discriminator uses truthiness rather than key presence and strict object-shape validation. A valid nested public envelope is accepted when a malformed direct `dependencies` key is also present with a falsey value. The converse is also accepted. These are ambiguous/malformed dual shapes and violate Ticket 217's explicit fail-closed requirement.

Ticket 218 remains blocked.

## Acceptance criteria checked

- Real API `{data:{dependencies}}` readiness envelope: PASS.
- Legacy `{dependencies}` readiness envelope: PASS.
- Dual valid envelopes: PASS — rejected with `reconciler_readiness_failed`.
- Dual nested-valid + direct-malformed/falsey envelopes: FAIL — accepted.
- Dual direct-valid + nested-malformed/falsey envelopes: FAIL — accepted.
- Missing dependency envelope: PASS — rejected.
- Scalar pinned lookup callback: PASS.
- `options.all=true` pinned lookup callback: PASS.
- Invalid pinned address: PASS — rejected.
- Mixed public/private DNS: PASS — rejected before transport.
- RFC 8215 local-use NAT64 and other private/special-use addresses: PASS — rejected before transport.
- Validated public IPv4 selected before IPv6: PASS.
- Transport receives exactly the selected validated DNS answer: PASS.
- No ordinary DNS fallback from the pinned transport: PASS through injected lookup binding.
- 12-second readiness-fetch cap inside the absolute deadline: PASS.
- DNS and transport absolute timeout behavior: PASS.
- Provider proof, fleet/lease/origin binding, serialization, and no-raw-leak regressions: PASS.

## Blocking finding

### B1 — Falsey malformed duplicate envelope branches bypass ambiguity rejection

Severity: release-blocking fail-closed parser defect
Owner: Athena

Current logic:

```ts
const nestedDependencies = body.data?.dependencies;
const directDependencies = body.dependencies;
if (nestedDependencies && directDependencies) reject();
const dependencies = nestedDependencies ?? directDependencies;
```

This detects only two truthy branches. It does not distinguish absent properties from present-but-malformed properties.

Independent results:

```text
new                                  ACCEPTED
legacy                               ACCEPTED
dual-valid                           reconciler_readiness_failed
nested-valid + direct null           ACCEPTED
nested-valid + direct 0              ACCEPTED
nested null + direct-valid           ACCEPTED
data null + direct-valid              ACCEPTED
```

The last four inputs are malformed or ambiguous dual-shape payloads and should all fail with `reconciler_readiness_failed`.

Impact:

- A response can carry conflicting public and legacy envelope branches yet be treated as authoritative when one branch is falsey/malformed.
- The parser no longer fails closed on the exact boundary Ticket 217 was created to harden.
- Although the accepted branch must still contain all required `status='ok'` values, ambiguity is silently discarded rather than rejected.

Required fix:

1. Require the response body to be a non-array object.
2. Detect branch presence with own-property checks, not value truthiness.
3. Accept exactly one envelope form:
   - direct own `dependencies` with no own `data` envelope branch; or
   - own `data` object containing own `dependencies`, with no direct own `dependencies`.
4. Require the selected `dependencies` value to be a non-null, non-array object before reading statuses.
5. Reject every duplicate, null, scalar, array, or structurally incomplete alternate branch with `reconciler_readiness_failed`.
6. Add permanent tests for nested-valid plus direct `null`, `undefined`, `0`, `false`, string, and array, plus direct-valid with null/scalar nested branches.

## Commands run + exit codes

- Independent seven-shape envelope adversary: exit 0 as a diagnostic; four malformed/ambiguous shapes were unexpectedly accepted — blocker reproduced.
- `pnpm test:speed-lifecycle-operator`: exit 0 — 40/40.
- API typecheck: exit 0.
- Full API suite: exit 0 — 228/228; PostgreSQL-only suites skipped by design.
- Contracts tests and typecheck: exit 0 — 24/24 plus TypeScript PASS.
- Nine-project workspace build: exit 0.
- Compiled operator context smoke: exit 0, `runtimeWorkersPresent=false`.
- Secret scan: exit 0 — 289 source/config files.
- `git diff --check`: exit 0.

PostgreSQL integration was not rerun because Ticket 217 changes only public readiness parsing, address ordering, pinned lookup shape, and transport timeout selection; the ticket does not request database integration.

## Browser/visual evidence

Not applicable. This is an operator-only server-side parsing/DNS/HTTPS compatibility recheck with no UI changes.

## Regression/security/scope review

- Mixed public/private DNS answers still reject before any transport call.
- Literal, normalized encoded, mapped, translated, private, special-use, and RFC 8215 local-use NAT64 destinations remain blocked.
- The selected address is independently validated and explicitly passed to the pinned transport.
- IPv4 preference is deterministic; no fallback to a second or ordinary resolver address was introduced.
- DNS and HTTPS work remain bounded by the same absolute operator deadline; readiness fetch receives at most 12,000 ms.
- Provider scope, deployment, artifact, replicas, regions, health origins, capability leases, audit digests, and command serialization remained green.
- Tests continue to sanitize provider/readiness errors without raw response leakage.
- No public controller or runtime worker was added to the operator context.
- No production source was modified during QA; the shared dirty worktree was preserved.

## Required fixes / owner

- Athena: replace truthy envelope discrimination with strict own-property and object-shape validation; add the omitted malformed dual-shape matrix.
- Jasmine: rerun the malformed matrix and canonical 40-test operator suite after correction.
- Yuna: keep Ticket 218 blocked until Ticket 217 receives PASS.

## Residual risks

- The canonical test labeled “ambiguous or malformed” currently covers dual-valid and missing dependencies, but not malformed duplicate branches. Its title overstates its tested input matrix.
- No hosted Railway query, hosted database access, transition, deployment, push, PR, merge, or release was performed or authorized.

## Cleanup

- No database container or disposable schema was created.
- No QA server, temporary test file, operator process, or API process remains.
