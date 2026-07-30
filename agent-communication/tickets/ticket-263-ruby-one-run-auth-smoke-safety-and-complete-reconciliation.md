# Ticket 263 — Ruby — One-run auth smoke safety and complete reconciliation

## Goal

Harden the approval-bound canary smoke so one consumed approval cannot overrun scope or miss side effects.

## Scope

- Stateful HTTP deadlines with zero retries and ambiguity consumption.
- Durable approval consumption: owner/mode/symlink checks, exclusive create, file fsync, directory fsync, stable restricted path.
- Account fingerprint binds email, handle, and display name without leaking values.
- Fresh web identity probe immediately before registration.
- Scoped rate-limit accounting that does not assume global table emptiness.
- Complete shared reconciliation across all account/session, Standard/Speed, matchmaking, gameplay, mutation-request, rating-profile/event, analytics/audit/event, and catalog state.
- Privacy-safe proof of zero non-target session mutation/revocation.
- Production CLI and disposable integration test must use the same reconciliation implementation.

## Acceptance

- Permanent hostile tests for hung requests, receipt replay, path/symlink/mode attacks, account-fingerprint drift, unrelated rate buckets, non-target revocation, omitted table writes, web revision drift, and response leaks.
- Real disposable Nest/PostgreSQL smoke passes with one account, three terminal sessions, zero active sessions, zero retries, zero ranked/event deltas, and schema cleanup.
- No hosted action.
- Commit candidate in an isolated worktree and return exact SHA plus commands/results.
