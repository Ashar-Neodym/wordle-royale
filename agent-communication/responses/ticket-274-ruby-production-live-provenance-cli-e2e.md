# Ticket 274 — Ruby — Production live provenance CLI E2E response

Status: **IMPLEMENTED**

The permanent subprocess suite invokes the shipped `scripts/provider-provenance-live.mjs` collect and verify commands with protected 0600 challenge, policy, operation plans, Ed25519 private key, and public-key keyring files under 0700 roots. Controlled absolute provider executables cover all eight Vercel, Railway, and PostgreSQL operations. The positive path proves commit-last flat publication, signed evidence, inventory/receipt v3 derivation, an honest one-physical-node/two-independent-method PostgreSQL result, offline verification, and durable replay rejection.

Hostile coverage includes executable realpath/type/digest/version/owner/mode and PATH substitution; fixed shell-free literal argv and minimal environment; mixed/stale/substituted challenge policy and fixture/live version rejection; partial failures; process timeout plus descendant process-group kill; independent stdout/stderr bounds; malformed, duplicate-key, deep, trailing, and oversized JSON; secret-canary redaction; protected input/root modes and symlinks; key rotation/revocation/duplicates; flat partial/extra/occupied/concurrent publication; PostgreSQL observation/method/scope/schema/pooler/SQL-contract negatives; and production rejection of CLI/config test seams.

## Network and TLS applicability

The production collector has no HTTP transport adapter: every live operation is an absolute pinned executable invocation, and the test asserts the collector core contains no HTTP/fetch transport. Network/provider/hosted-DB access is therefore absent rather than simulated. Local TLS CA, authority, redirect, expiry, downgrade, and malformed HTTP response tests are **not applicable until an HTTP adapter exists**. Adding fake TLS code solely for this ticket would create and test a non-production seam instead of proving the shipped path.

Commands and final results:

- `pnpm test:provider-provenance:live-cli-e2e` — 52/52 passed; every CLI subprocess has a 20-second test watchdog and the process-timeout case proves descendant process-group cleanup.
- `pnpm test:provider-provenance` — 89/89 passed (v2 fixture, v3 live, collector, and CLI E2E).
- `pnpm test:provider-provenance:live-collector` — 12/12 passed.
- `pnpm test:auth:activation-tooling` — 26/26 passed.
- `pnpm --filter @wordle-royale/api test` — 252 passed, 0 failed.
- `pnpm --filter @wordle-royale/api typecheck`, `pnpm typecheck:provider-provenance`, `pnpm validate:workspace`, `pnpm secret-scan`, and `git diff --check` — passed.
