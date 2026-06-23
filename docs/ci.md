# Wordle Royale CI Skeleton

Initial GitHub Actions CI is intentionally secret-free and local-resource-free.

## Current PR checks

`.github/workflows/pr-checks.yml` runs:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm smoke:local`

At the current scaffold stage, lint/typecheck/test use `scripts/validate-workspace.mjs`. Future implementation tickets should replace or extend package-level scripts with real framework checks.

`pnpm build` is intentionally not a required PR check in this skeleton yet. During Ticket 22 verification it failed in package code outside Yuna's ops scope (`packages/contracts` TypeScript test/import issues). Add build as a required CI gate after owning implementation agents make workspace package builds consistently green.

## CI safety rules

- No production secrets required.
- No cloud deploys from PR checks.
- No staging/production database or Redis access from PR checks.
- Future integration-test jobs should use GitHub Actions service containers for PostgreSQL 16 and Redis 7.
- Production deploy workflows require explicit Ashar approval before implementation.

## Future CI expansion

When app implementations exist, add jobs for:

1. API/NestJS unit tests.
2. Game engine duplicate-letter feedback tests.
3. API integration tests with PostgreSQL 16 and Redis 7 service containers.
4. Prisma migration apply check against disposable PostgreSQL.
5. Next.js production build.
6. Expo/mobile config/typecheck.
7. API/worker Docker image build.
8. Secret scanning.
9. Dependency audit.
10. Workspace `pnpm build` after package builds are stabilized.
