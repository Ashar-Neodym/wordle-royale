# Ticket 274 — Ruby — Production live provenance CLI E2E

Blocked on Ticket 273.

## Goal

Prove the shipped live collector and offline verifier as subprocesses without any live network.

## Scope

- Controlled absolute fake Vercel, Railway, and PostgreSQL executables with supported version/output.
- Local TLS provider fixtures with approved CA, authority, redirect, expiry, malformed/oversized/truncated responses.
- Production collect → sign → verify → derive inventory/receipt → replay-consume path.
- Fake executable/path/digest/version/owner/mode, shell injection, env/argv/stderr leak, timeout/output bounds, partial failure, TOCTOU, key rotation, protected files, atomic output bundle.
- Honest one-node PostgreSQL two-method positive and duplicate/mismatch/pooler negatives.
- Network isolation and production rejection of fixture/test seams.
- Secret canaries absent from stdout/stderr/errors/files.

## Verification

Permanent CLI E2E, v3/v2 suites, activation preflight composition, workspace/typecheck/secret/diff. No live provider calls.
