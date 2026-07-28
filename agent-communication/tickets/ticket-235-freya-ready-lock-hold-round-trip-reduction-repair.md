# Ticket 235 — Ready Lock-Hold Round-Trip Reduction Repair

Agent: Freya
Status: Ready
Dependency: Ticket 234 PASS diagnosis

## Goal

Repair the hosted simultaneous-ready 503/201 failure by reducing transaction lock-hold round trips without changing provider/environment timeouts or safety semantics.

## Required implementation

- Preserve dedicated `Match FOR UPDATE` as the first contended lock.
- Replace separate round and ordered participant lock/hydration reads with one narrowly typed ordered query after the match lock.
- Preserve Serializable isolation, match-first canonical ordering, exactly one round, exactly two ordered participants, viewer membership, B1 already-ready precedence, B2 receipt-aware recovery, unique receipt/cardinality semantics, rollback behavior, and Standard isolation.
- Do not increase transaction timeout as the primary fix and do not weaken fail-closed behavior.
- Add structured timeout/error evidence where safe so future 503s identify application/transaction failure class without secrets.

## Tests

- Expand hosted-latency PostgreSQL simultaneous-ready coverage at fixed 300/400/500ms proxy latency and effective 5–6s timeout pressure.
- All cases must return `[201,201]`, persist two ready participants and two unique receipts, establish one immutable first-ack ready window and one immutable start/deadline, and produce zero rating mutations before settlement.
- Preserve rollback matrix, replay/B1/B2, malformed cardinality, projection failure, timing, lifecycle races, full API, typecheck, build/security/diff gates.

## Constraints

Local code/tests only in `/tmp/wordle-ticket181-rerun-1d8ef`; no network, hosted/provider/GitHub, env/lifecycle/config changes, commit, push, PR, or deployment. Preserve uncommitted accepted harness files.
