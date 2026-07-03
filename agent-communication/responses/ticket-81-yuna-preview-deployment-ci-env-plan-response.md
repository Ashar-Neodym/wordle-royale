# Ticket 81 — Preview Deployment, CI, and Environment Plan Response

Task: Preview deployment, CI, and environment plan
Agent: Yuna (operations)
Status: Completed — plan/config-readiness only; no deployment or external resources created

## What I understood

Wave K is merged to `main` and the project needs a public-preview readiness path before any real deployment. Ticket 81 asked for a hosting layout recommendation, free/cheap tradeoffs, environment/secrets tiering, CI recommendations, a deploy-script readiness check, and a short docs artifact. No CD, deployment, paid action, secret creation, or external resource provisioning was approved or performed.

Ticket 80 response was not available when I started, so I used the Ticket 80 prompt plus current repo docs/env templates as the auth/deployment boundary input.

## What I did

- Read the Wave K merge review, current PR checks workflow, env templates, local development docs, package scripts, API/web/mobile package scripts, and Ticket 80 prompt.
- Inspected current build/start script readiness for web, API, and mobile.
- Wrote a preview-readiness plan under `docs/`.
- Ran the required verification commands from the ticket.
- Wrote this response file.

## Files changed

- `docs/2026-07-01-preview-deployment-ci-env-plan.md`
- `agent-communication/responses/ticket-81-yuna-preview-deployment-ci-env-plan-response.md`

No source code, CI workflow, env template, deployment config, provider config, or secret file was changed for this ticket.

## Recommendation summary

Recommended preview layout:

| Surface | Recommendation | Notes |
|---|---|---|
| Web | Vercel Preview for `apps/web` | Best free/cheap Next.js preview path. |
| API | Render Web Service first, Fly.io as production-like alternative | Current NestJS API wants a long-running Node service, not Vercel serverless. |
| Postgres | Neon or Supabase preview DB | Managed preview DB; do not use local Docker for public preview. |
| Redis | Upstash Redis | Cheap/free managed Redis for preview. |
| Mobile | Expo Go/manual real-device preview first; EAS later only if approved | Avoid EAS token/build complexity for now. |

## Key readiness finding

The current repository is **not ready for an API preview deployment yet**, even though local CI/build gates pass.

Current gaps:

- `apps/api` `build` is typecheck-only: `pnpm run typecheck`.
- `apps/api` has no production `start` script.
- No preview migration-run policy is locked yet.
- No hosting/provider config should be added until Ashar approves provider choices and secret creation.

Recommended follow-up implementation before first API preview deploy:

```json
{
  "@wordle-royale/api": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  }
}
```

That may require TypeScript module/output adjustments, so I did not silently add it in this planning ticket.

## CI recommendation

Keep current `.github/workflows/pr-checks.yml` as the required PR gate. Add preview-readiness checks later, but still no CD, such as:

- `pnpm --filter @wordle-royale/api db:validate`
- web build with placeholder preview public API URL
- mobile build with placeholder preview public API URL
- API deploy-shape/start smoke once production build/start scripts exist
- keep `pnpm secret-scan`

Do not add deploy jobs, cloud login actions, provider tokens, or CD until Ashar explicitly approves.

## Tests / commands run

Working directory:

```text
/home/ashar/Desktop/hermes-projects/wordle-royale
```

Commands run with exit codes:

```bash
git diff --check                         # 0
CI=true pnpm lint                        # 0
CI=true pnpm typecheck                   # 0
CI=true pnpm build                       # 0
CI=true pnpm secret-scan                 # 0
```

Verification evidence:

```text
Workspace scaffold validation passed (9 workspace packages).
apps/web build: ✓ Compiled successfully
apps/mobile build: Done
apps/api build: Done
Secret scan passed (184 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

## Safety / approval boundaries

- No deployment performed.
- No external services/resources created.
- No paid actions performed.
- No secrets generated, rotated, printed, or stored.
- No CD workflow added.
- No env template values changed.

## Blockers / risks

- Ticket 80 response was not present, so this plan should be reconciled with Elisa's final auth/account boundary once available.
- API preview deploy needs a real production build/start script before provider setup.
- Preview DB/Redis provider selection and secret creation need Ashar approval.
- Mobile public preview should stay manual Expo Go until Ashar approves EAS setup/token handling.

## Follow-up tickets

### Follow-up ticket 1

- Target agent: Elisa
- Why that agent is needed: Ticket 80 owns auth/account/deployment boundary and privacy policy.
- Exact task: Reconcile `docs/2026-07-01-preview-deployment-ci-env-plan.md` with the final Ticket 80 decision-lock doc.
- Inputs/context they need: Ticket 81 doc, Ticket 80 response/doc, current env templates.
- Expected output back to Athena: Any required changes to preview auth/session/env assumptions.

### Follow-up ticket 2

- Target agent: Freya
- Why that agent is needed: API preview deployment requires backend build/start readiness.
- Exact task: Add and verify production-ready API build/start commands without changing deployment providers.
- Inputs/context they need: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, this Ticket 81 response.
- Expected output back to Athena: API `build` emits a runnable artifact, `start` runs it, and local `/healthz` smoke evidence.

### Follow-up ticket 3

- Target agent: Jasmine
- Why that agent is needed: Independent preview-readiness QA before external resources are created.
- Exact task: Review the Ticket 81 plan and verify it does not require secrets, deployment, or provider accounts before approval.
- Inputs/context they need: `docs/2026-07-01-preview-deployment-ci-env-plan.md`, this response, current `.env.example`, `.env.local.example`, and `.github/workflows/pr-checks.yml`.
- Expected output back to Athena: Readiness/risks summary and any missing pre-deploy checklist items.
