# Ticket 170 — Deterministic PostgreSQL Speed Timing Proof

Agent: Freya (backend test implementation)
Wave: T-Fix
Status: New

## Blocker

The current PostgreSQL harness rewrites reveal timestamps with Node time and accepts either draw or win, so it does not prove DB-authoritative bucket/deadline/ready races.

## Requirements

Add a guarded fresh-schema PostgreSQL test using controlled authoritative database event times—not Node receipt guesses—that deterministically proves:

1. Equal guesses, lower 100ms bucket wins.
2. Equal guesses, same bucket draws.
3. Fewer guesses beats a faster solve time.
4. Receipt exactly at deadline is accepted; post-edge is rejected without consuming an attempt.
5. Concurrent ready acknowledgements persist exactly one immutable reveal/deadline pair.
6. Client timestamps cannot alter any outcome.
7. Existing canonical Speed and Standard PostgreSQL suites remain green.

No production code change unless needed to provide a safe deterministic DB-clock seam that cannot be enabled in hosted runtime.
