# CI Quality Gates and GitHub Actions Hardening — Response

## Summary

Ticket 30 is completed by Athena on behalf of Yuna after Yuna's provider safety filter blocked completion.

The repository now has hardened free/local CI quality gates using GitHub Actions, pnpm frozen installs, workspace validation, test/build/smoke checks, and a lightweight source-focused secret scan. No paid CI, paid scanner, deployment workflow, production secret, or cloud resource was added.

## Decisions / Recommendations

- Use GitHub Actions only for CI; no paid CI service.
- Keep CI secret-free for this phase.
- Keep Docker Compose optional in CI for now; PostgreSQL/Redis service-container tests can be added later when API integration tests need them.
- Use a lightweight local `pnpm secret-scan` script as a cheap guardrail, not as a replacement for a security audit.
- Exclude generated/noisy locations from secret scanning: `node_modules`, `dist`, `build`, `.next`, `.expo`, `coverage`, `.turbo`, `.cache`, `tmp`, `docs`, and `agent-communication`.
- Disable Next.js telemetry in CI with `NEXT_TELEMETRY_DISABLED=1`.

## Detailed Output

Implemented/confirmed:

1. `.github/workflows/pr-checks.yml`
   - Runs on pull requests and pushes to `main`.
   - Uses `ubuntu-latest`, Node.js 20, `pnpm/action-setup@v4`, and pnpm cache.
   - Runs:
     - `pnpm install --frozen-lockfile`
     - `pnpm lint`
     - `pnpm typecheck`
     - `pnpm test`
     - `pnpm build`
     - `pnpm smoke:local`
     - `pnpm secret-scan`
   - Requires no repository secrets.
   - Sets `NEXT_TELEMETRY_DISABLED=1`.

2. `scripts/secret-scan.mjs`
   - Scans tracked/unignored source/config files for common secret patterns.
   - Detects common token/key/private-key patterns and suspicious secret assignments.
   - Masks samples in output.
   - Excludes generated/build/documentation/agent-communication folders to reduce noise.

3. Root `package.json`
   - Adds `secret-scan` script.
   - Existing `lint`, `typecheck`, `test`, `build`, and `smoke:local` scripts remain available.

4. `docs/ci.md`
   - Documents CI order, local verification commands, secret scan behavior, Docker Compose policy, artifact policy, safety rules, and future expansion.

5. Package entrypoints
   - `packages/design-tokens/package.json` and `packages/fixtures/package.json` expose built ESM `dist/index.js` + `dist/index.d.ts` entrypoints so app builds can resolve shared packages correctly.

## Open Questions

None for Ticket 30.

Future CI questions, not blockers:

- Whether to add disposable PostgreSQL/Redis service containers once API integration tests exist.
- Whether to add free dependency audit checks later.
- Whether to enforce branch protection in GitHub settings later; this ticket intentionally did not modify remote settings.

## Follow-up Tickets

- Add API integration-test CI job using free GitHub Actions service containers after the NestJS API starts using PostgreSQL/Redis.
- Add Prisma migration apply/check job after migrations become authoritative.
- Add dependency audit/license review using free/open-source tooling after dependencies stabilize.

## Files Changed

- `.github/workflows/pr-checks.yml`
- `docs/ci.md`
- `package.json`
- `scripts/secret-scan.mjs`
- `packages/design-tokens/package.json`
- `packages/fixtures/package.json`

## Tests / Commands Run

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:local
pnpm secret-scan
```

After adding `NEXT_TELEMETRY_DISABLED=1` to CI, also re-ran:

```bash
pnpm build
pnpm smoke:local
pnpm secret-scan
```

## Evidence / Result

All local verification commands passed.

Key results:

```text
Workspace scaffold validation passed (9 workspace packages).
```

```text
pnpm build ... Done
```

```text
Local smoke passed. This smoke test validates local config only; it does not start app services.
```

```text
Secret scan passed (122 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Docker Compose note:

```text
INFO docker compose config validation skipped — Docker Compose v2 is not available in this environment; install Docker Compose to validate/start local services.
```

This is expected in the current environment and is documented in `docs/ci.md`.

## Risks / Blockers

- Docker Compose startup is still not verified in this environment because Docker Compose v2 is unavailable.
- Secret scan is intentionally lightweight and should not be considered a full security audit.
- CI workflow syntax is simple YAML and should be accepted by GitHub Actions, but final confirmation will happen when GitHub runs the workflow after push/PR.
