# Ticket 228 — Precompiled Hosted Speed Smoke Harness

Agent: Ruby (tooling implementation)
Status: Ready

## Goal

Prevent another hosted invitation timeout caused by reconstructing the manual flow after match creation.

## Scope

Create a reusable repository script for the approved hosted Speed smoke workflow, but do **not** run it against hosted systems under this ticket.

The harness must:

1. load credentials only from caller environment and never print cookies/tokens/answers/hashes/salts;
2. complete deployment/readiness/catalog preflight before creating sessions or queue tickets;
3. create exactly two controlled demo sessions and pair exactly once;
4. extract `matchedMatchId` from the committed contract;
5. dispatch both ready acknowledgements immediately and concurrently, recording monotonic dispatch skew and sanitized HTTP status/duration;
6. use unique operation IDs and recover uncertain outcomes by operation ID/current state without blind retries;
7. preserve one immutable firstAck/deadline/start identity;
8. support reconnect, controlled settlement, rating/history/profile/leaderboard checks, Standard isolation, spoiler scan, and product-supported cleanup;
9. stop safely on any identity mismatch or non-2xx ready response;
10. emit one sanitized JSON evidence object suitable for a response artifact.

## Verification

Add local deterministic/mock tests for:

- `[201,201]` concurrent ready;
- one request timeout followed by operation-ID recovery;
- 500/201 safe stop;
- invitation deadline budget assertion;
- no secret/answer fields in emitted evidence;
- exactly one match lifecycle and no blind retry.

Run lint/typecheck/tests/security/diff checks. Do not access Railway/Vercel/hosted API/hosted DB and do not create a PR yet.
