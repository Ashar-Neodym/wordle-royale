# Ticket 89 — Preview MVP Account/Session Decision Lock Response

Task: Ticket 89 — Preview MVP Account/Session Decision Lock
Agent: Elisa (architect)
Status: Complete

## Summary

I locked the Preview MVP account/session decision for Wave M in:

- `docs/2026-07-03-preview-mvp-account-session-decision-lock.md`

Recommendation: **use Option 2 — explicit demo-code / fixture-session preview mode, implemented as a small server-issued preview demo session.**

This is deliberately not the same as local `dev_stub` behavior. Preview must still reject silent fixture impersonation, dev-header switching, and stub token registration. The demo-session path exists only so the first public preview can exercise the core competitive loop without taking on real email/password/OAuth account obligations.

## Decisions / Recommendations

1. **Recommended Preview MVP path: explicit preview demo session.**
   - Public read surfaces stay available without sign-in where spoiler-safe.
   - Current-user/write actions remain blocked by default in preview.
   - Ticket 92 may add an explicit `AUTH_MODE=preview_demo_session` or equivalent opt-in demo-session flag.
   - A visitor must explicitly start/join demo mode before becoming a current user.

2. **Fallback path: read-only preview.**
   - Keep current `AUTH_MODE=session_required` behavior.
   - All current-user/write actions return `not_authenticated`.
   - Acceptable only if Ticket 92 cannot safely implement demo sessions.

3. **Deferred path: first-party email/password accounts.**
   - Do not implement before the first public preview checkpoint.
   - It requires password hashing, secret handling, session revocation, CSRF/cookie policy, rate limits, account lifecycle decisions, and broader QA.

4. **Non-goals remain locked.**
   - No OAuth/social login.
   - No magic-link email provider.
   - No paid SaaS or external resource creation.
   - No real `.env` files or secrets.
   - No production account launch.
   - No weakening of spoiler safety or server authority.

## Detailed Output

The decision-lock doc compares all three requested options across:

- security/privacy obligations;
- data model impact;
- UX impact;
- test needs;
- suitability before the first public preview.

Key conclusion by option:

| Option | Decision |
|---|---|
| Read-only public preview with local-only gameplay writes | Safe fallback, but too weak as target Preview MVP because it cannot validate gameplay writes publicly. |
| Invite/demo-code or fixture-session preview mode | Recommended. Best balance of product value and security scope. |
| Minimal first-party email/password/session implementation | Defer. Too broad for Wave M deploy-shape unblock. |

## Ticket 92 scope lock

Ticket 92 **is allowed to implement auth only as an explicit preview demo-session slice**.

Ticket 92 may implement:

- `AUTH_MODE=preview_demo_session`, or `AUTH_MODE=session_required` plus an explicit `ENABLE_PREVIEW_DEMO_SESSIONS=true` flag;
- a centralized session resolver path inside `CurrentUserService`;
- one explicit demo-session creation endpoint, such as `POST /auth/preview-demo/start`;
- short-lived demo sessions, preferably via HTTP-only secure cookie if feasible;
- generated demo user/profile records in the isolated preview DB;
- tests for unauthenticated preview, valid demo session, expired/invalid demo session, local dev-stub preservation, disabled dev helpers, and no stub-token registration.

Ticket 92 must not implement:

- real email/password auth;
- password hashing/pepper secrets;
- OAuth/social login;
- magic-link email;
- account recovery/deletion/export/admin workflows;
- provider secrets, paid resources, deployment actions, or real `.env` files;
- silent fallback to `player_one` or any local fixture user;
- `x-wordle-dev-user-id` support in preview/demo modes;
- stub access/refresh token issuance in preview/demo modes.

Ticket 92 should block instead of implementing if the work cannot remain centralized, tested, and isolated from local `dev_stub` behavior.

## Open Questions

None blocking for Ticket 89.

Implementation details intentionally left for Ticket 92 to decide after inspecting schema/code:

- whether demo sessions use a small persistent `PreviewSession` table or a narrower non-durable mechanism;
- whether the first slice can use HTTP-only cookies immediately or needs a documented temporary preview-only session header for smoke testing;
- exact demo-code UX copy and route naming.

## Follow-up Tickets

### Follow-up Ticket 1

- **Target agent:** Freya / Ticket 92
- **Task:** Implement the minimal explicit preview demo-session slice, or block with evidence if the slice exceeds safe scope.
- **Inputs:** `docs/2026-07-03-preview-mvp-account-session-decision-lock.md`, `apps/api/src/auth/current-user.service.ts`, `apps/api/src/auth/auth.controller.ts`, API tests.
- **Expected output:** Centralized API/session implementation and tests; no local stub leakage in preview.

### Follow-up Ticket 2

- **Target agent:** Luna / Ticket 93
- **Task:** Add web preview UX states for explicit demo sessions.
- **Expected output:** No fake signed-in state before demo start; clear preview/demo labels; no session/private/spoiler leaks.

### Follow-up Ticket 3

- **Target agent:** Yuna / Tickets 90–91/95
- **Task:** Use `AUTH_MODE=preview_demo_session` if Ticket 92 lands; otherwise fall back to `AUTH_MODE=session_required` for deploy-shape checks.
- **Expected output:** Build/start smoke and preview env checks without external deployment or secrets.

### Follow-up Ticket 4

- **Target agent:** Jasmine / Ticket 96
- **Task:** Verify no silent fixture impersonation, no dev-header bypass, no stub tokens, explicit demo labeling, invalid/expired session fail-closed behavior, and no private/spoiler/session leaks.

## Files Changed

- `docs/2026-07-03-preview-mvp-account-session-decision-lock.md`
- `agent-communication/responses/ticket-89-elisa-preview-mvp-account-session-decision-response.md`

No source code, package files, env files, migrations, deployment config, secrets, or external resources were changed.

## Tests / Commands Run

Inspection performed:

- `agent-communication/tickets/ticket-89-elisa-preview-mvp-account-session-decision.md`
- `agent-communication/index.md`
- `docs/2026-07-03-athena-review-after-ticket-87.md`
- `docs/2026-07-03-preview-mvp-auth-account-deployment-boundary.md`
- `agent-communication/responses/ticket-80-elisa-preview-mvp-auth-deployment-boundary-response.md`
- `agent-communication/responses/ticket-82-freya-preview-session-current-user-slice-response.md`
- `agent-communication/responses/ticket-87-jasmine-qa-review-wave-l-preview-readiness-response.md`
- `agent-communication/responses/ticket-88-yuna-wave-l-pr-ci-unblock-remote-checkpoint-response.md`
- `apps/api/src/auth/current-user.service.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/package.json`
- root `package.json`

Verification commands:

```bash
date +%F
git diff --check
pnpm secret-scan
```

Observed output:

```text
# date +%F
2026-07-03

# git diff --check
<no output; exit 0>

# pnpm secret-scan
$ node scripts/secret-scan.mjs
Secret scan passed (187 source/config files scanned).
Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.
```

Note: `pnpm secret-scan` excludes `docs` and `agent-communication`, so it does not scan the two Markdown files added by this ticket. I also manually kept the new docs free of real secrets, tokens, provider keys, and `.env` values.

## Evidence / Result

Acceptance criteria status:

- **Write one decision-lock doc under `docs/`:** complete.
- **Clearly state recommended Preview MVP path and non-goals:** complete; recommended path is explicit preview demo-session, with read-only fallback and email/password deferred.
- **Define what Ticket 92 may implement:** complete; Ticket 92 may implement only a minimal explicit preview demo-session slice and must not implement full auth.
- **No provider secrets, OAuth, paid services, or deployment actions:** complete; docs-only changes, no external side effects.

## Risks / Blockers

### Blockers

None for Ticket 89.

### Risks / warnings

1. **Demo-session scope creep:** Ticket 92 must not turn into full account auth.
2. **Cookie/session hardening:** If HTTP-only cookie support is not feasible in Ticket 92, any temporary preview-only header must be documented as non-public-deployment-ready.
3. **Abuse controls:** Demo sessions need simple bounded controls before public exposure, even without real accounts.
4. **Secret scan limitation:** repository secret scan excludes docs and `agent-communication`, including this ticket's Markdown artifacts.
5. **Deploy-shape blocker remains separate:** Ticket 90/91 still need to resolve API production build/start smoke before public preview deployment approval.
