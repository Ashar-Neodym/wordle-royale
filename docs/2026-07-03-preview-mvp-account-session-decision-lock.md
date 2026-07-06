# Preview MVP account/session decision lock — Wave M

Date: 2026-07-03
Owner: Elisa
Ticket: 89 — Preview MVP Account/Session Decision Lock
Inputs: Ticket 80 boundary, Ticket 82 current-user slice, Ticket 87 QA review, Athena Wave M direction

## Executive decision

**Recommended Preview MVP path: Option 2 — explicit demo-code / fixture-session preview mode, implemented as a small server-issued preview demo session.**

Do **not** ship a silent local stub user in preview. Do **not** implement full first-party email/password accounts before the first public preview. Do **not** make the first public preview purely read-only unless implementation capacity or security review blocks the demo-session slice.

The Preview MVP should use this posture:

1. Public read surfaces remain available without sign-in where already spoiler-safe: leaderboard, public player summaries, public lobby discovery, completed result summaries, rules/learn/static pages.
2. Current-user and write actions remain blocked by default in `APP_ENV=preview` + `AUTH_MODE=session_required`.
3. Ticket 92 may add an explicit `AUTH_MODE=preview_demo_session` or equivalent opt-in mode that creates short-lived, non-production demo sessions for preview gameplay only.
4. Demo sessions must be visibly labeled in UI and data. They are not real accounts, are not portable to production, and must not collect passwords or verified email identity.
5. Minimal first-party email/password auth is deferred until after the first preview deploy-shape checkpoint unless Ashar explicitly approves a larger account/security scope.

This preserves Ticket 80's safety boundary while avoiding a preview that cannot exercise the core ranked gameplay loop.

## Option comparison

| Option | Description | Recommendation before first public preview |
|---|---|---|
| 1. Read-only public preview + local-only gameplay writes | Public visitors can browse safe pages, but all gameplay/current-user writes return `not_authenticated`; local/test remains `dev_stub`. | Safe fallback, but too weak as the target Preview MVP because it does not prove the competitive loop under public-preview conditions. |
| 2. Invite/demo-code or fixture-session preview mode | Visitors enter a demo/invite code or click a demo action to receive an explicit preview-only session; writes are allowed only inside isolated demo identity constraints. | **Recommended.** Gives public preview enough interactivity while avoiding provider secrets, passwords, OAuth, and silent local fixture impersonation. |
| 3. Minimal first-party email/password/session implementation | Real account registration/login with password hashing, session cookies/tokens, CSRF/cookie policy, account lifecycle, and persistence. | Defer. Appropriate soon, but too much security/product surface for the first deploy-shape unblock. |

## Option 1 — read-only public preview with local-only gameplay writes

### Security/privacy obligations

- Keep current Ticket 82 behavior for preview:
  - `APP_ENV=preview`
  - `AUTH_MODE=session_required`
  - `ENABLE_DEV_AUTH=false`
  - `ENABLE_DEV_ROUTES=false`
- `/auth/me`, `/profiles/me/summary`, `/matches/history/me`, lobby writes, ranked starts, guesses, completion endpoints, profile updates, and registration return `401 not_authenticated` unless a real session mode is later enabled.
- Public endpoints must remain spoiler-safe and private-data safe:
  - no emails;
  - no tokens/cookies;
  - no active answers/hashes/salts;
  - no raw guesses or hidden opponent state;
  - no internal analytics payloads.

### Data model impact

- No new account/session tables required.
- Existing fixture users remain local/test only.
- Preview database may contain seeded/public read models, public lobbies, leaderboard/rating examples, and completed spoiler-safe summaries only.

### UX impact

- Lowest implementation risk.
- Visitors can understand the product but cannot truly play a ranked or lobby flow on preview.
- Web/mobile must show honest login-required states for current-user surfaces.
- Good for marketing/docs preview; weak for validating Wordle Royale's core competitive loop.

### Test needs

- Existing Ticket 82/87 tests remain the gate:
  - dev header ignored/rejected in preview;
  - current-user/write routes return `not_authenticated`;
  - public read endpoints do not leak private/spoiler data;
  - secret scan and diff hygiene pass.

### Suitability before first public preview

**Acceptable fallback only.** Use this if Ticket 92 cannot safely implement demo sessions in time. It is not the preferred MVP because it does not let Ashar or early testers exercise gameplay writes outside local dev.

## Option 2 — invite/demo-code or fixture-session preview mode

### Decision shape

Recommended implementation model:

```text
APP_ENV=preview
AUTH_MODE=preview_demo_session
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

`preview_demo_session` is intentionally different from local `dev_stub`:

- no `x-wordle-dev-user-id` switching;
- no automatic `player_one` impersonation;
- no stub access/refresh tokens returned by `/auth/register`;
- no dev reset/terminalize helpers;
- no real password or OAuth provider;
- no claim that demo users are production accounts.

A visitor explicitly starts or joins preview gameplay through a demo affordance, such as:

- entering a configured demo/invite code;
- clicking "Start preview demo";
- joining a public demo lobby link whose server-side policy allows demo sessions.

The API then issues a short-lived server-recognized session identity for that browser/device. The session is scoped to preview and may create/update only demo-safe player records.

### Security/privacy obligations

Ticket 92 must treat demo sessions as public-preview credentials, not local stubs:

- **Explicit opt-in:** no current user exists until the visitor starts/joins demo mode.
- **No silent fixture impersonation:** never map every anonymous visitor to `player_one`.
- **Short-lived session:** use an HTTP-only secure cookie where feasible, or an explicitly named preview session header only for local smoke if cookie plumbing is too large. Do not mint production-looking access/refresh tokens.
- **Demo identity constraints:** generated handle/display name must be demo-labeled by default, e.g. `demo-player-abc123`; allow lightweight handle customization only if validation already exists.
- **No private identity collection:** do not collect passwords, verified emails, phone numbers, OAuth profile data, or payment data.
- **Isolated preview data:** preview demo records live only in the preview database; never reuse local or future production DBs.
- **Public-data limits still apply:** public pages may expose demo handles/ratings/results, but never active answer material or session identifiers.
- **Abuse controls:** keep demo creation constrained by simple free controls: fixed demo code, per-session TTL, bounded lobby/player creation, and server validation. Do not add paid anti-abuse tooling.
- **Clear UX labeling:** UI must show that this is a preview/demo session and not a durable production account.

### Data model impact

Prefer the smallest additive model. Ticket 92 should first check the current Prisma schema and reuse existing `User`/`Profile`/rating structures if they exist, but must avoid overloading local fixture IDs as preview users.

Allowed minimal additions if needed:

```text
PreviewSession
- id: uuid
- sessionTokenHash: string        # hash only; never store raw token
- userId: uuid                    # points to demo user/player row
- mode: 'preview_demo'
- createdAt: timestamp
- expiresAt: timestamp
- revokedAt: timestamp | null
- lastSeenAt: timestamp | null
```

Optional user/profile markers if not already available:

```text
User.accountKind: 'fixture' | 'preview_demo' | 'registered'
Profile.isDemo: boolean
```

If schema changes would become broad, Ticket 92 may avoid persistent sessions and use an in-memory or signed-cookie demo identity only for local preview smoke, but that must be documented as non-durable and not production-ready.

### UX impact

- Best preview value: testers can create/join lobbies and play ranked/demo flows without creating real accounts.
- UI copy must be honest:
  - "Preview demo session"
  - "Progress may reset"
  - "Not a permanent account"
  - "No password or email required"
- Profile/history pages can show demo-owned state only after a demo session exists.
- Auth-required empty states remain for users who have not started a demo session.
- Result sharing remains spoiler-safe and should not expose session IDs or invite secrets.

### Test needs

Ticket 92 should add focused tests before web polish depends on it:

1. Preview without demo session:
   - `/auth/me` returns `not_authenticated`.
   - current-user/write routes return `not_authenticated`.
   - dev header still does not work.
2. Preview with demo session:
   - explicit demo start/join creates a demo-scoped current user.
   - `/auth/me` returns the demo user with no email by default.
   - lobby create/join and ranked start work only for the demo current user.
   - session cookie/header is not present in public read responses.
3. Local/test:
   - existing `AUTH_MODE=dev_stub` fixture behavior still passes.
4. Negative/security:
   - invalid/expired demo session returns `not_authenticated`.
   - `POST /auth/register` does not emit stub tokens in preview modes.
   - dev helper routes remain disabled.
   - public endpoints do not leak email, token, cookie, answer/hash/salt, or raw guess data.

### Suitability before first public preview

**Recommended.** This is the smallest path that gives the public preview real product value while honoring the no-secrets/no-OAuth/no-fake-production-auth constraints.

## Option 3 — minimal first-party email/password/session implementation

### Security/privacy obligations

A real account system requires all of the following before it is safe to expose publicly:

- password hashing with approved algorithm/library and parameters;
- password pepper/secret management through host secret store;
- session token generation, hashing/storage, rotation, expiry, and revocation;
- HTTP-only secure cookie policy or equivalent bearer-token policy;
- CSRF policy if cookies are used;
- registration/login/logout/account-me endpoints;
- rate limits or equivalent abuse throttling for registration/login;
- duplicate email handling without account enumeration leaks;
- email normalization and privacy policy decisions;
- account deletion/export/reset roadmap or explicit preview limitation;
- tests for all positive and negative flows;
- operator docs for secret rotation and preview DB isolation.

### Data model impact

Likely additions/changes:

```text
User.email
User.passwordHash
User.passwordUpdatedAt
User.status
Session/RefreshToken
PasswordResetToken (if reset is included; otherwise login support is incomplete)
Audit/security event rows (optional but desirable)
```

This also pressures UI, mobile, contracts, validation, privacy copy, environment docs, and QA scope.

### UX impact

- Strongest production-like path.
- But before first preview, it introduces signup friction and security expectations that the project is not yet ready to support fully.
- Password reset/account recovery would be expected by real users; omitting it is acceptable for closed testing but risky for public preview messaging.

### Test needs

At minimum:

- registration/login/logout/session refresh/current user;
- password validation and hashing behavior;
- invalid credentials, duplicate email, expired/revoked session;
- cookie flags/CSRF policy;
- no email/token leaks through public endpoints;
- migration tests and preview built-start smoke;
- secret scan and env-template checks.

### Suitability before first public preview

**Defer.** This is appropriate for a later Wave N-style account foundation, not the current Wave M checkpoint unblock. It is larger than Ticket 92 should absorb unless Ashar explicitly changes the goal from preview deploy-shape to real account launch.

## Ticket 92 implementation allowance

Ticket 92 **is allowed to implement a minimal explicit preview demo-session slice** if it stays inside these boundaries.

### Ticket 92 may implement

- Add a third auth mode named `preview_demo_session`, or an equivalently explicit config such as `AUTH_MODE=session_required` plus `ENABLE_PREVIEW_DEMO_SESSIONS=true`. Prefer a distinct mode for readability if it does not create config sprawl.
- Add a central session resolver path inside `CurrentUserService` rather than adding per-controller auth branches.
- Add one explicit demo-session creation endpoint, for example:
  - `POST /auth/preview-demo/start`
  - body may include a demo code if configured by placeholder env name, but no real secret value in repo.
  - response uses the shared envelope and returns only safe current-user/profile fields.
- Use a short-lived HTTP-only cookie for the demo session if feasible in the current Nest setup. If not feasible in Ticket 92, use a narrowly named preview-only session header for smoke tests and document that cookie hardening remains before public deployment.
- Create demo-scoped user/profile records in the preview DB with generated handles/display names.
- Permit current-user gameplay/lobby/profile/history actions for the resolved demo session only.
- Add tests covering unauthenticated preview, valid demo session, invalid/expired demo session, local dev-stub preservation, disabled dev helpers, and no stub-token registration.

### Ticket 92 must not implement

- Google/Apple/OAuth/social login.
- Magic-link email or email provider setup.
- Real email/password registration/login.
- Password hashing/pepper secrets unless the ticket is explicitly rescopied by Ashar.
- Production account recovery, deletion, export, or admin workflows.
- Paid SaaS, deployment, external service creation, or real `.env` files.
- Silent fallback from missing session to local fixture user.
- Use of `x-wordle-dev-user-id` in preview/demo modes.
- Returning `stub-access-token-not-for-production` or `stub-refresh-token-not-for-production` in preview/demo modes.

### Ticket 92 should block instead of implementing if

- It cannot keep local `dev_stub` and preview demo behavior isolated in one central resolver.
- It needs real provider secrets, paid resources, or deployment credentials.
- It would expose active answer/hash/salt/raw-guess data through public endpoints.
- It cannot add tests proving dev headers and stub tokens stay disabled in preview.
- It requires broad account lifecycle work beyond a short-lived demo identity.

## Non-goals locked for Wave M Preview MVP

- Production account launch.
- Real email/password auth.
- OAuth/social login.
- Magic-link email.
- Password reset/recovery.
- Durable cross-device account linking.
- Account deletion/export/privacy center.
- Paid auth/analytics/anti-abuse providers.
- Public deployment or external resource creation without explicit Ashar approval.
- Any weakening of spoiler safety or server authority for gameplay/rating logic.

## Handoff by agent

### Freya / Ticket 92

Implement only the explicit preview demo-session slice described above, or block with evidence if it exceeds safe scope. Keep all logic centralized in auth/current-user/session services. Add API tests first.

### Luna / Ticket 93

Treat demo sessions as an explicit preview state:

- no fake signed-in UI before demo start;
- show "preview demo" labels;
- keep login-required states for users without a demo session;
- never expose session IDs, private identity, or spoiler material.

### Yuna / Tickets 90–91/95

Deploy-shape work should assume:

```text
APP_ENV=preview
AUTH_MODE=preview_demo_session   # if Ticket 92 lands
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

If Ticket 92 does not land, fall back to:

```text
APP_ENV=preview
AUTH_MODE=session_required
ENABLE_DEV_AUTH=false
ENABLE_DEV_ROUTES=false
COOKIE_SECURE=true
```

No external resources, secrets, CD, or deployment actions without Ashar approval.

### Jasmine / Ticket 96

QA must specifically verify:

- no silent fixture impersonation;
- no dev-header bypass;
- no stub token issuance;
- demo sessions are explicit and labeled;
- invalid/expired demo session fails closed;
- public endpoints leak no private/spoiler/session data;
- built API start/deploy-shape smoke passes if Tickets 90–91 land.

## Final decision locks

1. **Recommended first public preview path:** explicit preview demo session.
2. **Fallback path:** read-only public preview with all current-user/write actions gated.
3. **Deferred path:** real email/password accounts.
4. **Ticket 92 is allowed to implement auth only as preview demo-session, not full account auth.**
5. **No local stub impersonation, dev header switching, or stub token registration in preview.**
6. **No provider secrets, OAuth, paid services, deployment, or real `.env` files.**
7. **Server authority and spoiler safety remain non-negotiable.**
