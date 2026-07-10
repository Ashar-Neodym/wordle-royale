# Ticket 103 — Preview Provider Final Decision and Approval Gate Response

Task: Ticket 103 — Preview Provider Final Decision and Approval Gate
Agent: Elisa (architecture)
Status: Complete — revised after Athena/Ashar correction

## Summary

I re-ran Ticket 103 after checking Athena's Wave O architecture direction and the ticket index. Athena did revise the direction: the old Neon-first decision is no longer correct.

Revised decision artifact:

- `docs/2026-07-07-preview-provider-final-decision.md`

Revised final recommendation for controlled hosted preview:

| Component | Decision |
|---|---|
| Web | **Vercel** project for the Next.js web app |
| API | **Separate long-running Node/Nest API server**; exact host selected by Yuna preflight from free/cheap options |
| Postgres | **Supabase Postgres first** |
| Postgres fallback | **Neon fallback only** if Supabase is blocked/unsafe/unacceptable after preflight |
| Redis | **Omit initially** with `REDIS_REQUIRED=false` and no `REDIS_URL` |
| Mobile | No public mobile preview claim; Expo Go/manual smoke only |

No provisioning, deployment, provider login, resource creation, secrets, or real `.env` files were created.

## What changed from the previous Ticket 103 answer

Old answer:

- Vercel web + Render API + Neon Postgres.

Revised answer:

- Vercel web + Supabase Postgres first + separate long-running API server.
- Render is no longer hard-locked; it remains an acceptable API-host candidate if Yuna's preflight chooses it.
- Neon is no longer first choice; it is fallback only.
- The architecture explicitly preserves a path toward thousands of concurrent users, but does not pretend the first free/cheap preview tier can handle production-scale load.

## Decisions / Recommendations

1. **Provider route locked:** Vercel web + Supabase Postgres first + separate long-running Node/Nest API server.
2. **API provider selection:** Yuna should preflight free/cheap long-running Node hosts such as Render/Fly/Railway or equivalent. The chosen host must support a persistent Node process, env secrets, HTTPS, health checks, and later horizontal scaling.
3. **Neon fallback only:** use Neon only if Supabase fails preflight or introduces unacceptable cost/connection/migration/account risk.
4. **Redis omitted initially:** use `REDIS_REQUIRED=false`; do not create Redis unless a later runtime feature or health policy requires it and Ashar approves.
5. **Cost posture:** free/cheap controlled preview only; no paid plans, custom domains, always-on upgrades, paid add-ons, or subscriptions without separate approval.
6. **Auth posture:** preview demo sessions only; no durable accounts, email/password, OAuth, magic links, or account recovery.
7. **Data posture:** isolated preview database only; preview data may reset; no production/private data.
8. **Mobile posture:** manual Expo Go / physical smoke only; no public mobile preview claim yet.
9. **Approval gate:** Ticket 105 remains blocked until Ashar explicitly approves provider/resource/secret creation.

## Robustness / scale guidance

Ashar wants the app to be capable of handling thousands of concurrent users eventually. The revised architecture is compatible with that goal because it keeps the right boundaries:

- Vercel handles web delivery/CDN separately from backend runtime.
- The API remains an authoritative long-running Nest service instead of being forced into Vercel serverless.
- Postgres remains standard and provider-portable.
- Supabase can be the first managed Postgres provider, with Neon as a portable fallback.
- Redis/realtime/queues/rate-limits can be added when real traffic or product features justify them.
- The API can later scale horizontally behind the chosen provider/load balancer.

Important caveat: the **first free/cheap controlled preview should not be marketed or treated as production-scale for thousands of simultaneous users**. Before broad public launch, add/verify:

1. API horizontal scaling and statelessness.
2. Supabase/Postgres connection pooling and query/index review.
3. Redis or equivalent for cross-instance rate limits, lobby/presence, pub/sub, queues, cache, or durable sessions.
4. Observability: logs, metrics, traces, uptime checks, error reporting.
5. Load testing for realistic ranked/lobby flows.
6. Abuse controls and spoiler/cheat protections under concurrency.

## Required approval phrase

Recommended explicit approval wording for Ashar if he wants Yuna to proceed later:

```text
I approve Wave O provisioning for Wordle Royale preview using Vercel web, Supabase Postgres first with Neon fallback only if Supabase is blocked, a separate long-running Node API host selected from the free/cheap option verified by Yuna, and no Redis initially (`REDIS_REQUIRED=false`). Use free/cheap settings only, store secrets only in provider env stores, and do not add paid plans/custom domains without asking me again.
```

Without equivalent approval, Ticket 105 should remain blocked.

## Open Questions

None blocking Ticket 103.

Provisioning-time checks remain for Ticket 104:

- provider account/access availability;
- exact free-tier/current-cost constraints;
- exact API host selection;
- Supabase pooled/direct connection URL handling;
- Supabase pause/connection limits for controlled preview;
- Neon fallback criteria if Supabase fails;
- repo/branch linking;
- provider rollback handles;
- ensuring no `/api/v1` is appended to API origin env vars.

## Follow-up Tickets

### Ticket 104 — Yuna

Revise/preflight around Vercel + Supabase + separate API host:

- confirm Vercel access;
- confirm Supabase preview DB access and free/cheap limits;
- choose exact long-running API host from free/cheap candidates;
- confirm provider command settings;
- confirm env var list and secret classification;
- document Neon fallback only if Supabase fails;
- confirm no Redis resource is needed initially;
- confirm any non-free setting is blocked pending Ashar approval.

### Ticket 105 — Yuna

Remain blocked until Ashar explicitly approves provisioning. If approved, provision only:

- one Vercel preview web project;
- one separate long-running preview API service;
- one Supabase preview Postgres database/project;
- Neon preview Postgres only as fallback if Supabase is blocked and the fallback is recorded;
- required provider env/secrets;
- no Redis initially.

### Tickets 106–109

Proceed only after Ticket 105 creates the approved hosted URLs/resources:

- Freya: hosted API deploy/smoke;
- Luna: hosted web preview smoke;
- Yuna: checkpoint evidence;
- Jasmine: final hosted-preview QA.

## Files Changed

- `docs/2026-07-07-preview-provider-final-decision.md`
- `agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md`

No source code, package files, env files, migrations, deployment config, secrets, provider resources, or external services were changed.

## Tests / Commands Run

Inspection performed:

- `agent-communication/tickets/ticket-103-elisa-preview-provider-final-decision.md`
- `agent-communication/index.md`
- `docs/2026-07-07-athena-wave-o-architecture-direction.md`
- prior `docs/2026-07-07-preview-provider-final-decision.md`
- prior `agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md`
- targeted API/web/mobile env/readiness search.

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
2026-07-07

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (190 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.

# git status --short --branch
## main...origin/main
 M agent-communication/index.md
?? agent-communication/responses/ticket-103-elisa-preview-provider-final-decision-response.md
?? agent-communication/responses/ticket-104-yuna-preview-provisioning-preflight-response.md
?? agent-communication/tickets/ticket-103-elisa-preview-provider-final-decision.md
?? agent-communication/tickets/ticket-104-yuna-preview-provisioning-preflight.md
?? agent-communication/tickets/ticket-105-yuna-controlled-preview-provisioning.md
?? agent-communication/tickets/ticket-106-freya-hosted-api-deploy-smoke.md
?? agent-communication/tickets/ticket-107-luna-hosted-web-preview-smoke.md
?? agent-communication/tickets/ticket-108-yuna-wave-o-checkpoint-pr-ci-deploy-evidence.md
?? agent-communication/tickets/ticket-109-jasmine-qa-review-wave-o-hosted-preview.md
?? docs/2026-07-07-athena-wave-o-architecture-direction.md
?? docs/2026-07-07-preview-provider-final-decision.md
?? docs/2026-07-07-preview-provisioning-preflight.md
```

## Evidence / Result

Acceptance criteria status:

- **Confirm exact provider targets for web/API/Postgres/Redis:** complete — Vercel, separate long-running API host, Supabase first, Neon fallback only, no Redis initially.
- **Confirm free/cheap cost posture and spend risks:** complete.
- **Confirm Redis omitted initially with `REDIS_REQUIRED=false`:** complete.
- **Define human approval checklist before provisioning:** complete.
- **Do not provision/deploy/log into providers/create secrets:** complete.

## Risks / Blockers

### Blockers

- Ticket 105 remains blocked until Ashar explicitly approves provider/resource/secret creation.

### Warnings / follow-ups

1. Provider free tiers and account requirements must be verified at provisioning time because they can change.
2. Supabase free-tier limits may not support high concurrency; this is acceptable for controlled preview but must be reviewed before broad launch.
3. The exact API host is intentionally delegated to Yuna preflight rather than hard-coded here.
4. Hosted provider behavior remains unvalidated until approved provisioning/deployment.
5. Preview demo sessions remain non-durable and may reset on API restart/redeploy.
6. Secret scan excludes `docs` and `agent-communication`, including this Markdown decision artifact; I manually kept the docs free of real secrets.
