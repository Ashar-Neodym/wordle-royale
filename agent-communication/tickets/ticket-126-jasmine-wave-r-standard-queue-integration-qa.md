# Ticket 126 — Wave R Standard Queue Integration QA

Agent: Jasmine (QA)
Wave: R — Live Standard 1v1 Matchmaking
Status: New after Tickets 122–125

## Task

Independently verify the local Wave R implementation before checkpoint PR creation.

## Required coverage

- Contract and migration review.
- Two-user queue join and atomic pairing into one match.
- No self-match, duplicate pairing, or duplicate rating settlement.
- Queue cancel/reconnect/stale behavior.
- Standard result and rating delta for win/loss/draw/abandon.
- Speed/Classic/Multiplayer remain non-live and honest in UI/API.
- Browser queue states and console errors.
- Secret/env/generated-file safety.

## Required gates

```bash
CI=true pnpm lint
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm build
CI=true pnpm smoke:api:prod-start
CI=true pnpm smoke:local
CI=true pnpm deps:check
CI=true pnpm secret-scan
git diff --check
```

## Output

Return PASS/WARN/FAIL with blocker severity, exact commands, concurrency/rating evidence, and owner-specific fixes. Do not merge, push, deploy, or mutate provider resources.
