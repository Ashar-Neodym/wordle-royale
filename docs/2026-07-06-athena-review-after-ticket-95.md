# Athena review after Ticket 95 — Wave M PR/CI unblock

Date: 2026-07-06
Owner: Athena
Scope: Verify Ticket 95, create the Wave M PR using Athena's GitHub token, fix CI if needed, and hand off to Jasmine for Ticket 96.

## Summary

Ticket 95 is accepted with Athena follow-up.

Yuna created and pushed the Wave M checkpoint branch, but PR creation was blocked in Yuna's shell because `gh` was not authenticated there. Athena used the saved GitHub token to create the PR, monitor CI, triage the initial failure, apply a small CI smoke fix, push it, and verify the rerun.

## PR

- PR: https://github.com/Ashar-Neodym/wordle-royale/pull/3
- Branch: `wave-m/preview-deploy-shape` → `main`
- Current PR head: `fbccbb9913502bbf1cdea6d49531959d3f64f9fd`
- Merge state: `CLEAN`
- State: `OPEN`

## CI

Initial run failed in the new API production-start smoke because the GitHub runner had not generated Prisma Client before starting the built API:

```text
Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.
```

Athena fix:

```text
ci: generate prisma client before api prod smoke
```

Change:

- `scripts/api-prod-start-smoke.mjs` now runs `pnpm --filter @wordle-royale/api db:generate` before building/starting the API.

Local verification after fix:

```bash
pnpm smoke:api:prod-start
pnpm secret-scan
git diff --check
pnpm deps:down
```

Result: all passed.

Remote CI rerun:

- Run: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28790198598
- Job: https://github.com/Ashar-Neodym/wordle-royale/actions/runs/28790198598/job/85366614277
- Check: `Workspace checks`
- Conclusion: `SUCCESS`

## Current recommendation

Proceed to Ticket 96 Jasmine QA against PR #3. Do not merge PR #3 until Jasmine completes independent QA and Ashar approves merge.

## Known caveats for Jasmine

- Mobile physical Expo Go visual smoke remains deferred unless Ashar provides actual phone observation.
- Preview demo sessions are intentionally in-memory/minimal and not durable production account auth.
- Actual public preview deployment is still out of scope until Ashar approves it in a later wave.
