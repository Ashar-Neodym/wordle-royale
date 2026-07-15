# Ticket 148 — Hosted Server-Read Reliability and Retry UX

Agent: Luna (web implementation)
Wave: S — Hosted Reliability Polish
Status: New

## Goal

Remove the overly aggressive generic 1.2-second timeout behavior observed by Ticket 129 for safe server-rendered reads while preserving truthful fallback states and bounded operation-specific mutation deadlines.

## Requirements

1. Inventory generic read call sites used by `/play`, `/profile`, leaderboard, current-user, and current-ticket server rendering.
2. Define one hosted-appropriate bounded read timeout/retry policy for idempotent GET/read operations only.
3. Never automatically retry mutations such as queue join, cancel, gameplay submission, or completion.
4. Add a clear user-visible retry/reload action where profile/leaderboard/queue-read fallback is shown.
5. Avoid mixing fixture-looking content with live timeout states without explicit labeling.
6. Preserve the 90/95/100/110-second matchmaking lifecycle policy.
7. Add behavioral tests for delayed-success read, exhausted read, truthful fallback, user retry, and no mutation retry.
8. Run web tests/typecheck/build, workspace gates, secret scan, and diff check.

No provider or hosted mutation.
