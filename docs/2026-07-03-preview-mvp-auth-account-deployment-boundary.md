# Preview MVP auth, account, and deployment boundary — Wave L

Date: 2026-07-03
Owner: Elisa
Input: Ticket 80, Wave K merge review, Wave K route contracts, privacy-safe analytics taxonomy, current README/env examples

## Goal

Lock the Preview MVP boundary for authentication, account data, public/private data exposure, and deployment assumptions so Wave L implementation can proceed without accidentally shipping local dev impersonation, fake auth, secrets, or overbuilt social login.

This is a decision-lock/spec artifact only. It does not deploy, create external resources, add real secrets, change runtime code, or select a paid provider.

## Executive decision

**Recommended Preview MVP posture:** public preview is allowed to show ranked game surfaces and public player data, but authenticated player actions must use an explicit preview-safe session boundary. Local fixture/stub behavior remains available only in local/test.

For Wave L, implement the smallest honest auth slice:

1. **Local/test:** keep current fixture users and `x-wordle-dev-user-id` convenience, but gate it behind explicit local/test environment checks.
2. **Preview/staging:** disable silent stub login/registration/dev user impersonation. If no real session exists, current-user endpoints and write actions return a clear `not_authenticated`/401-style envelope.
3. **Future production:** same security posture as preview, with stronger operational controls and real account lifecycle only when approved.

Do **not** add Google/Apple/social login in Wave L unless Ashar explicitly approves provider setup and secrets. For Preview MVP, use either no-login read-only preview plus local dev fixtures, or a minimal email/password/session slice if Freya implements it without external provider dependencies.

## Environment tiers

### Tier 1: local

Purpose:

- developer machines;
- local ranked smoke tests;
- deterministic fixture users;
- no public traffic.

Suggested env markers:

```text
APP_ENV=local
NODE_ENV=development
AUTH_MODE=dev_stub
ENABLE_DEV_AUTH=true
ENABLE_DEV_ROUTES=true
COOKIE_SECURE=false
```

Allowed behavior:

- fixture users: `player_one`, `guest_player`, empty-history user;
- `x-wordle-dev-user-id` may select local fixture users;
- local reset/seed/dev terminalize helpers may run;
- stub access/refresh token strings may exist only as local/test placeholders;
- public profile/history/lobby/match pages may hit local API directly.

Must not happen:

- accepting real user credentials as production accounts;
- sending local analytics externally;
- committing real `.env` files or secrets.

### Tier 2: preview/staging

Purpose:

- public or semi-public preview candidate;
- no production promises;
- safe ranked loop testing against isolated preview data.

Suggested env markers:

```text
APP_ENV=preview
NODE_ENV=production
AUTH_MODE=session_required
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

Required behavior:

- `/auth/me` must not silently return the stub user.
- `POST /auth/register` must not return stub tokens.
- `x-wordle-dev-user-id` must be ignored or rejected.
- Current-user endpoints (`/profiles/me/summary`, `/matches/history/me`, active match state/actions) require an authenticated current user or return `not_authenticated`.
- Public read endpoints may work without auth where intentionally public: leaderboard, public profile summaries, public lobby discovery, completed spoiler-safe match summaries.
- Dev reset/terminalize helpers are disabled.
- Cookie/session settings must be preview-safe if sessions exist.
- Preview database is isolated from local and future production.

Acceptable Preview MVP options:

| Option | Recommendation | Notes |
|---|---|---|
| Read-only public preview + local-only gameplay writes | Safest if auth is not ready | Public visitors can browse leaderboard/lobbies/rules/static profile examples; write actions show login-required states. |
| Minimal first-party email/password session | Acceptable if Ticket 82 can implement safely | Requires password hashing, session cookies/tokens, CSRF/cookie policy, tests, and no stub fallback. |
| Magic-link email | Defer | Requires email provider/secrets and deliverability decisions. |
| Google/Apple/social login | Defer | External providers, secrets, callbacks, privacy policy work; overbuilt for Wave L. |

Elisa recommendation: **build Preview L around `session_required` behavior first.** If real login is not implemented in Ticket 82, ship honest unauthenticated/preview-safe states rather than fake accounts.

### Tier 3: future production

Purpose:

- real user traffic;
- durable account and data obligations;
- stronger privacy/security expectations.

Required before production:

- real account/session lifecycle;
- password reset or approved auth provider;
- privacy/terms pages;
- retention/deletion policy;
- production secrets and rotation procedure;
- backup/restore posture for database;
- abuse/rate-limit plan;
- operational logging/monitoring boundary;
- explicit production deployment approval.

Wave L should not claim production readiness.

## Auth/account boundary

### Local dev stub behavior

Keep local stub behavior because it enables fast ranked smoke tests and fixture-driven QA.

But implementation should centralize and gate it:

```ts
type AppEnv = 'local' | 'test' | 'preview' | 'production';
type AuthMode = 'dev_stub' | 'session_required';

const devAuthAllowed = (appEnv === 'local' || appEnv === 'test') && authMode === 'dev_stub';
```

Do not scatter `process.env.NODE_ENV !== 'production'` checks across controllers. Ticket 82 should introduce one small auth/session helper or request-current-user service that all current-user routes use.

### Preview behavior

In preview/staging:

- no implicit current user;
- no stub token issuance;
- no dev header user switching;
- no fixture user upsert as a side effect of `/auth/me`;
- no profile update for anonymous visitors;
- no ranked match action for anonymous visitors.

Recommended error contract:

```json
{
  "data": null,
  "error": {
    "code": "not_authenticated",
    "message": "Sign in is required for this action.",
    "details": { "authMode": "session_required" }
  },
  "requestId": "..."
}
```

Use standard HTTP 401 for missing/invalid session where practical while preserving the shared envelope shape.

### Account model for Preview MVP

Minimum current-user shape for authenticated preview sessions:

```ts
type PreviewCurrentUser = {
  id: string;
  email: string | null; // current user only; never public profile/leaderboard
  status: 'active';
  role: 'player';
  createdAt: string;
  profile: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    profileVisibility: 'public' | 'participants_only' | 'private';
  } | null;
};
```

Public pages should use public profile/read-model contracts, not `CurrentUser`.

## Public vs private preview data

### Public in preview

The following can be public if already returned through spoiler-safe public/read endpoints:

- player handle;
- display name;
- avatar URL if user-configured and not private;
- public profile visibility state where needed;
- ranked rating, rank, provisional state, matches played;
- leaderboard entries;
- public lobby metadata:
  - lobby id/code only if intentionally joinable;
  - mode, visibility, status;
  - player count/max players;
  - host handle/display name where public;
  - readiness affordances (`canJoin`, `canStart`, blocker reason);
- completed match summaries:
  - match id;
  - mode/status;
  - participant handles/display names;
  - placement/outcome/final score/rating delta;
  - completed timestamp;
- static learn/rules/server health metadata.

### Private in preview

Never expose publicly:

- emails;
- access tokens, refresh tokens, cookies, authorization headers;
- password hashes, password reset state, password peppers;
- consent records and consent internals;
- private account status/role/admin notes;
- internal analytics payloads;
- raw request bodies/logs;
- hidden answer words for active/unfinished matches;
- answer hashes, answer salt refs, dictionary internals;
- raw guess text and hidden opponent guesses;
- private match report participant data;
- deployment secrets and database URLs.

### Conditional/role-limited data

- Current user may see their own email in `/auth/me` or account settings once real auth exists.
- Participants may see their own active guesses/state.
- Completed answer reveal is still a product decision; if added, derive only from safe completed report/share data, not active round authority.

## Deployment target assumptions for Wave L

Ticket 81 owns detailed deployment planning, but Ticket 80 locks these product/security assumptions.

Recommended free/cheap preview layout:

| Component | Preview assumption | Notes |
|---|---|---|
| Web | Vercel or another free static/Next host | Good fit for Next.js; no secrets in repo; use environment variables. |
| API | Render/Fly/Railway/free container host, or Vercel only if API shape is adapted | Current Nest API lacks a production `start` script/build artifact; Yuna should verify. |
| Postgres | Free/cheap managed Postgres or self-hosted preview DB | Must be isolated from local and future prod. Neon/Supabase/Render-style free tiers are plausible but need approval. |
| Redis | Avoid as hard dependency for Preview MVP if possible | Current readiness has Redis placeholder; ranked loop should not require managed Redis unless Ticket 81 approves. |
| Mobile | Expo dev/preview build, not store release | No app-store production claim in Wave L. |

No deployment, external service creation, production secrets, CD pipeline, or paid resource should be created without explicit Ashar approval.

## Required environment variables by tier

### Local

From current examples, keep placeholders only:

```text
APP_ENV=local
NODE_ENV=development
PORT=4000
PUBLIC_WEB_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:19006
DATABASE_URL=postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public
DATABASE_DIRECT_URL=postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public
REDIS_URL=redis://localhost:6379
AUTH_MODE=dev_stub
ENABLE_DEV_AUTH=true
ENABLE_DEV_ROUTES=true
COOKIE_SECURE=false
```

### Preview/staging

Use host secret stores; do not commit values:

```text
APP_ENV=preview
NODE_ENV=production
PORT=<provided-by-host-or-4000>
PUBLIC_WEB_URL=https://<preview-web-host>
API_BASE_URL=https://<preview-api-host>/api/v1
NEXT_PUBLIC_API_URL=https://<preview-api-host>
CORS_ALLOWED_ORIGINS=https://<preview-web-host>
DATABASE_URL=<preview-pooled-postgres-url>
DATABASE_DIRECT_URL=<preview-direct-postgres-url-if-needed>
AUTH_MODE=session_required
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
JWT_ACCESS_SECRET=<secret-if-token-auth-is-implemented>
REFRESH_TOKEN_PEPPER=<secret-if-refresh-token-auth-is-implemented>
PASSWORD_HASH_PEPPER=<secret-if-password-auth-is-implemented>
COOKIE_DOMAIN=<preview-domain-if-needed>
COOKIE_SECURE=true
CSRF_SECRET=<secret-if-cookie-session-or-form-posts-are-used>
SENTRY_DSN=<optional; leave empty unless approved>
OTEL_EXPORTER_OTLP_ENDPOINT=<optional; leave empty unless approved>
```

If no real login ships in Wave L, the secret set can be smaller, but the API must still reject current-user actions rather than fall back to stubs.

### Future production

Same shape as preview with production-specific values, stronger rotation/access control, real privacy docs, backups, and explicit production approval.

## Implementation guidance for Ticket 82

Freya should implement a tiny auth boundary before any product polishing depends on current user state:

1. Add a central environment/auth-mode helper.
2. Add a current-user resolver with two modes:
   - local/test `dev_stub`: returns fixture users and accepts `x-wordle-dev-user-id` only for known fixtures;
   - preview/prod `session_required`: validates real session if implemented; otherwise throws `not_authenticated`.
3. Refactor `/auth/me`, `/profiles/me/summary`, `/matches/history/me`, active match state, guess submission, profile update, and ranked start to use the resolver.
4. Disable `POST /auth/register` stub token return outside local/test.
5. Keep public read endpoints public: leaderboard, public profile summaries, public lobby discovery, completed result summaries if spoiler-safe.
6. Add tests for local fixture behavior and preview/prod unauthenticated behavior.
7. Do not implement social OAuth or email provider integration in Ticket 82.

## Implementation guidance for Ticket 81

Yuna should use this boundary when evaluating preview deploy readiness:

- Treat `APP_ENV=preview` + `AUTH_MODE=session_required` as the default preview assumption.
- Check whether API has a deployable `build` + `start` path; current API package only typechecks for `build` and has no production `start` script.
- Do not add CD or create hosting resources without approval.
- Keep Redis optional unless a Wave L feature proves it is required.
- Ensure `.env.example` remains placeholders only and documents preview variables without real values.
- Reconcile local API URL examples: root examples point API to port `4000`, while `apps/web/.env.local.example` and `apps/web/src/lib/api-client.ts` currently default to `3001`. Pick one local API port before preview docs become operator-facing.

## Non-goals for Wave L boundary

- Google/Apple/social login;
- magic-link email provider setup;
- paid SaaS analytics or auth provider;
- production launch;
- app-store mobile release;
- full account settings, password reset, deletion/export flows;
- broad product analytics implementation;
- production CD pipeline.

## Decision locks

1. **Preview must not silently impersonate the local stub user.**
2. **Local dev fixtures are preserved, but gated to local/test.**
3. **No social login for Wave L unless explicitly approved.**
4. **Public preview data is limited to public game identity and spoiler-safe competitive summaries.**
5. **Private data remains private: emails, tokens, consent internals, analytics payloads, active answers/hashes/salts, raw guesses, and deployment secrets.**
6. **Free/cheap deployment assumptions only; no external resource creation without approval.**
7. **If login is not ready, ship honest unauthenticated states instead of fake auth.**
