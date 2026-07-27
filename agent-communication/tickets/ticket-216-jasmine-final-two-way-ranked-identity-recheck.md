# Ticket 216 — Final Two-Way Ranked Identity Recheck

Agent: Jasmine (narrow independent QA)
Wave: V-Runtime-Readiness-Fix
Status: Ready

## Scope

Recheck only Ticket 211's converse ranked mode/algorithm identity blocker after Athena's surgical correction.

## Required adversaries

Prove all reject with `ranked_mode_algorithm_mismatch` before participant/profile/event/report access or any write:

1. `standard_1v1` + `speed_1v1_glicko_v1`;
2. `speed_1v1` + `standard_1v1_glicko_v1`;
3. null/other ranked mode + `speed_1v1_glicko_v1`.

Also prove valid Standard and valid Speed rows still settle through their correct separate ladders, and unsupported algorithms retain `unsupported_rating_algorithm` precedence.

## Required commands

- permanent `rating-finalization.test.ts` matrix;
- relevant Speed rating/gameplay focused suites;
- full API suite;
- relevant PostgreSQL Speed rating/gameplay checks if available;
- API typecheck;
- contracts tests/typecheck;
- `git diff --check` and secret scan.

Athena evidence before handoff:

- exact new matrix reproduced RED before production patch;
- fixed matrix: 13/13 PASS;
- full API: 225/225 PASS;
- API typecheck: PASS;
- secret scan: 289 files PASS;
- `git diff --check`: PASS.

No need to repeat the 80/80 lifecycle race matrix: this patch only moves two-way rating identity validation before delegation/participant access and adds unit regressions. Do not patch production code, access hosted systems, push, create PR, deploy, mutate data, or transition lifecycle authority.

Return PASS or FAIL with exact evidence. Ticket 212 remains blocked until PASS.
