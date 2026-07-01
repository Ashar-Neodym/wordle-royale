# Athena Wave K CI Fix

Date: 2026-07-01

## Problem

GitHub Actions failed on PR #1 at `Workspace checks / Setup Node.js`.

Root cause: the workflow pinned Node 20 while the repo uses `pnpm@11.1.1`. pnpm 11 requires Node >=22.13 and uses `node:sqlite`, which is unavailable in Node 20.

Failure excerpt:

```text
warn: This version of pnpm requires at least Node.js v22.13
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
Node.js v20.20.2
```

## Fix applied

- `.github/workflows/pr-checks.yml`: changed `actions/setup-node` from Node 20 to Node 24.
- `package.json`: changed Node engine from `>=20.0.0` to `>=22.13.0` so local/package metadata matches pnpm 11 requirements.

## Local verification

Athena reran:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm --filter @wordle-royale/api test
CI=true pnpm build
CI=true pnpm smoke:local
CI=true pnpm secret-scan
CI=true pnpm deps:check
git diff --check
```

Result: pass.

Key evidence:

- API tests: 37 pass / 0 fail.
- Web build passed, including `/matches/[matchId]` and `/profile/[handle]`.
- Mobile build passed.
- Secret scan passed: 184 source/config files scanned.
- Docker Compose config check passed.

## Checkpoint status

Current Wave K product-depth changes and the CI fix should be pushed to the existing PR branch:

```text
wave-k/checkpoint-ranked-loop-shell
```

After push, GitHub Actions should rerun on PR #1.
