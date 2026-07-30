# Ticket 259 — Jasmine — Wave AA adversarial hosted acceptance and gap audit

Status: **NOT READY**

Read-only audit at source `53bfc861f281182db198a1764658d5ce26c413f1`.

## P0 blockers

1. G2 dormant → G3 preflight is impossible: preflight requires durable API/web.
2. Documented rollback disables durable auth before using an operator that requires durable auth.
3. Smoke approval run ID is not bound to preflight run ID.
4. No authenticated provider collector; caller-authored inventory proves integrity, not provenance.
5. Source SHA and artifact digest are conflated/unbound.
6. Production smoke omits ranked/event tables and hard-codes one event counter safe.
7. Smoke cannot prove non-target session revocation absence.
8. Preflight zero-write proof uses one repeatable-read snapshot and cannot see concurrent GET writes.

## P1 blockers

- Preview/production resource distinctness is incomplete.
- Provider values do not preserve absent/empty/non-empty/masked semantics.
- Approval consumption lacks directory/file ownership, symlink, and directory-fsync hardening.
- Stateful HTTP calls lack deadlines.
- Account fingerprint omits handle/display name.
- Rate-limit reconciliation assumes global emptiness.
- Smoke does not freshly re-probe web identity.

## Acceptance

All fixes require permanent adversarial regressions, real disposable PostgreSQL evidence where relevant, zero retries, exact provider/artifact/resource/origin/replica binding, one retained canary account, three terminal sessions, zero active sessions, and zero ranked/gameplay/catalog/event mutations.

No hosted or provider action was authorized or performed.
