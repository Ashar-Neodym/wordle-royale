# Ticket 30 — CI Quality Gates and GitHub Actions Hardening

**Assigned agent:** Yuna  
**Priority:** P0  
**Type:** Implementation  
**Response file:** `agent-communication/responses/ticket-30-yuna-ci-quality-gates-and-github-actions-hardening-response.md`  
**Latest context:** `docs/2026-06-23-athena-review-after-tickets-18-24.md`

## Objective

Harden free GitHub Actions CI and local quality gates now that the repo is pushed and package implementations exist.

## Scope

Improve CI/local checks:

1. GitHub Actions workflow for PRs and pushes to `main`.
2. pnpm with lockfile/frozen install.
3. Minimum checks: workspace validation, package tests, package builds, local smoke check.
4. Ensure generated/build artifacts remain ignored where appropriate.
5. Add lightweight source-focused secret scan script or documented command excluding `node_modules`, `dist`, and docs noise.
6. Add CI notes for Docker Compose being optional/unavailable unless explicitly enabled later.

## Expected files / areas

Likely files:

- `.github/workflows/pr-checks.yml`
- `scripts/*`
- `package.json`
- `.gitignore`
- `docs/ci.md`

## Acceptance criteria

- No paid CI services; GitHub Actions only.
- No required secrets.
- `pnpm install --frozen-lockfile` passes locally.
- `pnpm test` passes locally.
- `pnpm build` passes locally.
- `pnpm smoke:local` passes locally.
- Any new `secret-scan` script passes and documents exclusions/limitations.
- Workflow syntax is valid YAML.

## Out of scope

- Deployment.
- Branch protection changes.
- Paid scanners.
- Production secrets.

## Required response format

Create a Markdown file at:

`agent-communication/responses/ticket-30-yuna-ci-quality-gates-and-github-actions-hardening-response.md`

Use this structure:

```markdown
# CI Quality Gates and GitHub Actions Hardening — Response

## Summary

## Decisions / Recommendations

## Detailed Output

## Open Questions

## Follow-up Tickets

## Files Changed
If no files changed, write: None.

## Tests / Commands Run
If none, write: None — planning/spec task only.

## Evidence / Result

## Risks / Blockers
```

## Global constraints

- Work in `/home/ashar/Desktop/hermes-projects/wordle-royale/`.
- Prioritize open-source/free/local-first tools.
- Do not add paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without Ashar approval.
- Do not commit secrets. Do not create real `.env` files. Use `.env.example` / `.env.local.example` placeholders only.
- Preserve existing passing checks. If a check fails, include exact command/output and either fix it or explain the blocker.
- Do not push to GitHub unless explicitly asked by Athena/Ashar.
