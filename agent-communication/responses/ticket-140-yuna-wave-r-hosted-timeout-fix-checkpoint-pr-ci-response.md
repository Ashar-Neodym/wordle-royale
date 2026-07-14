# Ticket 140 — Hosted Timeout-Fix Checkpoint PR and CI Response

Task: Hosted Timeout-Fix Checkpoint PR and CI
Agent: Yuna (checkpoint/devops)
Status: In progress — Ticket 147 PASS and local gates confirmed; branch/PR/remote checks pending

## What I understood

Checkpoint the verified complete-matchmaking-lifecycle and hosted transaction-timeout repair on `wave-r/hosted-matchmaking-transaction-budget`. Include only intended implementation/tests/review documents/tickets/responses, run canonical gates plus both disposable PostgreSQL harnesses, push the branch, open a PR to `main`, monitor GitHub/Vercel checks, and stop before merge or any hosted mutation.

## QA prerequisite

Ticket 139 was superseded by the later Ticket 141–147 repair sequence.

Ticket 147 final verdict: **PASS**.

Independent QA confirmed:

- ten consecutive canonical real-PostgreSQL matchmaking harness passes;
- exact shared four-attempt retry ledger and one monotonic 90-second backend lifecycle;
- deterministic bounded jitter and exact exhaustion for `P2034`, PostgreSQL `40001`, and `40P01`;
- `P2028` remains non-retryable and sanitized;
- partial writes roll back on real PostgreSQL timeout;
- deadline ordering `90s backend < 95s API < 100s server action < 110s browser`;
- real join/reconnect/current/cancel client operations use the correct deadline keys;
- no duplicate automatic join after a sanitized recoverable lifecycle error.

Ticket 147 explicitly authorized Ticket 140 to proceed to checkpoint/PR/CI only. It did not authorize merge, provider changes, deployment, or hosted mutation.

## Intended scope

Core implementation includes:

- shared backend matchmaking lifecycle coordinator;
- explicit bounded transaction-budget configuration;
- safe retry/error classification and scoped uniqueness recovery;
- real-postgres delayed concurrent pairing and rollback coverage;
- complete-lifecycle web deadline policy and operation wiring;
- timeout/recovery UI behavior;
- environment examples and operational documentation.

Evidence includes updated Ticket 128 hosted failure evidence, Tickets/responses 138–147, Athena timeout review, Elisa lifecycle contract, README guidance, and communication index updates.

## Local verification

Canonical gates passed:

```text
CI=true pnpm install --frozen-lockfile -> 0
CI=true pnpm lint -> 0
CI=true pnpm typecheck -> 0
CI=true pnpm test -> 0
CI=true pnpm --filter @wordle-royale/api test -> 0
CI=true pnpm --filter @wordle-royale/contracts test -> 0
CI=true pnpm --filter @wordle-royale/rating-tools test -> 0
CI=true pnpm --filter @wordle-royale/api db:validate -> 0
CI=true pnpm build -> 0
CI=true pnpm smoke:api:prod-start -> 0
CI=true pnpm smoke:local -> 0
CI=true pnpm deps:check -> 0
CI=true pnpm secret-scan -> 0
git diff --check -> 0
```

Test totals:

```text
API: 119 passed, 0 failed
contracts: 19 passed, 0 failed
rating-tools: 14 passed, 0 failed
secret scan: 220 source/config files scanned
```

Production-start smoke returned `/readyz status=ok`; the production build and dynamic `/play` route compiled successfully.

## Disposable PostgreSQL gates

The existing Compose data volume did not accept the current checked-in local test credential. Two early harness attempts therefore failed before schema creation: first because PostgreSQL was not ready, then because the retained local volume rejected authentication. No temporary schema or product mutation was created by either failed attempt.

To avoid deleting or mutating the existing local volume, I used a new isolated PostgreSQL 16 container with:

- a generated in-process credential that was not printed or stored;
- a temporary in-memory data directory;
- a dedicated loopback port;
- unconditional cleanup after verification.

### Matchmaking harness

```text
3 migrations applied
local fixture seed applied to unique schema
3 passed, 0 failed
- real active-ticket P2002 metadata recognized
- concurrent cold profiles created one shared non-self match
- two six-second-delayed cold joins paired without duplicate/self/orphan match
unique ticket130 schema dropped
```

### Preview dictionary harness

```text
3 migrations applied
4 passed, 0 failed
- safe no-dictionary behavior before bootstrap
- exact idempotent dictionary-only bootstrap
- ineligible-release pairing rollback
- real over-budget partial-write rollback with sanitized timeout
unique ticket135 schema dropped
```

The isolated container was removed. Compose containers/network started by the production smoke were also removed. The pre-existing Compose volume was deliberately retained and not reset.

## Artifact and secret hygiene

Excluded and unstaged:

- `.env.preview.local`
- generated `dist/`, `.next/`, `.expo/`, `node_modules/`, build-info, coverage, and cache paths
- database dumps and logs

No hosted URL credentials, database URL, cookie, token, dictionary answer, or generated test credential is recorded in this response.

## Git / PR / CI evidence

Pending branch creation, safety inspection, push, PR creation, and terminal check monitoring.

## Safety boundary

Not authorized or performed:

- merge or push to `main`;
- Railway or production Vercel deployment;
- hosted Supabase writes or dictionary bootstrap rerun;
- `db:seed:local` against hosted preview;
- provider environment/secret changes;
- paid resource changes.

## Follow-up tickets

Pending final PR/check status. Expected follow-up:

- Ashar/Athena: review the PR and explicitly approve or reject merge.
- Yuna: only after approved merge/current-main CI, monitor Railway deployment and resume Ticket 128 hosted two-session smoke without rerunning unrelated seed/provider operations.
- Jasmine: independently verify hosted queue, shared match, reconnect, gameplay, and rating convergence after the corrected deployment.
