# Athena review after Tickets 89–90 — Wave M account decision and API deploy-shape

Date: 2026-07-03
Owner: Athena
Scope: Verify Ticket 89 and Ticket 90 outputs before routing Ticket 91.

## Summary

Tickets 89 and 90 are accepted for the next step.

- Ticket 89 locked the Preview MVP account/session direction: use an explicit preview demo-session path as the preferred MVP, keep read-only preview as fallback, and defer real email/password/OAuth accounts.
- Ticket 90 added a deploy-shaped API production build/start path and a repeatable local production-start smoke.
- Freya's generated source artifacts under `packages/contracts/src` and `packages/game-engine/src` were cleaned up before Athena review; git status no longer shows those artifacts.

## Ticket 89 decision

Recommended Preview MVP path:

```text
explicit preview demo session
```

Ticket 92 may implement only a minimal explicit preview demo-session slice. It must not implement full email/password auth, OAuth, provider secrets, magic-link email, account recovery, or silent fixture fallback.

Decision doc:

```text
docs/2026-07-03-preview-mvp-account-session-decision-lock.md
```

## Ticket 90 implementation

New/changed deploy-shape files:

```text
apps/api/package.json
apps/api/tsconfig.build.json
apps/api/scripts/link-built-workspace-packages.mjs
scripts/api-prod-start-smoke.mjs
package.json
agent-communication/responses/ticket-90-freya-api-production-build-start-smoke-response.md
```

New commands:

```bash
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api start
pnpm --filter @wordle-royale/api smoke:prod-start
pnpm smoke:api:prod-start
```

## Athena verification run

Commands run by Athena:

```bash
pnpm --filter @wordle-royale/api test
pnpm --filter @wordle-royale/api build
pnpm --filter @wordle-royale/api smoke:prod-start
pnpm build
pnpm secret-scan
git diff --check
pnpm deps:down
```

Observed result:

- API tests passed: 40/40.
- API build emitted runnable dist output.
- API prod-start smoke passed against local Docker Compose Postgres/Redis and `/readyz` returned `status=ok`.
- Full workspace build passed.
- Secret scan passed: 188 source/config files scanned.
- `git diff --check` passed.
- Local Docker dependencies were stopped afterward with `pnpm deps:down`.

## Risks / follow-ups

- Ticket 90's current build is deploy-shaped but monorepo-specific: it emits API plus required workspace package source dependencies into API `dist` and links package shims. This is acceptable for Wave M but should be revisited later with package exports/project references or a bundler.
- Ticket 90 response still notes an earlier cleanup caveat, but Athena verified the generated package-source artifacts were removed before routing Ticket 91.
- Ticket 91 should wire the new API prod-start smoke into CI without adding deployment, provider login actions, secrets, or external services.

## Next route

Proceed to Ticket 91: Yuna — Preview Deploy-Shape CI Gate.
