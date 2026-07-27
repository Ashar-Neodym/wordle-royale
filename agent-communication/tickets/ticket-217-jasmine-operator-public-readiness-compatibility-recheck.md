# Ticket 217 — Independent Operator Public-Readiness Compatibility Recheck

Agent: Jasmine (narrow independent QA)
Wave: V-Operator-Closeout
Status: Ready

## Scope

Independently verify Athena's three surgical operator compatibility corrections discovered during the approved post-PR #14 read-only preflight:

1. accept the real API `{data:{dependencies}}` readiness envelope while failing closed on ambiguous dual and malformed shapes;
2. honor both scalar and `options.all=true` Node lookup callback contracts for pinned HTTPS;
3. deterministically prefer validated public IPv4 before IPv6 and use a bounded 12-second readiness-fetch cap inside the existing absolute operator deadline.

## Required verification

- inspect only the relevant source/test diff;
- run `pnpm --filter @wordle-royale/api test:speed-lifecycle-operator` and confirm 40/40 or higher;
- run API typecheck and full API suite;
- prove mixed public/private DNS still rejects before transport;
- prove ambiguous/malformed envelopes fail closed;
- prove scalar/all lookup callback shapes;
- prove transport remains pinned to a validated DNS answer and does not fall back to ordinary DNS;
- prove all timeout/deadline and no-raw-leak tests remain green;
- `git diff --check` and secret scan.

Athena hosted read-only diagnostic evidence: exact deployed `28d360bc...`, one replica, one matching lease, zero non-target leases, authority `v1_open` generation `1`, readiness all true, eligible drain count `0`, audit count remained `0`. This is diagnostic evidence only and does not authorize hosted access.

Do not patch production code, access hosted systems, push, create PR, merge, deploy, mutate data, or transition lifecycle authority. Return PASS or FAIL with exact evidence.
