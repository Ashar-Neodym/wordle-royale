# Preview MVP Auth, Account, and Deployment Boundary — Response

## Summary

Ticket 80 is complete.

I created the Wave L Preview MVP decision-lock for auth/account/deployment boundaries:

- `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`

The key decision is: **Preview must not silently impersonate the local stub user.** Local fixture auth remains useful for dev/test, but public preview must use an explicit `session_required` boundary. If real login is not implemented in Wave L, current-user/write actions should return honest `not_authenticated` states rather than fake accounts.

## Decisions / Recommendations

1. **Keep local dev stubs, but gate them to local/test.**
   - Local fixture users and `x-wordle-dev-user-id` remain allowed only under explicit local/test env checks.
   - Do not scatter `process.env.NODE_ENV !== 'production'`; Ticket 82 should centralize this in a small auth/current-user resolver.

2. **Preview/staging behavior is `session_required`.**
   - `/auth/me` must not return the stub user.
   - `POST /auth/register` must not return stub tokens.
   - Current-user endpoints and write actions require a real current user or return `not_authenticated`.

3. **Do not overbuild social login in Wave L.**
   - Defer Google/Apple/OAuth and magic-link email unless Ashar explicitly approves provider setup and secrets.
   - Minimal first-party email/password/session is acceptable only if Freya can implement it safely without external provider dependencies.

4. **Public preview data is limited and spoiler-safe.**
   - Public: handles, display names, ratings, leaderboard entries, public lobby metadata, completed spoiler-safe match summaries.
   - Private: emails, tokens, consent internals, hidden answers/hashes/salts, raw guesses, internal analytics payloads, private account fields, deployment secrets.

5. **Deployment assumptions stay free/cheap and non-operative.**
   - Web: Vercel/free Next host is plausible.
   - API: Render/Fly/Railway/free container host or adapted serverless path; Yuna must verify build/start readiness.
   - Postgres: isolated preview DB; no real service creation without approval.
   - Redis: avoid as a hard preview dependency unless proven needed.
   - Mobile: Expo preview/dev build only, not app-store production.

## Detailed Output

The decision-lock doc defines:

- local / preview-staging / future-production environment tiers;
- recommended `AUTH_MODE=dev_stub` for local and `AUTH_MODE=session_required` for preview;
- preview-safe current-user behavior;
- public/private data exposure rules;
- required env vars by tier;
- Ticket 82 implementation guidance;
- Ticket 81 deployment/env-readiness guidance;
- Wave L non-goals and decision locks.

## Open Questions

None blocking.

Future choices before public preview deployment:

1. Should Wave L implement minimal first-party email/password sessions, or ship read-only/unauthenticated preview states first?
2. Which free/cheap hosting combination should Yuna target for preview once Ashar approves external resources?
3. Should Redis remain optional for Preview MVP, or does a Wave L feature require it?
4. Which local API port should become canonical? Root examples use `4000`, while web local example/default currently use `3001`.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya
- **Why that agent is needed:** Freya owns backend/API auth/session implementation.
- **Exact task:** In Ticket 82, implement a central env/auth-mode current-user resolver with local/test `dev_stub` and preview/prod `session_required` behavior. Refactor `/auth/me`, `/profiles/me/summary`, `/matches/history/me`, active match state, guess submission, profile update, and ranked start to use it. Disable stub token registration outside local/test.
- **Inputs/context:** `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`, current `apps/api/src/auth/`, `apps/api/src/profile/`, `apps/api/src/gameplay/`.
- **Expected output:** API changes, tests for local fixture behavior and preview/prod unauthenticated behavior, no email/private data leakage, build/test/secret-scan evidence.

### Follow-up Ticket 2

- **Target agent:** Yuna
- **Why that agent is needed:** Yuna owns deployment/CI/environment planning.
- **Exact task:** In Ticket 81, use the Ticket 80 boundary to define preview env variables and verify deploy build/start readiness. Do not deploy, create resources, add CD, or configure secrets without Ashar approval.
- **Inputs/context:** Ticket 80 doc, `.env.example`, `.env.local.example`, `apps/web/.env.local.example`, package scripts, CI workflow.
- **Expected output:** Preview deployment readiness doc, free/cheap provider tradeoffs, script gaps, env/secrets table, verification output.

### Follow-up Ticket 3

- **Target agent:** Luna
- **Why that agent is needed:** Luna owns web/mobile auth-aware UX surfaces.
- **Exact task:** In Ticket 84/85, use honest unauthenticated states for current-user/write actions if login is unavailable; do not render fake signed-in preview behavior.
- **Inputs/context:** Ticket 80 doc and Ticket 82 response.
- **Expected output:** Auth-aware empty/login-required states for profile/history/match/lobby actions with no private data exposure.

### Follow-up Ticket 4

- **Target agent:** Jasmine
- **Why that agent is needed:** QA ownership.
- **Exact task:** In Ticket 87, verify preview/prod mode does not allow stub impersonation, dev headers, stub token registration, private data leakage, active-match spoiler leakage, or committed secrets.
- **Inputs/context:** Tickets 80–86 responses.
- **Expected output:** Preview readiness pass/fail matrix with blockers/warnings separated.

## Files Changed

- `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`
- `agent-communication/responses/ticket-80-elisa-preview-mvp-auth-deployment-boundary-response.md`

No source code, package files, env files, migrations, deployment config, secrets, or external resources were changed.

## Tests / Commands Run

Inspection performed:

- `agent-communication/tickets/ticket-80-elisa-preview-mvp-auth-deployment-boundary.md`
- `agent-communication/index.md`
- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `docs/2026-07-01-product-navigation-route-contracts-v2.md`
- `docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md`
- `.env.example`
- `.env.local.example`
- `apps/web/.env.local.example`
- `README.md`
- `apps/api/README.md`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/src/gameplay/gameplay.controller.ts`
- `packages/contracts/src/auth/schemas.ts`
- `apps/api/package.json`
- `apps/web/package.json`

Commands run:

```bash
date +%F
git diff --check
```

Observed output:

```text
# date +%F
2026-07-03

# git diff --check
<no output; exit 0>
```

## Evidence / Result

Acceptance criteria status:

- **Recommend Preview MVP auth/account approach:** yes; local stubs preserved, preview is `session_required`, social login deferred.
- **Define environment tiers:** yes; local, preview/staging, and future production are separated.
- **Define public preview data:** yes; handles, ratings, leaderboard, public lobby metadata, and completed spoiler-safe match summaries.
- **Define private data:** yes; emails, tokens, consent internals, analytics payloads, active answers/hashes/salts, raw guesses, secrets.
- **Recommend deployment target assumptions:** yes; free/cheap web/API/Postgres/mobile assumptions with no resource creation.
- **Produce concise decision-lock doc:** yes; saved under `docs/`.

## Risks / Blockers

### Blockers

None for Ticket 80.

### Risks / warnings

1. **Current implementation risk:** existing `/auth/me`, `/auth/register`, profile, gameplay, and dev-header flows are local-stub oriented and must not be exposed unchanged in preview.
2. **Script/deployment gap:** current API package has `build` as typecheck and no production `start` script; Yuna should verify in Ticket 81.
3. **Port consistency risk:** root env examples use API port `4000`, while web local example/default uses `3001`; Yuna/Luna should reconcile before preview docs become operator-facing.
4. **Auth scope risk:** adding social login or magic links now would introduce provider secrets and callback/privacy complexity; defer unless approved.
5. **Spoiler/privacy risk:** preview public match/profile surfaces must preserve Wave K spoiler-safety rules.
