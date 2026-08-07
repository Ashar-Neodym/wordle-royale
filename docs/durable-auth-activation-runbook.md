# Durable authentication activation runbook

> Current state: the Practice MVP runs intentionally as a Vercel-only, browser-local `production`/`disabled` deployment. Railway, the API, and PostgreSQL are not required for that MVP. The ranked and durable-account implementation described below is preserved dormant; use this runbook only for a separately approved future activation.

Status: local operator contract only. This document grants **no hosted authorization**. Preview remains unchanged and no command below may be run against hosted resources without the separately named gate.

## Invariants

- Provision a distinct production provider project/environment, web service, API service, PostgreSQL database, and HTTPS web/API origins. They must differ from preview IDs, database, and domains.
- First activation has exactly one API replica. Preview stays `APP_ENV=preview`, `AUTH_MODE=preview_demo_session`, durable auth off.
- Production is `APP_ENV=production`, `NODE_ENV=production`, `AUTH_MODE=session_required`, secure host-only `__Host-wr_session`, bounded trusted proxy hops, and exact origins with no URL credentials/path/query/fragment.
- Use a direct migration/read connection supplied only in the operator environment. Never put a URL, key, canary identity, or password in arguments, inventory, evidence, files, or logs.
- Additive auth migrations have no down-migration rollback. The canary account is retained; terminal state must have zero active sessions.

## Gates (each approval is distinct and single-purpose)

1. **G0 — merge/provisioning approval.** Qualify the exact full source SHA and artifact digest locally. Independently provision production resources. This is not config, deploy, migration, preflight, or account-write approval.
2. **G1 — secrets/config approval.** Install required secrets and non-secret production config without printing values. Keep durable behavior dormant and registration `closed`. Confirm presence/fingerprints only.
3. **G2 — dormant migration/deploy approval.** Apply additive migrations through the direct connection. Deploy API first with registration closed, then prove exact deployment/revision and exactly one settled replica. Do not expose the web account surface.
4. **G3 — phased read-only preflight approval.** Production provider-derived evidence requires a completely verified `wordle-provider-challenge/v1`, `wordle-provider-live-evidence/v2`, `wordle-provider-inventory/v3`, and `wordle-provider-receipt/v3` bundle plus protected expected challenge/run/nonce/collector-key policy and the separate schema-v3 operational phase inventory. Verification of challenge freshness, collector key/signatures, exact operation plan, evidence/inventory/receipt digests, environment isolation, and the two required PostgreSQL subject observations completes before database or public adapters run. PostgreSQL requires independent Railway control-plane and fixed direct-SQL observations of one subject; repeated or null physical node identity is valid and no observation count implies a replica count. Direct endpoint classification and exact project/environment/service/deployment/cluster/database/schema/endpoint scope are mandatory. The SQL method must prove the exact schema under the fixed read-only query contract. Only after this verification and exact operational mapping can `providerDerived=true` be emitted. Legacy native-v1 plus inventory/receipt v2 is available only through the explicit controlled fixture test lane and is rejected by the production path. Collector/CLI transport wiring is completed by Ticket 273; no live action is authorized here. The phase inventory must name exactly one `activationPhase`: `dormant`, `closed`, or `canary`; dormant, closed, and canary runtime/readiness/web-identity requirements remain unchanged. Existing bounded public-GET and read-only database probe requirements remain in force; Ticket 273 will publish the final production-v3 CLI argument contract.
5. **G4 — API activation approval.** Activate the one API replica with production/session-required durable state while registration remains `closed`. Re-run G3 with a fresh run ID and expiry. This approval permits no account operation.
6. **G5 — canary-mode approval.** Set registration to `canary` with the approved in-memory identity binding; prove one-replica readiness and obtain a fresh canary-mode preflight receipt. Do not open public registration or web forms.
7. **G6 — one controlled lifecycle approval.** The approval JSON must bind the exact canary preflight receipt, artifact SHA, every provider/deployment/resource ID, exact origins, `registrationMode=canary`, the **same run ID as the canary preflight**, and opaque account fingerprint. A distinct approval/preflight run-ID pair fails closed. Pipe the strict secret JSON from a protected non-TTY producer directly to stdin:

   `secret-provider | pnpm --filter @wordle-royale/api auth:activation:smoke --approval approval.json --preflight preflight.json`

   Never type secrets into a TTY or use shell arguments/history, env values, temp files, tracing, HAR, or verbose HTTP logs. Set `AUTH_SMOKE_CONSUMPTION_DIR` to a restricted local audit directory if the default is unsuitable. Approval is atomically consumed before the first registration dispatch; network ambiguity or any later failure consumes the run. There is no retry. A rerun requires a new approval, run ID, and account identity plus disposition of prior mutations.
8. **G7 — web activation approval.** Only after G6 proves one retained account, three accounted session rows, zero active sessions, and zero ranked mutations may the production web surface be enabled. Keep registration canary/closed as approved.
9. **G8 — independent QA.** Independent QA revalidates sanitized evidence and read-only RED probes. The original approval cannot create a second account. Any stateful QA lifecycle needs a separately approved account.
10. **G9 — optional public registration.** `open` registration is a later product/security/data-owner decision and separate config/deploy approval; it is not implied by any prior gate.

## Smoke stop rules

Stop on scope/SHA/revision/origin/replica/fingerprint/readiness mismatch; redirects; duplicate, preview, non-host-only, or malformed cookies; response token fields; non-generic auth errors; approval replay; uncertain registration dispatch; more than one register dispatch; more than three sessions; replay success; non-target revocation; nonzero final active sessions; rate-budget breach; or any Standard/Speed/catalog/ranked delta. Do not delete the account, mutate the provider, issue SQL cleanup, add a second account, or retry.

## Rollback (separate approval unless incident-preauthorized)

1. **Web writes off first:** hide/disable durable production forms and BFF writes.
2. **Close registration second, but keep durable API active:** this blocks new registrations while preserving the production/session-required/durable environment required by `auth:sessions:operator`.
3. **Revoke sessions third:** use the repository session operator under its own exact-revision/apply/reason/count approval; repeat bounded invocations only when explicitly approved until an independent zero-active-session observation succeeds. Durable-off alone is not permanent revocation across re-enable.
4. **API durable off fourth:** only after zero active sessions is proven, disable durable behavior while retaining production-safe session-required identity behavior. Verify no authenticated success.
5. **Code last:** roll back code only to a binary that safely reads existing auth rows. Keep both additive migrations and retained account data. Never run a down migration or ad hoc deletion.

The executable order is exactly `web-writes-off → registration-closed → sessions-revoked → zero-active-sessions-proven → api-durable-off → code-rollback`. Moving `api-durable-off` before session revocation is invalid because the session operator deliberately refuses that environment.

Preserve forensic receipts, revoke/cleanup receipts, exact revisions, and sanitized counts. Escalate any inability to prove zero active sessions; do not improvise cleanup.
