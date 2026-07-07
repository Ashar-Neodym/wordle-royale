# Controlled preview deployment scope decision lock — Wave N

Date: 2026-07-06
Owner: Elisa
Ticket: 97 — Controlled Preview Deployment Scope Decision Lock
Inputs: Ticket 96 QA verdict, Athena final Wave M review, Wave M implementation state, Wave N ticket index

## Executive decision

**Wave N should prepare a controlled web + API public preview deployment, not a production launch and not a public mobile preview claim.**

Recommended first preview scope:

1. **Web preview:** public web app for early testers.
2. **Hosted API preview:** production-start API connected to isolated preview dependencies.
3. **Preview demo sessions:** explicit, non-durable demo sessions only; no real accounts.
4. **Mobile:** Expo Go / physical-device smoke only; do not claim public mobile preview readiness until Ashar completes phone observation.
5. **No real deployment/provisioning until Ashar approves provider/resource creation after Yuna's runbook and Freya's hosted API hardening are complete.**

The goal is to validate hosted web/API behavior, preview demo gameplay, env/secrets mapping, and rollback/reset procedures with minimum cost and minimum account/security surface.

## In scope for first controlled public preview

### Web

In scope:

- Hosted web app reachable at a preview URL.
- Public pages already considered safe:
  - landing/home;
  - leaderboard/ranking surfaces;
  - lobbies/discovery;
  - public player/profile summaries;
  - completed spoiler-safe match result/share surfaces;
  - rules/learn/static product pages.
- Web uses a hosted `NEXT_PUBLIC_API_URL` pointing to the preview API.
- UX clearly labels preview/demo limitations.

Not required for first preview:

- Custom domain.
- Production SEO/analytics/marketing stack.
- Paid observability or SaaS analytics.

### API

In scope:

- Hosted Nest API started via the Wave M production build/start path.
- Health/readiness endpoints checked from the provider environment:
  - `GET /healthz`;
  - `GET /readyz`.
- Isolated preview database.
- Preview demo-session mode:

```text
APP_ENV=preview
NODE_ENV=production
AUTH_MODE=preview_demo_session
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

- CORS/cookie settings aligned to the hosted web origin and API host.
- Preview DB migration policy documented and rehearsed before actual deployment.
- Rollback path documented before deployment.

Not required for first preview:

- Durable production account/session auth.
- Multi-region scaling.
- Background worker architecture.
- Production-grade monitoring stack.

### Gameplay/data

In scope:

- Preview demo users can start/join demo sessions and exercise safe lobby/ranked flows.
- Server remains authoritative for gameplay/rating state.
- Public result/share data remains spoiler-safe.
- Preview data may be reset.

Not in scope:

- Production ratings as durable user history.
- Account recovery or support promises.
- Import/export/delete account flows.

### Mobile

In scope:

- Keep Expo Go / LAN or preview-config smoke as a verification track.
- If Ashar has a phone available, Luna can close the physical smoke checklist.
- Web/API preview release notes may say mobile is experimental/manual-test only.

Out of scope:

- Public mobile preview claim.
- App Store / Play Store release.
- TestFlight / Play internal-track setup unless Ashar explicitly asks later.

## Required user-facing caveats

These caveats must appear in preview release copy, demo-start UI, or a visible preview notice:

1. **Preview/demo only:** This is an early public preview, not production.
2. **No durable accounts:** Demo sessions are not real accounts.
3. **Sessions may reset:** Preview demo sessions are in-memory/non-durable and may reset on API restart or redeploy.
4. **Data may reset:** Ratings, lobbies, match history, and demo profiles may be cleared between preview runs.
5. **No password/email required:** The preview should not ask for real account credentials.
6. **Server-authoritative gameplay:** Game results/rating are controlled by the server; clients only submit intents.
7. **Spoiler-safe sharing:** Result/share surfaces do not reveal active answer words, hashes, salts, or hidden guesses.
8. **Mobile caveat:** Mobile Expo Go physical visual smoke is still pending unless Ashar completes the phone checklist.
9. **Availability caveat:** Free/cheap preview hosting may sleep, cold-start, or be temporarily unavailable.

Suggested concise banner copy:

```text
Wordle Royale public preview: demo sessions only. No durable accounts yet; sessions and preview data may reset. Mobile is experimental until physical-device smoke is complete.
```

## Recommended provider/deploy route for Yuna to plan around

Yuna should draft the runbook around this default route, while verifying current free-tier availability before any provisioning:

| Component | Recommended planning route | Rationale | Decision status |
|---|---|---|---|
| Web | Vercel-style free Next.js hosting | Simple fit for Next.js web, environment-variable based, easy rollback by redeploying prior commit. | Recommended default, verify free-tier constraints. |
| API | Render/Fly/Railway-style cheap/free Node web service or container service | Supports long-running Nest API and production `start` command better than forcing API into web serverless shape. | Compare in runbook; choose the simplest free/cheap option Ashar approves. |
| Database | Neon/Supabase/Render-style managed Postgres preview DB | Isolated preview database with migration support; no production data. | Required for hosted API preview; exact provider needs Ashar approval. |
| Redis | Avoid as a product dependency if possible; if `/readyz` remains Redis-hard-required, plan a free/cheap Redis-compatible service or make Redis readiness optional in Ticket 99 if runtime does not need it. | Current local readiness checks Redis, but preview demo sessions are in-memory and core product should not add paid Redis just for first preview unless proven necessary. | Open implementation/runbook decision for Tickets 98–99. |
| Mobile | Expo Go manual smoke only | No store release or public mobile claim needed for web/API preview. | Manual verification track, not deployment provider. |

Provider-route decision for Wave N:

- **Preferred shape:** separate web host + API host + managed preview Postgres.
- **Do not force API into Vercel serverless** unless Yuna proves the Nest production-start path works cleanly there without extra complexity.
- **Do not add paid resources** without Ashar approval.
- **Do not provision anything** during Ticket 97/98/99 unless Ashar explicitly approves.

## Explicitly out of scope

- Deploying anything during this ticket.
- Creating cloud/provider resources.
- Logging into provider CLIs.
- Adding or committing secrets.
- Creating real `.env` files.
- Paid SaaS, paid cloud resources, proprietary datasets, or subscription dependencies without approval.
- Production launch language.
- Real email/password registration/login.
- OAuth/social login or magic-link email.
- Password reset, account deletion/export, admin tools.
- Durable production auth/session guarantees.
- Public mobile preview claim.
- App-store release.
- CD/auto-deploy to production.
- Production monitoring/analytics stack.
- Any weakening of spoiler safety or server authority.

## Approval gates before real deployment/provisioning

Athena should ask Ashar for explicit approval only after these are true:

1. **Ticket 97 decision accepted.** This document is present and reviewed.
2. **Ticket 98 runbook complete.** Yuna provides provider comparison, exact env map, build/start/migrate/smoke commands, rollback procedure, reset policy, and cost/free-tier notes.
3. **Ticket 99 hosted API hardening complete.** Freya reduces or documents env/CORS/cookie/readiness risks; API tests and `pnpm smoke:api:prod-start` pass.
4. **Ticket 100 copy/mobile caveat complete.** Luna adds release copy/caveats and either closes or clearly preserves physical mobile-smoke caveat.
5. **Checkpoint PR/CI green.** Ticket 101 creates Wave N PR and GitHub Actions pass on the reviewed head.
6. **QA approval.** Ticket 102 gives a pass/warn/fail recommendation for controlled preview setup.
7. **Secret/resource list ready.** Yuna lists all required provider resources and secrets by name, with no real secret values in repo or chat.
8. **Cost posture clear.** Any non-free resource is explicitly called out and not assumed approved.
9. **Rollback/reset plan clear.** Operator can revert deploy, reset preview data, and disable demo sessions if abuse or leakage is found.
10. **Ashar explicitly says to provision/deploy.** Without this, all Wave N work remains docs/config/code-hardening only.

## Implementation handoff

### Yuna / Ticket 98

Use this decision as the runbook baseline:

- web + API + preview Postgres;
- Redis either free/cheap compatible service or made optional by Freya if not runtime-critical;
- no deployment/provisioning yet;
- exact env var classification;
- commands for build, start, migrate, smoke, rollback, and reset.

### Freya / Ticket 99

Harden hosted preview behavior without real secrets:

- env validation for `APP_ENV=preview`, `AUTH_MODE=preview_demo_session`, `COOKIE_SECURE=true`, disabled dev flags;
- CORS/cookie behavior for split web/API hosts;
- clearer failure when DB/Redis/env is missing;
- readiness behavior suitable for provider health checks;
- preserve no silent fixture impersonation.

### Luna / Ticket 100

Ensure preview copy is honest:

- demo sessions only;
- no durable accounts;
- sessions/data may reset;
- mobile physical smoke caveat;
- no production launch language.

### Jasmine / Ticket 102

QA should verify:

- no provider resources/secrets were created before approval;
- docs/runbook match actual scripts/env names;
- user-facing caveats are visible;
- API hardening tests/smoke pass;
- no spoiler/session/private data leaks;
- mobile public-preview claim is not made unless physical smoke is actually closed.

## Final decision locks

1. First public preview scope is **web + hosted API**, not production and not public mobile.
2. Preview auth scope remains **explicit demo sessions only**.
3. Preview users must see **demo/no-durable-account/data-may-reset/mobile-caveat** messaging.
4. Recommended planning route is **separate web host + Node API host + managed preview Postgres**, with Redis minimized or explicitly justified.
5. No deployment, provider resource, secret, paid service, or real `.env` file is allowed before Ashar explicitly approves provisioning/deployment.
