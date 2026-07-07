# Athena review after Tickets 97–100 — Wave N preview deployment setup

Date: 2026-07-07
Owner: Athena
Scope: Verify Tickets 97, 98, 99, and 100 before Ticket 101 checkpoint.

## Summary

Tickets 97–100 are accepted.

Wave N has a controlled-preview scope and implementation hardening baseline:

- public preview scope is web + hosted API only;
- mobile remains Expo Go/manual verification only, not a public mobile preview claim;
- deployment/provider work remains plan-only until Ashar explicitly approves provisioning/deployment;
- hosted API config validation/CORS/cookie/readiness behavior is hardened;
- Redis can be optional for first hosted preview via `REDIS_REQUIRED=false`;
- web copy now clearly states demo sessions are non-durable and preview data may reset.

## Verification run by Athena

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/web build
pnpm --filter @wordle-royale/mobile build
pnpm smoke:api:prod-start
pnpm secret-scan
git diff --check
pnpm deps:down
```

Result: PASS.

Key observed outputs:

- API tests: `44/44` passed.
- API build: passed.
- Web build: passed.
- Mobile build: passed.
- API prod-start smoke: `/readyz` returned `status=ok`.
- Secret scan: passed, `190` files scanned.
- Diff check: passed.
- Docker deps stopped.

## Ticket acceptance

### Ticket 97 — Elisa

Accepted.

Output:

- `docs/2026-07-06-controlled-preview-deployment-scope-decision-lock.md`

Decision: first controlled public preview is web + hosted API, demo-only, not production, not public mobile.

### Ticket 98 — Yuna

Accepted.

Output:

- `docs/2026-07-06-preview-infrastructure-env-runbook.md`

Runbook is plan-only and includes env map, secret classification, build/start/migrate/smoke commands, rollback/reset policy, and approval gates.

### Ticket 99 — Freya

Accepted.

Main source changes:

- `apps/api/src/config/runtime-config.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/health/readiness.service.ts`
- `apps/api/src/health/redis-readiness.service.ts`
- `apps/api/test/api-skeleton.test.ts`
- `.env.example`
- `.env.local.example`

Result: hosted preview API config validation, split-host CORS, secure preview cookies, and optional Redis readiness are implemented/tested.

### Ticket 100 — Luna

Accepted with caveat.

Main source/doc changes:

- `apps/web/src/components/PageFrame.tsx`
- `apps/web/src/components/web-shell.module.css`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/profile/page.tsx`
- `apps/web/src/app/settings/page.tsx`
- `docs/2026-07-06-preview-release-copy-and-mobile-smoke.md`

Result: public-preview caveats are visible in the web UI. Physical Expo Go visual smoke remains deferred/blocked and must not be claimed as complete.

## Ticket 101 handoff note

Yuna can proceed with the checkpoint. Required emphasis:

- no deployment;
- no provider resources;
- no real `.env` files;
- no secrets;
- verify generated artifacts are not staged;
- include Ticket 97–100 docs/responses and this Athena review in the branch/PR;
- run full gates from Ticket 101 and monitor CI if PR is created.

## Remaining risks

- Hosted provider behavior is still not validated because deployment/provisioning remains intentionally unapproved.
- Preview demo sessions remain in-memory and non-durable.
- Mobile physical Expo Go visual smoke remains deferred.
- Provider cost/free-tier assumptions must be rechecked at provisioning time.
