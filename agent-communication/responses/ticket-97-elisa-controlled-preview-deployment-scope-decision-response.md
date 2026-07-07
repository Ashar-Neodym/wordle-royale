# Ticket 97 — Controlled Preview Deployment Scope Decision Lock Response

Task: Ticket 97 — Controlled Preview Deployment Scope Decision Lock
Agent: Elisa (architecture/product)
Status: Complete

## Summary

I created the Wave N controlled public-preview deployment decision lock:

- `docs/2026-07-06-controlled-preview-deployment-scope-decision-lock.md`

Core decision: **Wave N should prepare a controlled web + hosted API public preview, not a production launch and not a public mobile preview claim.**

The preview remains demo-only:

- explicit preview demo sessions;
- no durable accounts;
- sessions/data may reset;
- web/API only for public preview scope;
- mobile remains Expo Go / physical-smoke verification only until Ashar completes phone observation.

## Decisions / Recommendations

1. **First controlled preview scope: web + hosted API.**
   - Public web app.
   - Hosted Nest API using Wave M production build/start shape.
   - Isolated preview database.
   - Explicit preview demo sessions.

2. **Mobile is not a public preview claim yet.**
   - Keep Expo Go / physical-device smoke as a verification track.
   - Do not claim full mobile public-preview readiness until phone smoke is actually observed.

3. **Recommended provider/deploy planning route for Yuna.**
   - Web: Vercel-style free Next.js hosting.
   - API: Render/Fly/Railway-style cheap/free long-running Node service or container service.
   - Database: Neon/Supabase/Render-style managed preview Postgres.
   - Redis: minimize; either verify a free/cheap Redis-compatible service if `/readyz` remains hard-required, or have Ticket 99 make Redis readiness optional if runtime does not need it.

4. **No provisioning without Ashar approval.**
   - Ticket 97/98/99 must not deploy, create resources, add secrets, or create real `.env` files.

## Detailed Output

The decision lock defines:

- in-scope web/API/mobile boundaries;
- required preview caveats;
- provider/deployment route for Yuna to plan around;
- explicit out-of-scope items;
- approval gates before real provisioning/deployment;
- handoff notes for Yuna, Freya, Luna, and Jasmine.

## Required user-facing caveats

Preview copy must clearly say:

- preview/demo only;
- no durable accounts;
- sessions may reset;
- preview data may reset;
- no password/email required;
- server-authoritative gameplay;
- spoiler-safe sharing;
- mobile physical smoke pending unless Ashar closes it;
- free/cheap hosting may cold-start or be temporarily unavailable.

Suggested banner from the doc:

```text
Wordle Royale public preview: demo sessions only. No durable accounts yet; sessions and preview data may reset. Mobile is experimental until physical-device smoke is complete.
```

## Approval gates before real deployment/provisioning

Athena should ask Ashar to approve actual deployment/provisioning only after:

1. Ticket 97 decision is accepted.
2. Ticket 98 runbook is complete.
3. Ticket 99 hosted API hardening is complete.
4. Ticket 100 release copy/mobile caveat work is complete.
5. Ticket 101 Wave N PR/CI is green.
6. Ticket 102 QA approves or clearly warns/fails.
7. Yuna lists exact resources and secret names without real secret values.
8. Cost/free-tier posture is clear.
9. Rollback/reset plan is clear.
10. Ashar explicitly says to provision/deploy.

## Open Questions

None blocking for Ticket 97.

Intentional Ticket 98/99 follow-ups:

- Yuna must verify current free-tier/provider constraints before recommending actual provisioning.
- Freya/Yuna must decide whether Redis is required for hosted `/readyz` or should be optional if not product-critical.
- Ashar must approve any real provider resources, secrets, or deployment.

## Follow-up Tickets

### Ticket 98 — Yuna

Use the decision lock as the baseline for the infrastructure/environment runbook:

- web + API + preview Postgres;
- Redis minimized or justified;
- exact env map;
- build/start/migrate/smoke commands;
- rollback and reset policy;
- no deployment/provisioning yet.

### Ticket 99 — Freya

Harden hosted API preview behavior:

- preview/prod-like env validation;
- CORS/cookie settings for split web/API hosts;
- clearer missing dependency failures;
- readiness behavior useful for provider health checks;
- preserve no silent fixture impersonation.

### Ticket 100 — Luna

Add/verify honest preview release copy:

- demo sessions only;
- no durable accounts;
- sessions/data may reset;
- mobile physical-smoke caveat;
- no production launch language.

### Ticket 102 — Jasmine

QA should verify:

- no provider resources or secrets were created before approval;
- runbook matches scripts/env names;
- user-facing caveats are visible;
- no spoiler/session/private data leaks;
- no public mobile claim unless physical smoke is completed.

## Files Changed

- `docs/2026-07-06-controlled-preview-deployment-scope-decision-lock.md`
- `agent-communication/responses/ticket-97-elisa-controlled-preview-deployment-scope-decision-response.md`

No source code, package files, env files, migrations, deployment config, secrets, provider resources, or external services were changed.

## Tests / Commands Run

Inspection performed:

- `agent-communication/tickets/ticket-97-elisa-controlled-preview-deployment-scope-decision.md`
- `agent-communication/index.md`
- `docs/2026-07-06-athena-final-wave-m-review.md`
- `agent-communication/responses/ticket-96-jasmine-qa-review-wave-m-preview-deploy-approval-response.md`
- `agent-communication/tickets/ticket-98-yuna-preview-infrastructure-env-runbook.md`
- `agent-communication/tickets/ticket-99-freya-hosted-api-preview-hardening.md`
- `package.json`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/preview-demo-session.service.ts`

Verification commands:

```bash
date +%F
git diff --check
pnpm secret-scan
git status --short --branch
```

Observed output:

```text
# date +%F
2026-07-06

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (189 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-97-elisa-controlled-preview-deployment-scope-decision-response.md
?? agent-communication/tickets/ticket-100-luna-preview-release-copy-and-mobile-smoke.md
?? agent-communication/tickets/ticket-101-yuna-wave-n-checkpoint-pr-ci-monitor.md
?? agent-communication/tickets/ticket-102-jasmine-qa-review-wave-n-preview-deploy-setup.md
?? agent-communication/tickets/ticket-97-elisa-controlled-preview-deployment-scope-decision.md
?? agent-communication/tickets/ticket-98-yuna-preview-infrastructure-env-runbook.md
?? agent-communication/tickets/ticket-99-freya-hosted-api-preview-hardening.md
?? docs/2026-07-06-controlled-preview-deployment-scope-decision-lock.md
```

Note: the modified index and untracked Wave N ticket files pre-existed this ticket's work. Ticket 97 changed only the response file and decision-lock doc listed above.

## Evidence / Result

Acceptance criteria status:

- **Produces decision lock with in-scope/out-of-scope preview boundaries:** complete.
- **Names recommended provider/deploy route or comparison decision for Yuna:** complete.
- **Lists required user-facing caveats:** complete.
- **Lists approval gates before real deployment/provisioning:** complete.
- **No deployment/provider/secrets/code changes:** complete.

## Risks / Blockers

### Blockers

None for Ticket 97.

### Warnings / follow-ups

1. Hosted provider behavior is not validated yet; that is Wave N runbook/hardening scope.
2. Preview demo sessions are still non-durable and not production auth.
3. Redis should not become a paid dependency by accident; Ticket 98/99 must either justify it or reduce it.
4. Mobile physical smoke remains a caveat until Ashar can test a real phone.
5. Secret scan excludes docs and `agent-communication`; this Markdown decision artifact is therefore outside the scanner's file set.
