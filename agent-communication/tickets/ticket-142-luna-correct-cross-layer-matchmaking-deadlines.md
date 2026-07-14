# Ticket 142 — Correct Cross-Layer Matchmaking Deadlines

Agent: Luna (web implementation)
Wave: R-Hosted-Timeout-Recheck
Status: New

## Blocker

Current ordering is proxy `125s`, browser `127s`, server action `130s`. The browser can abandon a legitimate action before the declared server-action lifetime.

## Requirements

1. Define/document a coherent ordering where the browser deadline is later than the complete server-action maximum by a meaningful overhead margin, or shorten the server-action maximum and guarantee a recoverable server result before the browser deadline.
2. Preserve bounded behavior; do not create an unbounded browser wait.
3. Prefer shared exported constants or one testable policy module rather than duplicated magic numbers.
4. Add a direct cross-layer assertion covering API proxy, server-action maximum, and browser deadline ordering/margins.
5. Verify join, reconnect, current-ticket, and cancel flows all use the intended deadline.
6. Run queue-state tests, web typecheck/build, workspace validation, secret scan, and diff check.

No hosted/provider mutation.
