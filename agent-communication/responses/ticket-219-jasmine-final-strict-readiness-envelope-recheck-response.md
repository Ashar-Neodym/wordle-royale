Task: Ticket 219 — Final Strict Readiness Envelope Discriminator Recheck
Agent: Jasmine (QA)
Verdict: PASS

## Verdict rationale

Ticket 217's sole remaining blocker is closed. The operator now treats envelope branch presence by own-property identity, requires exactly one top-level branch, validates every selected container as a non-null non-array object, and rejects malformed or ambiguous shapes with the sanitized `reconciler_readiness_failed` code.

The real current public envelope and the legacy direct envelope both remain compatible. DNS, HTTPS pinning, timeout, provider-proof, operator-isolation, and no-raw-leak protections remain green.

Ticket 218 is procedurally unblocked for separately authorized checkpoint/PR/CI work.

## Acceptance criteria checked

- Body must be non-null, non-array object: PASS.
- Valid `{data:{dependencies}}`: PASS.
- Valid legacy `{dependencies}`: PASS.
- Exactly one own top-level branch, `data` xor `dependencies`: PASS.
- Nested `data` must be a non-null, non-array object with own `dependencies`: PASS.
- Selected dependencies must be a non-null, non-array object: PASS.
- Dual-valid envelope: PASS — rejected.
- Nested-valid plus direct own `null`, `undefined`, `0`, `false`, string, or array: PASS — all rejected.
- Direct-valid plus `data` null, own undefined, `0`, `false`, string, array, empty object, or malformed nested dependencies: PASS — all rejected.
- Primitive/null/array body, missing branches, primitive/null/array dependencies, and incomplete nested branch: PASS — all rejected.
- Every discriminator rejection returned only `reconciler_readiness_failed`: PASS.
- Canonical operator suite: PASS, 40/40.
- API typecheck/full API, contracts, workspace build, diff check, and secret scan: PASS.

## Independent adversarial evidence

A standalone verifier matrix exercised:

- 2 valid envelope forms;
- 27 malformed or ambiguous envelope shapes;
- mixed public/private DNS before transport;
- deterministic public IPv4 selection from mixed public IPv4/IPv6 answers;
- the bounded 12-second transport budget.

Result:

```text
PASS valid=2 malformed=27 mixed-pretransport=1 pinned=1
```

All 27 malformed/ambiguous bodies returned `reconciler_readiness_failed`. This includes the exact seven-shape Ticket 217 diagnostic and the broader required Ticket 219 matrix.

The source implementation was independently inspected and now uses:

```ts
const hasDirect = Object.prototype.hasOwnProperty.call(body, 'dependencies');
const hasData = Object.prototype.hasOwnProperty.call(body, 'data');
if (hasDirect === hasData) reject();
```

It then separately validates the selected direct or nested dependencies value with a non-null/non-array record guard.

## Commands run + exit codes

- Independent 2-valid/27-malformed plus DNS/pinning diagnostic: exit 0.
- `pnpm test:speed-lifecycle-operator`: exit 0 — 40/40.
- API typecheck: exit 0.
- Full API suite: exit 0 — 228/228; PostgreSQL-only suites skipped by design.
- Contracts tests and typecheck: exit 0 — 24/24 plus TypeScript PASS.
- Nine-project workspace build: exit 0.
- Compiled operator context smoke: exit 0, `runtimeWorkersPresent=false`.
- Secret scan: exit 0 — 289 source/config files.
- `git diff --check`: exit 0.

## Browser/visual evidence

Not applicable. Ticket 219 is an operator-only server-side envelope discriminator recheck with no UI changes.

## DNS/transport/provider regression review

- Mixed public/private DNS answers reject before transport: PASS.
- RFC 8215 local-use NAT64, private, loopback, mapped, translated, encoded, and special-use origins remain blocked: PASS.
- Scalar and `options.all=true` pinned lookup callback contracts remain green: PASS.
- Public IPv4 is deterministically selected before IPv6: PASS.
- The selected independently validated address is passed to pinned HTTPS transport: PASS.
- No fallback to ordinary DNS was introduced: PASS.
- Readiness transport budget remains capped at 12,000 ms inside the existing absolute deadline: PASS.
- DNS and transport non-settlement map to bounded sanitized timeout behavior: PASS.
- Provider project/environment/service/deployment/artifact/fleet/replica/region/lease/origin binding remains green: PASS.
- Railway command serialization and cancellation-ignoring settlement fencing remain green: PASS.
- No raw provider or readiness body leaks through errors: PASS.
- Compiled operator context remains isolated from runtime workers: PASS.

## Findings

No blocking or non-blocking defect found within Ticket 219 scope.

## Required fixes / owner

None for Ticket 219.

Yuna may proceed with Ticket 218 only under its separate checkpoint/PR/CI authorization. This PASS does not authorize hosted access, lifecycle transitions, deployment, merge, or release.

## Security/scope review

- No production source was modified during QA.
- No hosted system, Railway API/CLI, hosted database, or provider setting was accessed.
- No database was started, queried, or mutated.
- No credential, provider response, connection string, answer authority, hash, or spoiler was exposed.
- The intentionally dirty shared worktree was preserved.

## Residual risks

- PostgreSQL integration was intentionally not run because Ticket 219 prohibits database access/write and changes only in-memory readiness response discrimination/tests.
- Hosted behavior remains untested and unauthorized in this recheck.

## Cleanup

- No Docker container or disposable schema was created.
- No QA server, temporary test file, operator process, or API process remains.
