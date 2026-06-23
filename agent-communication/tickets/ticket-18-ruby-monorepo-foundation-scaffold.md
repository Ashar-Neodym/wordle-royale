# Ticket 18 — Monorepo Foundation Scaffold

**Assigned agent:** Ruby  
**Priority:** P0  
**Depends on:** Tickets 11–17  
**Blocks:** Tickets 19–24 implementation work

## Context

The project currently contains planning docs and agent tickets, but no application scaffold. This ticket creates the base workspace so backend/frontend/tooling agents can work in parallel afterward.

Use current decision lock:

`docs/2026-06-22-athena-decision-locks-after-tickets-11-17.md`

## Objective

Create the first pnpm monorepo scaffold for Wordle Royale with shared TypeScript configuration and placeholder package/app boundaries.

## Scope

Create/initialize:

- Root `package.json` with pnpm scripts.
- `pnpm-workspace.yaml`.
- Root `tsconfig.base.json`.
- Root formatting/lint config if lightweight.
- Directory structure:
  - `apps/api`
  - `apps/web`
  - `apps/mobile`
  - `packages/contracts`
  - `packages/game-engine`
  - `packages/design-tokens`
  - `packages/fixtures`
  - `packages/word-tools`
  - `packages/rating-tools`
- Minimal package manifests for shared packages.
- Minimal README explaining workspace scripts.
- Do **not** create production infra, secrets, or paid resources.

## Acceptance criteria

1. `pnpm install` works or the blocker is documented with exact error.
2. Workspace packages are discoverable by pnpm.
3. At least a root `pnpm typecheck` or placeholder validation script exists.
4. No production dictionary sources or secrets are added.
5. Response lists all files changed and commands run.

## Deliverable

Create response file:

`agent-communication/responses/ticket-18-ruby-monorepo-foundation-scaffold-response.md`


---

## Global agent response rule

Do **not** reply as a long Discord/chat message. Create a Markdown file in:

`agent-communication/responses/`

Use the exact response filename given in this ticket.

Use sections: Summary, Decisions/Recommendations, Detailed Output, Open Questions, Follow-up Tickets, Files Changed, Tests/Commands Run, Evidence/Result, Risks/Blockers.

Do not invent files, commands, tests, outputs, deployments, or verification evidence. If you run commands, include exact commands and whether they passed/failed.
