# Ticket 196 — Trusted Activation Operator Independent QA — Response

Task: Ticket 196 — Trusted Activation Operator Independent QA
Agent: Jasmine (QA)
Verdict: **FAIL**

Ticket 197 remains blocked. This QA did not authorize or perform a merge, deployment, Railway mutation, hosted-database mutation, lifecycle transition, or gameplay smoke.

## Acceptance criteria checked

- Mocked Railway inventory parsing, exact scope, deployment status, immutable Git identity, truncation, ambiguity, replica count, and sanitization.
- Default read-only/dry-run behavior and explicit apply boundary.
- Fresh provider proof, exact lease cardinality, duplicate/extra/wrong-provider/wrong-generation rejection, drain, generation acknowledgement, close/open separation, audit atomicity, creator serialization, disable/rollback structure, and Standard isolation.
- Ten fresh disposable PostgreSQL runs.
- Missing Railway CLI/auth/database configuration failure behavior.
- Minimal operator-only Nest context and absence of a public activation controller/route.
- Full API/contracts/build/typecheck/Prisma/workspace/security/diff gates.
- Cleanup and preservation of the shared uncommitted worktree.

## Verdict basis

The official focused and PostgreSQL suites pass, but four independently reproduced omitted adversaries violate the trusted-provider boundary. Broad green suites do not neutralize these specific release blockers.

## Release blockers

### 1. Contradictory provider active-instance inventory is accepted

**Owner: Freya**

`RailwayInventoryAdapter.parseStatus()` checks only whether listed active instances have `status=SUCCESS`. It does not require the active-instance list to match `numReplicas`, nor require non-empty, distinct replica identities.

Independent mocked provider results accepted all five unsafe inventories as PASS while `numReplicas=2`:

- zero active instances;
- one active instance;
- three active instances;
- two entries with the same instance ID;
- one blank instance ID.

This permits stale database leases to satisfy cardinality after provider evidence already contradicts the claimed serving fleet. It violates the fail-closed rule for incomplete or contradictory Railway evidence and exact immutable replica proof.

Relevant code:

- `apps/api/src/gameplay/railway-inventory.adapter.ts:169-185`
- especially the vacuous status-only check at lines 173-174 and return of `row.numReplicas` at line 185.

Required fix: validate that active target instances are complete, successful, non-empty, uniquely identified, and exactly equal to the authoritative replica count; add empty/under/over/duplicate/blank hostile fixtures.

### 2. Railway commands can overlap after an observation timeout

**Owner: Freya**

The adapter releases its `pending` serialization gate when the outer deadline wins, even if the executor promise/subprocess has not settled. An executor that ignored cancellation remained active after the first observation timed out; a second observation started another Railway command concurrently.

Independent result:

```text
max concurrent Railway commands = 2
expected                         = 1
```

This violates the runbook's sequential Railway CLI/OAuth-refresh boundary.

Relevant code:

- `apps/api/src/gameplay/railway-inventory.adapter.ts:43-59`
- `apps/api/src/gameplay/railway-inventory.adapter.ts:123-143`

Required fix: do not release the adapter-wide serialization gate until the underlying child is confirmed terminated/settled. Timeout handling must kill and await the child or continue holding the gate until settlement. Add a cancellation-ignoring executor adversary.

### 3. Provider-allowed private/local readiness hosts are fetched

**Owner: Freya**

The readiness verifier rejects HTTP, credentials, ports, paths, queries, fragments, and hosts absent from Railway evidence, but it does not reject local/private/link-local destinations. If provider evidence contains the same hostname, the verifier fetches it.

Independent mocked readiness accepted and fetched all six:

- `localhost`;
- `127.0.0.1`;
- `0.0.0.0`;
- `169.254.169.254`;
- `10.0.0.1`;
- `192.168.1.1`.

This contradicts Ticket 195's claimed localhost rejection and leaves an operator-side SSRF path to local, private, or metadata services.

Relevant code:

- `apps/api/src/gameplay/speed-lifecycle-operator.service.ts:121-142`
- `apps/api/scripts/speed-lifecycle-operator-args.ts:66-71`

Required fix: fail closed before `fetch` for localhost, unspecified, loopback, link-local, RFC1918/private, metadata, and equivalent IPv4/IPv6 representations; use exact provider-owned public HTTPS origins and add fetch-not-called tests.

### 4. Multi-region provider distribution is not bound to leases

**Owner: Freya**

The provider adapter sums `multiRegionConfig` into one total and discards the regional distribution. The proof carries no regional inventory, and `freshLeases()`/`validateLeases()` omit `providerRegion` even though capability heartbeats persist it.

An independent service adversary supplied a provider distribution of one replica in `us-east4` and one in `eu-west4`, with two distinct leases both claiming `us-east4`. Validation accepted the set; the expected provider-mismatch exception was absent.

Relevant code:

- regional total reduced at `apps/api/src/gameplay/railway-inventory.adapter.ts:204-224`;
- proof shape in `apps/api/src/gameplay/speed-lifecycle-proof.ts`;
- lease shape/query/validation in `apps/api/src/gameplay/speed-lifecycle-operator.service.ts:53-68,376-415`.

Required fix: preserve canonical regional allocation in provider proof and inventory digest; select and validate `providerRegion` in the transaction; require exact per-region cardinality when Railway supplies multi-region configuration.

## Passing verification

### Independent and focused tests

- Independent omitted-case adversaries: **0/4 passed** — all four blockers reproduced.
  - Active-instance identity/cardinality matrix accepted 5/5 unsafe cases.
  - Timed-out command serialization reached concurrency 2.
  - Private/local readiness-host matrix accepted/fetched 6/6 unsafe hosts.
  - Multi-region lease mismatch was accepted.
- Official focused operator suite: **21/21 passed**.
- Fresh disposable PostgreSQL operator suite: **50/50 passed across ten clean schemas**.
  - dry-run zero writes;
  - hostile lease cardinality/provider/generation cases;
  - exact schema and readiness tamper/recovery;
  - audit rollback and immutability;
  - creator-lock serialization;
  - close/open separation and queue drain;
  - generation acknowledgement;
  - rollback symmetry;
  - Standard availability.

### Canonical regressions and release gates

- Full API: **184/184 passed**.
- Contracts: **24/24 passed**.
- API typecheck: passed.
- Web typecheck: passed.
- Workspace production build: passed across all buildable packages.
- Workspace validation: 9 packages passed.
- Prisma validate: passed.
- Prisma generate: passed.
- Secret scan: passed, 279 source/config files; scanner excludes docs and `agent-communication`.
- `git diff --check`: passed.

### Missing credentials and sanitization

- Missing Railway auth is covered by the official focused suite and fails closed.
- No `railway` executable was present locally.
- Invoking the real operator entry point without a usable database configuration failed closed with sanitized JSON containing only `railway_inventory_unavailable`; no credential, URL, SQL, provider payload, or stack trace appeared.
- Mocked secret-bearing provider configuration failed with a stable sanitized code without echoing the sentinel.

### Public surface and isolation

- Static controller search found no activation/operator controller route.
- `SpeedLifecycleOperatorModule` is an allowlisted application context and does not import the normal `AppModule`.
- Its startup assertion checks absence of capability heartbeat, expiry reconciler, gameplay, and matchmaking runtime providers.
- No browser/visual check was applicable because Ticket 195 adds local backend/operator tooling only and no UI route.

## Commands run + exit codes

```text
pnpm exec node --import tsx --test /tmp/ticket196-jasmine-adversarial.test.ts
  exit 1 — expected QA assertions exposed 3 independent blockers

pnpm exec node --import tsx --test /tmp/ticket196-region-adversarial.test.ts
  exit 1 — expected QA assertion exposed regional-binding blocker

pnpm test:speed-lifecycle-operator
  exit 0 — 21/21

SPEED_OPERATOR_ITERATIONS=10 pnpm test:postgres:speed-lifecycle-operator
  exit 0 — 50/50 across ten disposable schemas

pnpm test  # apps/api
  exit 0 — 184/184

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

Not applicable: no rendered UI or browser route changed. No browser server was started.

## Cleanup

- Removed both temporary Jasmine adversarial test files.
- Confirmed zero `ticket195_%` or `ticket196_%` PostgreSQL schemas remain.
- Confirmed zero PostgreSQL advisory locks remain for the local project database.
- No QA API/web/operator process or port remains.
- No hosted provider or database was contacted or mutated.
- Pre-existing local PostgreSQL/Redis and the intentional shared uncommitted implementation were preserved.

## Residual risks

The passing PostgreSQL transition evidence is valuable but does not establish trusted hosted activation while provider inventory can be internally contradictory, CLI commands can overlap after timeout, private readiness destinations are allowed, and regional placement is ignored. Ticket 197 checkpoint merge/deploy and Ticket 198 activation must remain blocked until these defects are fixed and independently rechecked.
