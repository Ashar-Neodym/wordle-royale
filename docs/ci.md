# Wordle Royale CI Quality Gates

GitHub Actions CI is intentionally free, secret-free, and local-resource-free. It does not deploy, mutate environments, or require paid services.

## Required PR / main checks

`.github/workflows/pr-checks.yml` runs on pull requests and pushes to `main`:

1. `corepack enable`
2. `pnpm install --frozen-lockfile`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build`
7. `pnpm smoke:local`
8. `pnpm secret-scan`

The workflow uses GitHub-hosted `ubuntu-latest`, Node.js 20, `pnpm/action-setup@v4`, and the lockfile-backed pnpm cache. No repository secrets are required. `NEXT_TELEMETRY_DISABLED=1` is set in CI so Next.js does not emit anonymous telemetry during automated checks.

## Local verification

Run the same quality gates locally before opening a PR:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
```

`pnpm smoke:local` validates local configuration files and workspace wiring. It does not start app services.

## Secret scan

`pnpm secret-scan` runs `scripts/secret-scan.mjs`, a lightweight source/config scanner for common token/key patterns and suspicious secret assignments.

Intentional exclusions:

- `node_modules/`
- `dist/`
- `build/`
- `.next/`
- `.expo/`
- `coverage/`
- `.turbo/`
- `.cache/`
- `tmp/`
- `docs/`
- `agent-communication/`

The scan is not a replacement for a full security audit. It is a cheap CI guardrail to catch accidentally committed obvious secrets while avoiding noisy generated artifacts and documentation examples.

## Docker Compose policy

Docker Compose is optional for current CI. CI does not start PostgreSQL or Redis yet.

`pnpm smoke:local` attempts `docker compose version`; if Docker Compose v2 is unavailable, it reports an informational skip and still validates the local non-Docker config. Integration-test jobs can add GitHub Actions service containers later when API/database tests require them.

## Build artifacts and generated files

Generated/build outputs remain ignored via `.gitignore`, including `node_modules/`, `dist/`, `build/`, `.next/`, `.expo/`, `coverage/`, `.turbo/`, and generated word-tool data. Keep source files and deterministic fixtures tracked; keep generated dependency/build output untracked.

## CI safety rules

- No production secrets required.
- No cloud deploys from PR checks.
- No staging/production database or Redis access from PR checks.
- No paid scanners or paid CI services.
- Future deployment workflows require explicit Ashar approval before implementation.

## Future CI expansion

When app implementations need deeper checks, add separate jobs for:

1. API/NestJS unit and integration tests.
2. Disposable PostgreSQL/Redis service-container tests.
3. Prisma migration apply checks against disposable PostgreSQL.
4. Next.js production build once the web app replaces placeholders.
5. Expo/mobile config/typecheck once mobile implementation starts.
6. API/worker Docker image build if containerization becomes a release target.
7. Dependency audit with free/open-source tooling.
