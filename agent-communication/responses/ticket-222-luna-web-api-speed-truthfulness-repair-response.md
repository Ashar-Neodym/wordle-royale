# Ticket 222 — Web/API Speed Truthfulness Repair — Response

Task: Ticket 222 — Web/API Speed Truthfulness Repair
Agent: Luna (web/API implementation)
Status: **Implementation complete; ready for Ticket 223 independent backend/web QA**
Date: 2026-07-27

## Result

The web no longer treats a healthy-looking `/healthz` response or a raw ranked-mode catalog row as sufficient proof that Speed is live.

Speed availability is now one fail-closed tri-state contract:

- **enabled** — health, readiness, ranked-mode reads, one credential-free API origin, matching web/API revisions, catalog enablement, queue enablement, Speed runtime readiness, and lifecycle activation all agree;
- **disabled** — the same authoritative origin/revision/readiness proof succeeds and the catalog explicitly keeps Speed or its queue disabled;
- **unavailable** — any required read, origin, revision, readiness, runtime, lifecycle, or catalog evidence is missing or contradictory.

The Ticket 181 evidence did not preserve the web process's configured API origin or API deployment revision, so this response does **not** claim an unobserved exact hosted misroute. It repairs the source conditions that allowed an alternate/stale/degraded authority to look healthy and renders the evidence needed to classify a future occurrence.

## Files changed

### API and contracts

- `apps/api/src/shared/deployment-revision.ts`
  - publishes only allowlisted commit-SHA provider/source metadata;
  - malformed or absent production revision evidence becomes `unavailable`;
  - arbitrary environment text is never echoed.
- `apps/api/src/health/health.controller.ts`
  - includes the public API deployment revision in `/healthz`.
- `apps/api/src/health/readiness.service.ts`
  - includes the same revision in `/readyz`.
- `apps/api/test/deployment-revision.test.ts`
- `apps/api/test/api-skeleton.test.ts`
- `packages/contracts/src/common/schemas.ts`
- `packages/contracts/src/common/contracts.test.ts`

### Web

- `apps/web/src/lib/api-authority.ts`
  - validates one credential-free root HTTP(S) API origin;
  - rejects conflicting `API_BASE_URL` and `NEXT_PUBLIC_API_URL` values;
  - compares web, health, and readiness deployment revisions;
  - computes the authoritative `enabled | disabled | unavailable` result.
- `apps/web/src/lib/api-authority.test.ts`
  - covers origin conflicts, production missing-origin behavior, partial reads, mixed origins, missing/mismatched revisions, lifecycle disagreement, authoritative enablement, and authoritative disablement.
- `apps/web/src/lib/api-client.ts`
  - prefers server-only runtime `API_BASE_URL`;
  - retains `NEXT_PUBLIC_API_URL` as a compatible input;
  - removes the production localhost fallback;
  - returns deterministic `api_origin_unavailable` without issuing a fetch when production origin proof is absent or contradictory;
  - attaches the authority assessment to every aggregate web snapshot.
- `apps/web/src/components/StatusPanels.tsx`
  - renders safe origin, shortened revisions, and authority failure reason instead of calling health-only state online.
- `apps/web/src/app/server/page.tsx`
  - renders origin, authority availability, web revision, and API revision without credentials.
- `apps/web/src/components/SpeedQueuePanel.tsx`
  - distinguishes authority unavailable from authoritative disabled;
  - exposes an accessible real reload action for unavailable evidence.
- `apps/web/src/components/speed-live-state.ts`
- `apps/web/src/app/play/page.tsx`
- `apps/web/src/app/leaderboard/page.tsx`
  - route all Speed live/disabled/unavailable presentation through the same authority result.
- `apps/web/.env.local.example`
  - documents the single-origin runtime contract.

## TDD evidence

Initial regression run:

```text
pnpm exec tsx --test apps/web/src/lib/api-authority.test.ts
EXIT 1 — expected missing api-authority module

pnpm exec tsx --test apps/api/test/deployment-revision.test.ts
EXIT 1 — expected missing deployment-revision module
```

The first implementation run also caught malformed revision text falling back to development. The helper was corrected to fail closed before the suite was accepted.

Final focused authority tests:

```text
pnpm exec tsx --test apps/web/src/lib/api-authority.test.ts
PASS — 5/5

pnpm exec tsx --test apps/api/test/deployment-revision.test.ts
PASS — 1/1

pnpm --filter @wordle-royale/api exec tsx --test test/api-skeleton.test.ts
PASS — 12/12
```

## Canonical verification

```text
pnpm --filter @wordle-royale/web exec tsx --test src/**/*.test.ts
PASS — 51/51

pnpm --filter @wordle-royale/contracts test
PASS — 24/24

pnpm --filter @wordle-royale/api test
PASS — 229/229; 8 environment-gated PostgreSQL suites skipped

pnpm --filter @wordle-royale/contracts typecheck
PASS

pnpm --filter @wordle-royale/api typecheck
PASS

pnpm --filter @wordle-royale/web typecheck
PASS

API_BASE_URL=http://127.0.0.1:3222 \
NEXT_PUBLIC_API_URL=http://127.0.0.1:3222 \
VERCEL_GIT_COMMIT_SHA=2222222222222222222222222222222222222222 \
pnpm --filter @wordle-royale/web build
PASS — production build, all routes

pnpm build
PASS — all 9 buildable workspace projects

pnpm validate:workspace
PASS — 9 workspace packages

pnpm secret-scan
PASS — 293 source/config files

git diff --check
PASS
```

## Production-build browser fixture

A local production Next build was exercised against a deterministic local API fixture with one safe origin and matching revision.

### Authoritative enabled

Observed on `/play`:

- Standard: `Live queue`;
- Speed: `Live queue`;
- status: `Authoritative API online · ok`;
- origin: `http://127.0.0.1:3222`;
- revision: `222222222222`;
- readiness included `speedRuntime: ok` and `speedLifecycleActivation: ok`.

### Contradictory/degraded

The fixture kept health, catalog enablement, and revision healthy-looking but changed lifecycle activation to `not_checked_stub`.

Observed:

- Speed queue panel: `Live Speed availability could not be verified`;
- Speed card: `Live status unavailable`;
- real `Retry Speed availability` control present;
- false `Speed queue is not enabled` copy absent;
- Standard remained `Live queue`;
- horizontal overflow: false;
- browser console: 0 messages, 0 JavaScript errors.

The retry performed real fresh reads:

```text
health 5 -> 6
readiness 4 -> 5
ranked modes 4 -> 5
```

### Authoritative disabled and diagnostics

With coherent origin/revision/readiness and catalog `enabled=false`, `queueEnabled=false`:

- Speed rendered `Speed queue is not enabled`;
- unavailable copy was absent;
- `/server` rendered authority, safe origin, web revision, and API revision;
- rendered diagnostics contained no answer hash/salt, database URL, or cookie material.

The production fixture and web processes were stopped, temporary files were removed, and ports `3222`/`3223` were confirmed closed.

## Preserved behavior and safety

- Standard queue behavior remains independent and live when its existing reads succeed.
- No queue or gameplay mutation gained automatic retry or replay.
- Speed remains fail-closed during partial reads, mixed deployments, rolling revision skew, invalid origin configuration, and readiness/catalog disagreement.
- No answer, answer hash, salt, SQL, provider response, credential, cookie, or connection string is exposed.
- Existing Speed clocks, operation IDs, generation fencing, settlement recovery, and retry-deadline behavior were not changed.

## Deployment implications for Ticket 224

No hosted config was read or mutated here.

For deployment:

1. Set `API_BASE_URL` on the web process to the credential-free canonical API root origin.
2. If `NEXT_PUBLIC_API_URL` remains set, it must normalize to the same origin; disagreement intentionally disables authority.
3. Vercel should provide `VERCEL_GIT_COMMIT_SHA` and Railway should provide `RAILWAY_GIT_COMMIT_SHA` automatically. If a provider does not, use one exact non-secret `SOURCE_COMMIT_SHA` value on both processes.
4. Deploy web and API from the same commit. Rolling skew intentionally presents Speed as unavailable until both revisions converge.
5. Do not use a URL containing credentials, a path, query, or fragment.

## Risks and follow-ups

- Ticket 223 must independently test enabled, disabled, missing-origin, origin-conflict, revision-mismatch, lifecycle-degraded, partial-read, retry, Standard-isolation, and spoiler/secret cases.
- Ticket 223 should also verify actual provider revision variable availability before Ticket 224 authorizes deployment.
- Ticket 221's concurrent-ready backend repair remains a separate release blocker.
- No hosted access, deployment, lifecycle operation, database operation, config mutation, commit, PR, push, or merge was performed.
