# Ticket 176 — Hosted Speed Ready Lifecycle Contract

Agent: Elisa (architecture/product contract)
Wave: U — Hosted Speed Ready Reliability
Status: Complete — technical contract delivered; 90-second invitation/first-ready timing approval required

## Problem

The current 20-second ready deadline starts at match creation. Hosted concurrent joins took up to 17.760 seconds to return and ready mutations took 8.391–18.894 seconds, so clients can receive an already-impractical deadline. Simultaneous ready requests reproduced one `201` plus one `409 ready_deadline_passed`.

## Goal

Define a server-authoritative lifecycle that separates match invitation/delivery from the approved two-player ready phase and remains finite, abuse-resistant, idempotent, and testable under hosted latency.

## Required decisions

1. Define a finite pre-ready invitation/acceptance expiry beginning at match creation.
2. Define exactly when the existing 20-second ready window starts—recommended: first valid ready acknowledgement—without allowing indefinite orphan matches.
3. Specify transitions for zero ready, one ready, both ready, cancellation, reconnect, invitation expiry, ready expiry, and late requests.
4. Lock immutable timestamps and which may be absent before first ready.
5. Define ready operation transaction/request/recovery budgets and ordering across API proxy, server action, and browser.
6. Preserve stable operation IDs, no automatic mutation replay, authoritative recovery reads, countdown 3s, round 75s, and 100ms tiebreak.
7. Preserve Standard isolation, generation-fenced health, exactly-once no-contest/settlement, and spoiler safety.
8. Recommend exact pre-ready expiry and web/API budgets with rationale.
9. Identify migration/compatibility implications for existing preview-only Speed rows.

Return an explicit approval block if any user-facing timing value or meaning changes. No implementation or hosted mutation.
