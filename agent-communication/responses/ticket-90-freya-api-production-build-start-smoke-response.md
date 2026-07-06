# Ticket 90 — API Production Build/Start Shape and Smoke Response

Task: Ticket 90 — API Production Build/Start Shape and Smoke
Agent: Freya (frontend)
Status: Complete, with cleanup caveat noted below

## Summary

Implemented a preview-deploy-shaped API production build/start path without deploying or provisioning external services.

The API now has:

- a production emit config: `apps/api/tsconfig.build.json`;
- `pnpm --filter @wordle-royale/api build` emitting runnable `dist` output;
- `pnpm --filter @wordle-royale/api start` running the built API entrypoint;
- a repeatable local production-start smoke command:
  - `pnpm --filter @wordle-royale/api smoke:prod-start`
  - root alias: `pnpm smoke:api:prod-start`;
- a helper that links built workspace package outputs inside API `dist` so the built Nest app can resolve internal workspace imports without adding a bundler or new dependency.

No deployment was performed. No external DB/Redis was provisioned. No real `.env` file or production secret was created.

## Decisions / Recommendations

- Kept this as a plain TypeScript/Nest build path instead of adding a bundler dependency.
- Kept `typecheck` explicit and included it in `apps/api` `build`.
- The smoke uses local Docker Compose Postgres/Redis, a randomly allocated local port, `/readyz`, and then terminates the built API process.
- The smoke leaves local dependencies available for reuse during the run and I explicitly cleaned them up afterward with `pnpm deps:down`.
- The built API currently emits app code plus the workspace source dependencies it imports (`contracts`, `game-engine`) under API `dist`, then writes local package shims under `apps/api/dist/node_modules/@wordle-royale/*`. This is a pragmatic deploy-shape step for the current monorepo structure.

## Detailed Output

Implemented scripts:

```json
{
  "@wordle-royale/api": {
    "build": "pnpm run typecheck && tsc -p tsconfig.build.json && node scripts/link-built-workspace-packages.mjs",
    "start": "node dist/apps/api/src/main.js",
    "smoke:prod-start": "node ../../scripts/api-prod-start-smoke.mjs"
  },
  "root": {
    "smoke:api:prod-start": "node scripts/api-prod-start-smoke.mjs"
  }
}
```

Successful smoke evidence:

```text
INFO api smoke port — 45219
$ node dist/apps/api/src/main.js
[NestApplication] Nest application successfully started
PASS readyz — http://127.0.0.1:45219/readyz returned status=ok
PASS api prod-start smoke — service=wordle-royale-api, env=production
INFO api process terminated — exit=null
```

Direct `pnpm --filter @wordle-royale/api start` evidence after build:

```text
GET http://127.0.0.1:59127/readyz -> {"status":200,"service":"wordle-royale-api","readiness":"ok","env":"production"}
```

## Open Questions

- Longer term, should API preview builds use a bundler (`esbuild`/`tsup`) or TypeScript project references/workspace package `exports` instead of the current shim approach?
- Should the prod-start smoke stop Docker dependencies automatically by default, or keep them running for local developer reuse and rely on explicit `pnpm deps:down`?

## Follow-up Tickets

- Yuna/Ticket 91 can now wire this deploy-shape smoke into CI via `pnpm --filter @wordle-royale/api smoke:prod-start` or `pnpm smoke:api:prod-start`.
- Future infra/auth work should lock the preview migration/start policy before a real public API deployment.
- A future package-architecture cleanup could standardize all internal workspace packages to emit clean `dist` and use package `exports`, removing the need for API dist shims.

## Files Changed

Intended Ticket 90 changes:

- `apps/api/package.json`
- `apps/api/tsconfig.build.json`
- `apps/api/scripts/link-built-workspace-packages.mjs`
- `scripts/api-prod-start-smoke.mjs`
- `package.json`
- `agent-communication/responses/ticket-90-freya-api-production-build-start-smoke-response.md`

Existing/unrelated untracked files observed in the working tree are not part of this ticket, including Ticket 89 response/doc files.

Cleanup caveat: running workspace builds also left untracked generated compiled files under `packages/contracts/src` and `packages/game-engine/src` (`*.js`, `*.d.ts`, and maps). I asked for approval to delete only those generated artifacts, but no response arrived within the tool timeout, so I did not remove them.

## Tests / Commands Run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands and exit codes:

```bash
pnpm --filter @wordle-royale/api build
# first run: exit 2 — failed because initial build config used rootDir=src while imports resolved workspace source packages
# final run: exit 0

pnpm --filter @wordle-royale/api smoke:prod-start
# first run: exit 1 — failed because package shim used invalid package exports target
# second run: exit 124 — /readyz passed, but pnpm wrapper did not terminate cleanly after SIGTERM
# final run: exit 0 — smoke passed and API process terminated cleanly

pnpm --filter @wordle-royale/api test
# exit 0 — 40/40 tests passed

pnpm --filter @wordle-royale/api build
# exit 0

pnpm build
# exit 0

pnpm secret-scan
# exit 0 — Secret scan passed (230 source/config files scanned)

git diff --check
# exit 0

pnpm deps:down
# exit 0
```

Additional manual start evidence:

```bash
# background: pnpm --filter @wordle-royale/api start with local env on PORT=59127
node -e/fetch http://127.0.0.1:59127/readyz
# exit 0 — returned HTTP 200 and readiness=ok
```

## Evidence / Result

Acceptance criteria status:

- `pnpm --filter @wordle-royale/api build` produces runnable dist output: PASS.
- `pnpm --filter @wordle-royale/api start` works against local env after build: PASS.
- Repeatable API production-start smoke command exists and passes locally: PASS.
- Existing API tests still pass: PASS, 40/40.

## Risks / Blockers

- The current build approach is deploy-shaped but still monorepo-specific; it emits API plus required workspace package source dependencies into API `dist` and links them via local package shims.
- Generated untracked package-source artifacts remain in the working tree because cleanup approval timed out.
- Actual public deployment, external managed DB/Redis provisioning, preview secrets, and migration policy remain intentionally out of scope for this ticket.
- Browser/visual checks: not applicable; this is API build/start infrastructure only.
- Accessibility notes: no UI changed.
