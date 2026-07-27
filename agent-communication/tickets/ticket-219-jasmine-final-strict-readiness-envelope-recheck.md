# Ticket 219 — Final Strict Readiness Envelope Discriminator Recheck

Agent: Jasmine (narrow independent QA)
Wave: V-Operator-Closeout
Status: Ready

## Scope

Recheck only Ticket 217 blocker B1 after Athena replaced truthiness-based branch selection with strict own-property and object-shape discrimination.

## Required assertions

- Body must be a non-null, non-array object.
- Accept valid current `{data:{dependencies}}` and valid legacy `{dependencies}`.
- Require exactly one own top-level branch: `data` xor `dependencies`.
- Nested `data` must be a non-null, non-array object with own `dependencies`.
- Selected dependencies must be a non-null, non-array object.
- Reject dual-valid.
- Reject nested-valid plus direct `null`, own `undefined`, `0`, `false`, string, or array.
- Reject direct-valid plus `data` null, own undefined, scalar, string, array, empty object, or malformed nested dependencies.
- Reject body/dependency primitives, nulls, arrays, missing branches, and structurally incomplete branches.
- Confirm every rejection is sanitized `reconciler_readiness_failed`.

Run the exact seven-shape diagnostic, canonical operator suite (40/40 or higher), API typecheck/full API, contracts, workspace build, diff check, and secret scan. Inspect that DNS pinning, public/private rejection, scalar/all lookup, deterministic IPv4 ordering, 12-second cap, absolute deadline, operator isolation, and no-raw-leak behavior remain unchanged.

No production patching, hosted access, push, PR, merge, deployment, provider change, database access/write, or lifecycle transition. Return PASS/FAIL with exact evidence.
