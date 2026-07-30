# Ticket 262 — Yuna — Provider provenance, manifest semantics, and artifact identity

## Goal

Create committed read-only collection/validation tooling that produces authenticated, sanitized provider evidence rather than trusting caller-authored inventory.

## Scope

- Strict adapters for Vercel web, Railway API, and PostgreSQL resource identity.
- Preserve absent / explicitly empty / non-empty / masked-unknown states.
- Bind production and preview project/environment/service/deployment IDs and prove complete isolation.
- Distinguish source Git SHA from independently observed artifact/deployment digest and declare derivation.
- Bind build/start/runtime manifest digest or explicit provider-managed-manifest attestation.
- Emit canonical inventory plus separately transported receipt; never print secrets.
- Mocked provider fixtures only; no live provider calls or configuration.

## Acceptance

- Hostile fixtures cover stale/mixed identities, empty-vs-absent, masked required secrets, provider omission/null, artifact mismatch, replica disagreement, preview overlap, and manifest ambiguity.
- Tooling tests, typecheck, secret scan, and diff check pass.
- Commit candidate in an isolated worktree and return exact SHA plus commands/results.
