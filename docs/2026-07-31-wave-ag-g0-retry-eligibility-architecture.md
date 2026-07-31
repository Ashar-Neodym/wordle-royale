# Wave AG — G0 retry-eligibility validator architecture

Status: implemented local-only owner decision support. This design grants **no hosted authority** and performs **no provider or network operation**.

## Decision boundary

`g0:retry-eligibility` answers one question: whether the owner may request a new, separately issued G0 approval. The only success decision is:

```json
"decision": "eligible_to_request_fresh_approval"
```

It never says approved, authorized, safe to provision, or reusable. Every success receipt also has `freshApprovalRequired:true` and `hostedMutationAuthorized:false`. The consumed approval is never reusable. Failure emits no receipt. The G1–G9 boundaries and rollback rules in `durable-auth-activation-runbook.md` remain unchanged.

The CLI reads explicitly named local files only. It has no HTTP/provider SDK imports and does not invoke subprocesses. Provider collection is deliberately outside this command. An operator must obtain the fresh signed observation bundle through the protected production provenance collector lane, sanitize it, and then pass it to this offline verifier.

## Fixed qualification and historical bindings

The implementation is deliberately specific to merged base `c1a17f98e555cbf2b291c5a87a6f6311cb8881bb`. It accepts only the exact existing merged receipt digest `sha256:4a40fe2bba1d2c20bf15b8b33da1aeccaafff1fe0f34a5d63acea20859e23302`, and validates/recomputes that receipt before use. The output separately carries its:

- target SHA;
- source tree artifact digest;
- manifest digest;
- provider-default policy digest.

The historical approval must be exact approval ID `6898479e-22b1-4fc8-82ec-ea18a78f760f`, consumed, partial-attempt-consuming, and scoped to no hosted/G1/G2 authority. Its canonical artifact digest is bound into the challenge and output. The prior attempt must bind that same approval/source and the exact created IDs:

| Kind | Exact ID |
|---|---|
| Vercel project | `prj_kTyT8PDyNuBsAs3qCPQBvrRTEb1U` |
| Railway project | `9d69f66f-a3a1-4c83-8280-e2ac204292b0` |
| Railway environment | `d746a3d5-3c8f-4a76-ad58-62a1b8acc0f0` |
| Railway service | `4b24c070-12d2-45b1-83c1-2a101cc75fa8` |
| Railway service instance | `6ea19602-5f0d-42f8-ad9a-83ac12533ee1` (`serviceName: wordle-royale-production-api`) |

The attempt digest and exact IDs are included in the output. Portable, sanitized copies of the three historical records are committed under `scripts/fixtures/g0-retry-sanitized-history/`; they contain no credentials or raw provider payloads. The approval and attempt canonical digests are respectively `sha256:9d46f17ab28f56ef7c42515dd610de582e818f0d760b69bbde693c9bb038f5f3` and `sha256:cf6fb4cf49f1a6b40a59e048f0dc5106fada9d5e9c3a51d7e5f7cd11a4f55338`. They are challenge-bound to fresh signed provider facts.

## Fresh signed provider bundle

The cryptographic envelope delegates to the shared production live-v3 `verifyNarrowedLiveV3Envelope` primitive for canonical JSON, challenge freshness, protected challenge ID/run ID/nonce/collector key, digest chaining, key parsing, and both Ed25519 signatures. The retry module only adds its exact sanitized policy schema. Collector identity is `wordle-royale/provider-provenance@3`.

### Challenge: `wordle-royale-g0-retry-challenge/v1`

Exact fields:

- `schemaVersion`, `challengeId`, `runId`, `nonce`, `issuedAt`, `expiresAt`, `collectorKeyId`;
- exact `qualification`, `priorConsumedApproval`, and `priorAttempt` digest-binding objects;
- `expectedCreatedResources` containing all five exact IDs and authoritative names above;
- `expectedPreviewIds` containing the original Vercel project, Railway project/environment/service, and Supabase project reference.

Default maximum lifetime is five minutes and future skew is 30 seconds. `now >= expiresAt` fails. CLI arguments independently protect expected challenge ID, run ID, nonce, and collector key ID; values are not trusted merely because they appear in the evidence file.

### Evidence: `wordle-royale-g0-retry-provider-evidence/v1`

The exact signed Ed25519 object contains:

- v3 collector/key and exact challenge digest/ID/run/nonce/expiry;
- `observedAt`, inside the challenge interval;
- `observationMode:"provider_control_plane_read_only"` and `providerMutationObserved:false`;
- exact Vercel team ID/slug, plan `Hobby`, and `chargeUsd:"0.0000"`;
- exact Railway workspace ID/name, plan `Hobby`, and an exact four-decimal all-in cost strictly below `5.0000` including taxes and fees;
- all original preview IDs plus `unchanged:true`;
- one observation for every exact prior-created resource: `{id,name,idLookup,nameLookup,pendingDeletion,tombstone}`;
- `signature:"ed25519:..."` over every preceding field.

Eligibility requires exact-ID and exact-name lookups to both be `absent`, with `pendingDeletion:false` and `tombstone:false`. `present`, ambiguity, omission, null, or an unknown field fails closed. A Railway tombstone has a dedicated failure code.

The original preview IDs are fixed to the manifest values, not supplied by the observation as policy. Thus a self-consistent but changed preview cannot pass. Account/workspace identities are fixed similarly. Decimal costs are parsed exactly with integer fixed-point arithmetic, never floating point.

### Provider receipt: `wordle-provider-receipt/v3`

Exact fields are `schemaVersion`, `collector`, `collectorKeyId`, `challengeDigest`, `evidenceDigest`, `inventoryDigest`, and Ed25519 `signature`. The verifier checks both signatures against the explicit protected public-key file and recomputes every digest. Weak HMAC, an unsigned absence assertion, or a shape-only receipt cannot pass.

## Eligibility receipt

`wordle-royale-g0-retry-eligibility-receipt/v1` is deterministic for identical inputs. It contains:

- the only decision named above;
- repository/target and the four qualification bindings;
- consumed prior approval ID and canonical digest;
- prior attempt digest and exact created IDs;
- collector key, challenge/run/nonce, challenge/evidence/provider-receipt digests, observation and expiry times;
- boolean absence/preservation/no-mutation conclusions and exact cost/plan conclusions;
- `freshApprovalRequired:true`, `hostedMutationAuthorized:false`;
- `receiptDigest`, SHA-256 of the canonical receipt body.

It is intentionally not signed: it is a local deterministic evaluation, not a delegation credential. All trust-bearing fresh provider claims underneath it are Ed25519-signed. The output is atomically created with mode `0600`, never overwritten, and intended to remain owner-only.

## Anti-replay and local file safety

All inputs and output/replay paths must be absolute. Input files must be regular, non-symlink, canonical paths and not group/world writable. Unknown/omitted fields are rejected. Output uses exclusive create with `O_NOFOLLOW` and mode `0600`.

After full verification, the owner-only receipt is atomically published and then the nonce is consumed by an exclusive `0600` marker in the protected replay directory. If nonce publication fails (including replay), this process removes its just-published receipt before returning failure. Output publication failure therefore does not burn the nonce, and every reported failure leaves no eligibility receipt. A retry after successful publication requires a new challenge/run/nonce and fresh observation. There is no CLI clock override.

## CLI

```text
pnpm g0:retry-eligibility -- \
  --qualification /absolute/merged-qualification.json \
  --prior-approval /absolute/consumed-approval.json \
  --prior-attempt /absolute/prior-attempt.json \
  --challenge /absolute/retry-challenge.json \
  --evidence /absolute/signed-provider-evidence.json \
  --provider-receipt /absolute/signed-provider-receipt.json \
  --collector-public-key /absolute/protected-ed25519-public.pem \
  --expected-challenge-id ID --expected-run-id ID --expected-nonce ID \
  --expected-collector-key-id ID \
  --replay-dir /absolute/owner-only-replay-dir \
  --output /absolute/new-eligibility-receipt.json
```

Success exits 0 and prints one non-authoritative locator object to stdout:

```json
{"ok":true,"decision":"eligible_to_request_fresh_approval","receiptDigest":"sha256:...","output":"/absolute/path"}
```

Failure writes one object to stderr, emits no eligibility receipt, and exits 2 (validation/policy), 3 (replay), or 4 (unexpected local I/O):

```json
{"ok":false,"code":"RAILWAY_TOMBSTONE_REMAINS"}
```

## Failure taxonomy

Primary policy failures are:

- qualification/history: `QUALIFICATION_*`, `PRIOR_APPROVAL_*`, `PRIOR_ATTEMPT_INVALID`, `ATTEMPT_*`, `PRIOR_CREATED_*`, `ROLLBACK_EVIDENCE_INVALID`;
- challenge/freshness: `PROTECTED_CHALLENGE_POLICY_REQUIRED`, `PROTECTED_CHALLENGE_MISMATCH`, `CHALLENGE_*`, `INVALID_CHALLENGE_WINDOW`, `FUTURE_CHALLENGE`, `EXPIRED_OBSERVATION`, `EVIDENCE_TIME_OUTSIDE_CHALLENGE`;
- authenticity: `INVALID_COLLECTOR_KEY`, `INVALID_COLLECTOR_SIGNATURE`, `INVALID_PROVIDER_RECEIPT_SIGNATURE`, `PROVIDER_RECEIPT_DIGEST_MISMATCH`, `CHALLENGE_BINDING_MISMATCH`;
- absence/rollback: `PRIOR_RESOURCE_NOT_ABSENT`, `PENDING_DELETION_REMAINS`, `TOMBSTONE_ABSENCE_UNPROVEN`, `RAILWAY_TOMBSTONE_REMAINS`;
- preservation/no mutation: `PREVIEW_ID_CHANGED`, `PREVIEW_PRESERVATION_UNPROVEN`, `PROVIDER_MUTATION_OBSERVED`, `NON_READ_ONLY_OBSERVATION`;
- identity/plan/cost: `VERCEL_ACCOUNT_MISMATCH`, `RAILWAY_ACCOUNT_MISMATCH`, `VERCEL_PLAN_NOT_HOBBY`, `VERCEL_COST_NOT_ZERO`, `RAILWAY_PLAN_NOT_HOBBY`, `COST_CAP_EXCEEDED`;
- shape/file/replay: `UNKNOWN_FIELD`, `OMITTED_FIELD`, `INVALID_*`, `PATH_NOT_ABSOLUTE`, `UNSAFE_*`, `MUTABLE_INPUT_PERMISSIONS`, `OUTPUT_ALREADY_EXISTS`, `CHALLENGE_REPLAY`.

Messages deliberately do not echo provider payloads or secrets.

## Current result

The sanitized current attempt says `railwayProviderTombstonePendingPurge:true`, and the consumed approval says `executionState:"rolled_back_provider_tombstone_pending_purge"`. There is no fresh signed absence bundle in the supplied artifacts. Therefore current state is **not eligible**. A signed observation reporting the current Railway project as a tombstone returns `TOMBSTONE_RAILWAY_REMAINS`; no receipt is created. Only a later fresh protected observation proving the exact tombstone and every prior ID absent can reach the owner-only request-eligibility decision.

## Files and tests

- `scripts/g0-retry-eligibility-core.mjs` — strict schemas, signatures, digest bindings, policy evaluator.
- `scripts/g0-retry-eligibility.mjs` — local-only CLI, protected file handling, replay consumption, owner-only output.
- `scripts/g0-retry-eligibility.test.mjs` — exact sanitized-artifact integration, deterministic success, tombstone fail-closed, mutation/cost/staleness/preview/signature negatives, and CLI mode/replay E2E.

Run `pnpm test:g0:retry-eligibility` and `pnpm typecheck:g0:retry-eligibility`.
