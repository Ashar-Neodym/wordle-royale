# Ticket 97 — Controlled Preview Deployment Scope Decision Lock

Agent: Elisa (architecture/product)
Wave: N — Controlled public preview setup
Status: New

## Context

Wave M is merged to `main` via PR #3. Post-merge `main` CI passed.

Wave M delivered:
- explicit preview demo sessions;
- API production build/start smoke;
- CI deploy-shape smoke;
- web preview demo UX;
- documented mobile physical-smoke caveat.

Jasmine's Ticket 96 verdict: `PASS WITH WARNINGS / APPROVE CONTROLLED WAVE N PREVIEW DEPLOYMENT WORK`.

Warnings still visible:
- hosted preview environment is not validated yet;
- preview demo sessions are in-memory/non-durable and not real auth;
- physical Expo Go visual smoke remains deferred;
- API build uses pragmatic monorepo dist shims.

## Task

Decide the exact controlled public-preview deployment scope for Wave N before any provider resources or secrets are touched.

## Required decisions

1. What is in scope for the first public preview?
   - Web only?
   - Web + API?
   - Mobile Expo Go smoke only, or public mobile preview claim?
2. What user-facing caveats must appear?
   - demo sessions reset;
   - no durable accounts;
   - preview data may reset;
   - mobile physical check status.
3. What deployment/provider route should Yuna plan around, preferring free/cheap/open-source options?
4. What is explicitly out of scope?
5. What must be true before Athena asks Ashar to approve actual deployment/provisioning?

## Constraints

- Do not deploy.
- Do not create provider resources.
- Do not add secrets.
- Do not change code unless it is documentation-only and necessary for the decision.
- Keep the decision short and implementable.

## Acceptance criteria

- Produces a decision lock with in-scope/out-of-scope preview boundaries.
- Names the recommended provider/deploy route or comparison decision Yuna should use.
- Lists required user-facing caveats.
- Lists approval gates before real deployment/provisioning.

## Response file

Write your response to:

`agent-communication/responses/ticket-97-elisa-controlled-preview-deployment-scope-decision-response.md`
