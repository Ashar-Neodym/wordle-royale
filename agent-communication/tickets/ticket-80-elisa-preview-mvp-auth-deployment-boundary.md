# Ticket 80 — Preview MVP Auth, Account, and Deployment Boundary

Assigned agent: Elisa
Priority: Critical
Wave: L — Public-preview readiness
Dependencies: Wave K merged to main
Parallelization: L.0 parallel with Ticket 81
Human action needed: Optional. If product choices are ambiguous, present options and recommendation; do not block on Ashar unless needed.

## Context

Use the current working tree at:

`/home/ashar/Desktop/hermes-projects/wordle-royale`

Read first:

- `docs/2026-07-01-athena-review-after-wave-k-merge.md`
- `docs/2026-07-01-product-navigation-route-contracts-v2.md`
- `docs/2026-07-01-privacy-safe-product-analytics-event-taxonomy.md`
- current README/env examples

Wave K is merged. The product now has real profile/history/match/lobby surfaces, but auth is still stubbed/dev-oriented and deployment target/secrets policy is not locked.

## Task

Define the Preview MVP boundary for auth/account/deployment so implementation can proceed safely.

## Deliverables

1. Recommend Preview MVP auth/account approach:
   - keep local dev stub behavior,
   - define production/preview behavior,
   - avoid overbuilding social login unless justified.
2. Define environment tiers:
   - local,
   - preview/staging,
   - future production.
3. Define what data may be public in preview: handles, ratings, match summaries, lobby metadata.
4. Define what must remain private: emails, tokens, consent internals, hidden answers/hashes/salts, internal analytics payloads.
5. Recommend deployment target assumptions for Wave L, with free/cheap preference.
6. Produce a concise decision-lock doc under `docs/`.

## Verification

Planning/spec ticket. If only docs change, run:

```bash
git diff --check
```

If source/config changes are made, additionally run relevant build/tests and secret scan.

## Response path

`agent-communication/responses/ticket-80-elisa-preview-mvp-auth-deployment-boundary-response.md`

Do not answer only in chat. Write the Markdown response file.
