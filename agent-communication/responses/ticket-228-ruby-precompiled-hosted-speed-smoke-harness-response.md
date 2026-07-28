# Ticket 228 — Ruby Precompiled Hosted Speed Smoke Harness Response

Status: **PASS (local deterministic verification only)**

## Scope and safety

Implemented only in detached worktree `/tmp/wordle-ticket181-rerun-1d8ef` at exact deployed commit `1d8ef83353c4bcc09bb8e7803ca231eb7f554f08`. No hosted endpoint, Railway, Vercel, GitHub, public API, hosted database, `.env.preview.local`, or hosted credential was accessed. No commit, push, branch, PR, deployment, or provider mutation was performed.

The executable refuses stateful execution unless passed `--confirm-one-hosted-lifecycle`; its base URL, expected revision, and optional authorization are read only from the caller environment. Cookies are retained in memory per controlled actor and are never emitted.

## Implementation

- Added an injectable harness core using the exact committed routes and v2 Speed contracts.
- Completes health, readiness/revision, Speed runtime/activation, catalog, lifecycle/rules/rating identity, and Standard availability preflight before session or queue creation.
- Creates exactly two preview demo sessions, sends exactly one Speed queue request for each, performs only bounded current-ticket read recovery, and requires one shared `matchedMatchId`.
- Asserts invitation budget before ready dispatch.
- Dispatches the two ready requests concurrently, records monotonic dispatch skew plus sanitized status/duration, and never blindly retries a mutation.
- Uses five globally unique operation IDs (two queue, two ready, one controlled settlement).
- Recovers a timeout only through current state and exact `viewerReadyOperationId` correlation.
- Fails closed after any non-2xx ready result or identity mismatch while retaining both concurrent statuses.
- Verifies immutable first-ack/ready-deadline and countdown/round-deadline identities, reconnect, product forfeit settlement, result/history/profile/leaderboard reads, Standard isolation, spoiler-safe evidence, and terminal cleanup.
- Emits one fixed-cardinality JSON evidence object without cookies, credentials, operation/match/user IDs, answer material, hashes, salts, or guesses.

## Permanent deterministic tests

`pnpm test:smoke:speed:hosted`:

- `[201,201]` concurrent ready: PASS
- timeout then exact operation-ID current-state recovery, no blind POST retry: PASS
- `500/201` captures both outcomes and safely stops before settlement/convergence: PASS
- invitation deadline budget failure sends zero ready requests: PASS
- sanitization against secret/spoiler-shaped mock payloads: PASS
- split match identity rejects lifecycle and sends zero ready requests: PASS

Result: **6 tests, 6 pass, 0 fail**.

## Verification evidence

- `pnpm test:smoke:speed:hosted && node --check scripts/hosted-speed-smoke-core.mjs && node --check scripts/hosted-speed-smoke.mjs && git diff --check` — PASS.
- `pnpm lint` — PASS; workspace scaffold validation passed for 9 packages.
- `pnpm typecheck` — PASS; workspace scaffold validation passed for 9 packages.
- `pnpm secret-scan` — PASS; 301 source/config files scanned.
- Guard execution without confirmation — exit 2, zero stdout bytes, refusal before any transport call.
- Final worktree has only the four intended repository changes below; no lockfile change.

## Changed files

1. `package.json`
2. `scripts/hosted-speed-smoke-core.mjs`
3. `scripts/hosted-speed-smoke.mjs`
4. `scripts/hosted-speed-smoke.test.mjs`

Response artifact (outside detached worktree, as explicitly required):

5. `agent-communication/responses/ticket-228-ruby-precompiled-hosted-speed-smoke-harness-response.md`

## Decision

**PASS** — reusable precompiled harness and permanent local deterministic coverage are complete. Hosted execution was intentionally not performed and requires separate explicit authorization.
