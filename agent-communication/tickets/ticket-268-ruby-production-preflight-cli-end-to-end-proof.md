# Ticket 268 — Ruby — Production preflight CLI end-to-end proof

## Blocker

Current tests exercise preflight helpers and fingerprint adapters but do not spawn `apps/api/scripts/auth-activation-preflight.ts` / the production command.

## Goal

Prove the real production CLI composes authenticated provider evidence, protected file inputs, Prisma/PostgreSQL transactions, public probes, complete fingerprints, and sanitized output.

## Acceptance

- Spawn the exact production CLI through the shipped package command/Node entrypoint.
- Use disposable PostgreSQL with all nine migrations and independently verified cleanup.
- Use bounded local HTTPS-equivalent/test authorities or an explicitly injectable local transport seam that preserves production redirect/content-type/body/timeout logic.
- Supply operational inventory, provider inventory, structured receipt, signed native evidence, expected nonce/identities, and protected HMAC key through correctly owned/mode-checked files or stdin contract.
- Prove provider verification occurs before Prisma construction/public probes using invalid evidence counters.
- Prove two distinct read-only transactions and complete baseline/post fingerprint.
- PASS receipt is canonical, sanitized, exact, and `providerDerived=true` only after verification.
- Negative CLI cases: wrong/plain/missing receipt/evidence, identity mismatch, DB mutation between probes, malformed output path/mode, and cleanup.
- No live providers, hosted DB, secrets, or accounts.
