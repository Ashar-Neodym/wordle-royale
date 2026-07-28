# Ticket 230 — Hosted Smoke Contract-Realism Repair

Agent: Ruby
Status: Ready

Close Ticket 229 recheck blockers without hosted/network access:

1. Replace broad `/guess|hash|salt|answer/` key rejection with an explicit forbidden answer-authority/secret field policy. Legitimate committed public fields such as `maxGuesses`, `acceptedGuesses`, `guess`, `guessNumber`, `guessesUsed`, and `acceptedGuessCount` must be accepted. Mandatory real catalog/snapshot shapes must appear in the GREEN fixture.
2. Do not require remaining invitation/countdown time to equal the full configured duration. Prove expiration is future and has enough request+recovery budget; verify configured identity durations from stable timestamp pairs (firstAck→readyDeadline, startsAt→roundDeadline) within contract tolerance.
3. Allow the first ready result to be `waiting_opponent_ready` without start/round fields. Merge both concurrent outcomes plus bounded current-state recovery and require one authoritative post-both-ready snapshot with both participants ready and immutable start/deadline identity.
4. Add independent RED tests for ready-window mismatch, countdown/round mismatch, immutable identity mismatch, duplicate cookie, duplicate handle/user, split match identity, and mandatory real public fields/spoiler policy.

Preserve strict runtime schemas, convergence/cleanup/Standard isolation, no blind retries, confirmation guard, one lifecycle, and sanitized evidence. Run focused tests, syntax, lint, typecheck, security, and diff checks. No env/network/hosted/provider/GitHub/commit/push/PR.
