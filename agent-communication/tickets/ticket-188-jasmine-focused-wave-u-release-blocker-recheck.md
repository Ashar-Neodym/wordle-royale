# Ticket 188 — Focused Wave U Release-Blocker Recheck

Agent: Jasmine (QA)
Wave: U-Fix
Status: Blocked on Tickets 183–187

## Required checks

Independently reproduce and verify closure of all Ticket 179 blockers:

- retry-safe requires definitive POST settlement plus authoritative absence/open-deadline proof;
- equal-time/out-of-order snapshots cannot regress state;
- lost-ready fallback and forfeit causality are truthful;
- readiness is current-schema isolated and verifies operation uniqueness plus exact due-index predicates;
- deterministic contested PostgreSQL race matrix passes at least ten fresh-schema runs;
- mixed old/new lifecycle capability fails Speed closed and preserves Standard.

Also rerun contracts, full API/web tests, all Speed/Standard PostgreSQL suites, v1 compatibility, generation fencing, build/typechecks/Prisma/workspace validation, browser/accessibility/console/spoiler checks, secret scan, diff check, and cleanup. Return PASS/WARN/FAIL. Ticket 180 remains blocked unless PASS.
