# Ticket 205 — Railway Live Status Schema Compatibility for Exact Fleet Proof

Task: Railway Live Status Schema Compatibility for Exact Fleet Proof
Agent: Freya (frontend, provider-bound operator remediation)
Status: Complete — independent architecture/security review PASS

## Outcome

The exact-fleet Railway adapter now accepts the permanent sanitized Railway CLI `5.27.1` live status shape without weakening the provider-proof boundary:

- `serviceInstance.numReplicas: null` is accepted only when a complete positive `multiRegionConfig` provides exact cardinality.
- A present numeric `numReplicas` remains mandatory evidence and must agree with regional cardinality.
- Only exact `RUNNING` instance rows are serving replicas.
- Exact `REMOVED` instance rows are terminal and excluded from serving cardinality.
- Any unknown, transitional, failed, malformed, case-mismatched, or contradictory instance state fails closed.
- Regional sum, exact RUNNING identity count, and operator expectation must all agree.
- Linked and explicitly scoped observations must agree over all active-deployment instance identities and statuses, including terminal REMOVED rows.
- `deploymentStopped` must be exactly `false`.
- Provider domain rows and deployment evidence must be complete, canonical, and nonblank.
- Only a closed allowlist of sanitized Railway inventory error codes can cross the operator boundary; hostile duck-typed codes collapse to `railway_inventory_unavailable`.

No fallback, inferred default replica count, status relabeling, provider write, or hidden uncertainty was introduced.

## Permanent live-shape fixture

Added:

- `apps/api/test/fixtures/railway-status-5.27.1-live-sanitized.json`

The fixture permanently locks the observed live structural facts:

- target deployment status `SUCCESS`;
- `deploymentStopped: false`;
- nullable service-instance count;
- one `RUNNING` instance;
- one stale `REMOVED` instance;
- exact scoped service/environment/deployment identity;
- exact public health host.

No credential, account identity, hosted URL, or secret is present.

## Proof and fail-closed behavior

The adapter now derives serving cardinality only after validating:

1. exactly one successful, unstopped target active deployment;
2. canonical unique identities for every RUNNING and REMOVED instance row;
3. only RUNNING/REMOVED instance statuses;
4. at least one RUNNING replica;
5. complete nonempty regional allocation with positive safe-integer counts;
6. regional sum equals the RUNNING identity count;
7. present `numReplicas`, when non-null, equals the same sum;
8. derived count equals operator expectation;
9. linked/scoped canonical status observations agree;
10. exact artifact, scope, deployment inventory, and health-host evidence remain valid.

The existing replica-ID, regional-allocation, inventory, and operator-principal SHA-256 digests remain deterministic and were independently recomputed successfully.

## Hostile coverage

Coverage now includes:

- permanent nullable-count live fixture success;
- present numeric-count compatibility;
- missing, empty, zero, negative, fractional, unsafe, and contradictory regional counts;
- all-REMOVED, extra RUNNING, duplicate, blank, and noncanonical instance identities;
- SUCCESS, transitional, failed, crashed, unknown, and case-mismatched instance states;
- active deployment overlap;
- missing/null/truthy/nonboolean `deploymentStopped`;
- linked/scoped REMOVED identity or status disagreement;
- malformed, blank, uppercase, duplicate, or path-bearing health-host evidence;
- blank deployment ID/status/time evidence;
- expected-count disagreement;
- malicious provider error-code injection;
- Ticket 199 cancellation-ignoring serialization, public-origin, DNS pinning, and absolute-deadline regressions.

## Files changed

Ticket 205 implementation files:

- `apps/api/src/gameplay/railway-inventory.adapter.ts`
- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts`
- `apps/api/test/railway-inventory-adapter.test.ts`
- `apps/api/test/speed-lifecycle-operator.test.ts`
- `apps/api/test/fixtures/railway-status-5.27.1-live-sanitized.json`
- `agent-communication/responses/ticket-205-freya-railway-live-status-schema-exact-fleet-proof-response.md`
- `agent-communication/index.md`

Pre-existing Wave V communication changes were preserved.

## Verification

Commands run and results:

- `pnpm test:speed-lifecycle-operator` — **36/36 passed**.
- `pnpm typecheck` — passed.
- `SPEED_OPERATOR_ITERATIONS=10 pnpm test:postgres:speed-lifecycle-operator` — **50/50 passed**, ten schemas dropped.
- Independent architecture/security review — **PASS** after adversarial probes and digest recomputation.
- `pnpm test` in API — **199/199 passed**.
- `pnpm test` in contracts — **24/24 passed**.
- `pnpm db:validate && pnpm db:generate && pnpm typecheck` — passed.
- Lifecycle activation, ten isolated iterations — **60/60 passed**.
- Hostile lifecycle races, ten isolated iterations — **70/70 passed**.
- Schema readiness — **8/8 passed**.
- Speed timing — **7/7 passed**.
- Speed gameplay — **5/5 passed**.
- `pnpm validate:workspace` — nine workspace packages passed.
- `pnpm build` — passed.
- `pnpm smoke:api:prod-start` — passed; `/readyz status=ok`.
- `pnpm secret-scan` — passed across **282 files**.
- `git diff --check` — passed.
- Final attributable schema check — zero Ticket 158/177/184/185/187/195/199/205 schemas.
- Final advisory-lock check — zero.

The first PostgreSQL attempt correctly failed before schema creation because local dependencies were down. Local PostgreSQL/Redis were started and health-checked, then the complete gate passed. The first production smoke prerequisite encountered manually started containers without Compose ownership labels; only those attributable containers were removed, and canonical Compose startup plus the full smoke then passed.

## Browser/visual/accessibility checks

Not applicable. No rendered UI, route, interaction, or styling changed.

## Safety and authority state

- No authenticated Railway query was performed for Ticket 205.
- No hosted database was contacted.
- No provider mutation or deployment occurred.
- No lifecycle transition or activation occurred.
- No commit, push, merge, or PR occurred.
- Existing hosted `v1_open` authority is not claimed changed.
- No raw provider output, credential, account identity, or secret was added.

## Risks and follow-up

- Ticket 206 is ready for Jasmine's independent live-schema fleet-proof QA.
- Ticket 207 remains blocked on Ticket 206 PASS.
- Hosted lifecycle mutation remains separately approval-gated.
- Any future Railway CLI version or live schema change requires a new pinned compatibility review; unsupported versions remain fail-closed.
