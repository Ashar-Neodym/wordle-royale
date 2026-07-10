# Ticket 121 — QA Review Wave Q Follow-Up and Hosted Preview

Agent: Jasmine (QA)
Wave: Q — Wave P QA follow-up and deploy hardening
Status: New after Tickets 116–120

## Task

Independently QA Wave Q fixes, local gates, and hosted preview deployment.

## Scope

- Verify Ticket 116 UI warnings are resolved:
  - no fake rating-looking values for non-live mode cards;
  - Standard card uses backend rating counters.
- Verify Ticket 117 readiness hardening works and preserves Redis-optional behavior.
- Verify Ticket 118/120 migration policy/deploy evidence is sufficient.
- Verify hosted preview updated surfaces:
  - `/ranked/modes` if backend route is merged/deployed;
  - demo session start;
  - lobbies/leaderboard/profile/play pages.
- Identify blockers vs warnings.

## Verification commands

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:local
CI=true pnpm secret-scan
git diff --check
```

## Acceptance criteria

- Provides PASS/FAIL/WARN verdict.
- Separates merge/deploy blockers from polish warnings.
- Includes hosted URL/API smoke evidence.
- Confirms no secrets committed.

## Output

Write response to:

`agent-communication/responses/ticket-121-jasmine-qa-review-wave-q-follow-up-hosted-preview-response.md`
