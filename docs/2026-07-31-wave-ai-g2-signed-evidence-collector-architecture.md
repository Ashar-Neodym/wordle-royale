# Wave AI-1 — G2 signed-evidence collector semantic core

Status: implemented as an in-memory semantic composition seam. It has no CLI, filesystem publication, provider/network/database adapter, replay store, or approval action. Its successful result is evidence mechanics only; the embedded Wave AH eligibility result keeps every authority field `false` and still requires fresh approval.

## Boundary and trust model

`scripts/g2-backup-restore-evidence-collector-core.mjs` exports `collectG2BackupRestoreEvidence`. The API accepts protected Wave AH challenge and policy objects, a closed operation plan, an Ed25519 private key and expected collector public key, a shell-free child-runner contract, and a clock. Dependency injection exists for unit tests and future protected composition only. AI-1 deliberately provides no production entry point and never reads credentials, files, environment variables, URLs, hosts, SQL, or provider state.

The caller remains responsible for AI-2 concerns: strict source-byte JSON parsing and lexical duplicate-key detection, protected file ownership/mode/realpath checks, secure executable snapshot/spawn implementation, output publication, replay consumption, and key custody. A runner must affirm `shellFree:true`; every call also receives `shell:false`, an absolute pinned executable policy, fixed argv, and fixed global limits. This is a contract, not a substitute for AI-2's real secure runner.

## Closed operation plan

`wordle-royale-g2-backup-restore-operation-plan/v1` has exactly these fields:

- `schemaVersion`, `challengeId`, `runId`, `nonce`, `keyId`;
- canonical SHA-256 `challengeDigest` and full protected `policyDigest`;
- exactly seven `operations`;
- global `timeoutMs`, `versionTimeoutMs`, `stdoutBytes`, and `stderrBytes` limits.

The operation order is normative:

1. `provider-policy-observation`
2. `rpo-rto-measurement`
3. `completed-backup-artifact`
4. `isolated-restore-drill`
5. `production-no-mutation`
6. `cleanup-absence-observation`
7. `retention-observation`

Each operation contains only `semanticOperation` and `executable`. Each executable pins absolute path, expected realpath, SHA-256, bounded version string, non-negative UID, and exact mode `0500`. The plan has no argv, URL, host, SQL, token, credential, cleanup, mutation, or provider option. The core creates argv internally from constants and protected bindings. Unknown, omitted, repeated, reordered, or mixed-binding semantics fail before a child call.

## Adapter contract and sanitization

Each child must return one UTF-8 JSON object using `wordle-royale-g2-backup-restore-adapter-envelope/v1`. The envelope is closed over:

`schemaVersion`, `semanticOperation`, `adapterVersion`, `challengeId`, `runId`, `nonce`, `collectorKeyId`, `challengeDigest`, `policyDigest`, `attestedAt`, and `payload`.

`payload` is the sole allowed structural use of that key name and means a sanitized semantic conclusion—not raw provider output. Each operation has a distinct closed payload matching exactly one Wave AH evidence section. The recursive pre-sign scanner rejects raw/stdout/stderr, secret, token, credential, authorization, cookie, password, private-key, connection-string, and database-URL shaped keys, plus bearer/private-key/credential-URI/assignment-shaped values. Child stderr and raw stdout are never copied into a result or error; only parsed, validated payloads survive. Output bytes are globally bounded. Lexical duplicate JSON keys remain AI-2 scope, while parsed-object unknown/omitted fields and duplicate/reordered semantic operations fail here.

Every adapter binding must equal the protected plan/challenge bindings. Canonical `attestedAt` values must be inside the challenge, strictly before expiry, and no later than the injected production clock. Aggregate `observedAt` is the maximum adapter attestation. The Wave AH semantic parser then requires exact source, artifact, destination, run, proof, digest, count, RPO/RTO, causality, production no-mutation, cleanup-at-aggregate, and retention agreement. The core performs this complete derivation with an unusable preflight signature marker before touching the private key.

## Cryptographic and semantic closure

Only Ed25519 is accepted. The public key derived from the private key must byte-match the separately supplied expected collector public key. The core reuses provider-provenance canonical JSON, SHA-256, and Ed25519 conventions:

1. construct the exact `wordle-royale-g2-backup-restore-evidence/v1` object;
2. preflight all Wave AH semantics before signing;
3. sign canonical unsigned evidence;
4. derive inventory with `deriveG2BackupRestoreInventory`;
5. sign `wordle-provider-receipt/v3` over canonical challenge/evidence/inventory digests;
6. run `evaluateG2BackupRestoreReadiness` in memory with the expected public key and production clock;
7. assert all authority fields remain false, then return challenge, evidence, inventory, provider receipt, and eligibility mechanics.

No private key or credential fixture is committed. Tests generate synthetic Ed25519 keys at process runtime and use only the existing conspicuously synthetic Wave AH fixture builder.

## Adversarial coverage

The focused test exercises the exact seven call order and argv; all seven operation failure positions; plan closure/order/bindings/limits/executable policy; malformed, unknown, omitted, repeated, oversized, mixed-binding, and nonzero adapter responses; recursive raw/secret rejection; source/artifact/destination/run mixing; proof/digest/count/integrity mismatch; canonical and future times; backup/restore causality; RPO/RTO arithmetic and inclusive bounds; production mutation/window, exact cleanup absence at aggregate observation, retention; Ed25519 type/key mismatch; and evidence/provider-receipt tampering through the Wave AH evaluator.

Run:

```text
pnpm test:g2:backup-restore-evidence-collector
pnpm typecheck:g2:backup-restore-evidence-collector
```
