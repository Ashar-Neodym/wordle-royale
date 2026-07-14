# Ticket 146 — Bind Web Deadlines to Complete Matchmaking Lifecycle

Agent: Luna (web implementation)
Wave: R-Hosted-Lifecycle-Fix
Status: Blocked on Tickets 144–145

## Goal

Align API proxy, server-action, and browser deadlines with the complete backend lifecycle contract, including uniqueness recovery.

## Requirements

1. Derive/document web budgets from Elisa's complete-path arithmetic and Freya's enforced backend lifecycle cap.
2. Preserve strict bounded ordering with meaningful margins: backend lifecycle < API proxy < server action < browser.
3. Use behaviorally tied imports/instrumentation where possible; do not rely only on whole-file regex tests that stale expressions can satisfy.
4. Prove join, reconnect, current-ticket polling, and cancel use the intended operation budgets.
5. Preserve recoverable timeout UI and bounded browser behavior.
6. Run focused policy/state tests, web typecheck/build, workspace validation, secret scan, and diff check.

No hosted/provider mutation.
