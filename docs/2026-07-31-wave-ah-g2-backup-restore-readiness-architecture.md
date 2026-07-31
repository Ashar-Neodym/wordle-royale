# Wave AH1 — pure G2 backup/restore readiness architecture

Status: implemented as a pure, offline verifier foundation. **No real G2 evidence exists and the current project is not eligible.** Every committed fixture is conspicuously synthetic, sanitized, and non-authoritative.

## Approval boundary

The sole successful decision is `eligible_to_request_G2_approval`. It is permission to ask an owner for a new approval—not an approval and not execution authority. The deterministic receipt always says `freshApprovalRequired:true` and sets `hostedMutationAuthorized`, `g1Authorized`, `g2Authorized`, `backupExecutionAuthorized`, `restoreExecutionAuthorized`, and `productionMutationAuthorized` to `false`. AH1 makes no provider, network, database, filesystem, or subprocess call. Ruby/AH2 can call the stable `evaluateG2BackupRestoreReadiness` pure API after doing protected file parsing and replay controls.

## Trust and schemas

All policy, challenge, evidence, identity, proof, inventory, provider-receipt, and eligibility objects use closed schemas. Unknown and omitted fields fail closed. Filesystem-level duplicate JSON keys are intentionally deferred to AH2's strict parser; AH1 rejects duplicate logical identities through role equality/overlap checks.

The protected policy independently binds:

- repository, exact 40-hex source SHA, source artifact SHA-256, and migration SHA-256;
- provider, completed-snapshot mode, minimum retention, maximum RPO, and maximum RTO;
- full source-production, intended-restore, and actual-destination identities (provider/account/project/environment/service/database/name/schema/endpoint);
- ambient expected challenge ID, run ID, nonce, and collector key ID.

The intended and actual destination must be identical. Production and restore destination must differ across every critical project/environment/service/database/endpoint identifier, preventing preview/production overlap.

The challenge repeats and digest-binds that policy. Evidence is a sanitized Ed25519-signed `wordle-royale/provider-provenance@3` envelope. It keeps seven independent conclusions separate:

1. **Provider policy:** observed backup mode and retention.
2. **Completed artifact:** actual artifact ID/digest, same run, completed status, timestamps, source identity and exact source bindings.
3. **Isolated successful restore:** same run/artifact, intended destination, isolation and success.
4. **Complete equivalence proof:** schema, migration, constraints, data, integrity digests, table/row counts, and completed integrity checks. Row counts alone cannot pass.
5. **Production no-mutation:** exact production identity, zero mutation count, affirmative confirmation.
6. **Cleanup:** exact destination lookup must be `absent`, not pending, and have no tombstone.
7. **Retention:** same artifact, declared policy agreement, and a recomputed retained-until interval.

All timestamps are canonical UTC with milliseconds. Signed operational timestamps must fall from challenge issuance through evidence observation, and production evaluation rejects evidence observation later than its non-overridable local clock even while the challenge remains active. Cleanup must follow verification and its signed `checkedAt` must equal aggregate `observedAt`. The production no-mutation window starts no later than the recovery point/backup and covers through cleanup and aggregate observation. Counts and durations are strict unsigned decimal strings, parsed with `BigInt`, bounded at 31,536,000,000, and never accepted with exponent, sign, leading zero, fraction, or unit suffix. Data-loss RPO is recomputed as source cutoff minus recovery point; end-to-end RTO as verification completion minus restore request. Signed claimed durations must exactly match those recomputations. Inclusive policy boundaries pass; overflow and one-millisecond-over cases fail.

## Cryptography and derived records

AH1 reuses `liveCanonicalJson`, `liveSha256`, `verifyLiveEd25519Signature`, and `verifyNarrowedLiveV3Envelope`. It does not introduce HMAC or alternate canonicalization. The evidence signature covers every evidence field. A separately signed provider receipt binds canonical challenge, evidence, and derived inventory SHA-256 digests. The deterministic local eligibility receipt binds those artifacts and recomputed metrics, but is deliberately not a delegation credential.

`deriveG2BackupRestoreInventory(evidence, challenge, policy)` is also pure and deterministic. It validates semantic evidence before constructing the exact sanitized inventory used by the signed provider receipt.

## Synthetic fixtures

`scripts/fixtures/g2-backup-restore-synthetic/externally-signed-positive.json` and its public key are portable test data. The private signing key was generated out of process and discarded; it is not committed. The builder requires an injected signing function so key ownership remains outside fixture construction. Values identify only `synthetic-postgres` and synthetic resource names. These fixtures demonstrate contract mechanics only and make no statement about live Wordle Royale infrastructure.

## AH2 protected publication boundary

AH2 provides the protected filesystem CLI, strict duplicate-key JSON parser, descriptor-anchored owner-only publication, and replay consumption around the pure API. Publication retains open candidate and marker handles, checks exact pathname/inode/owner/mode/link-count identity before and after every link transition, and rolls back only pathname entries still naming inodes created by that invocation. Marker removal or replacement can never produce apparent success or delete a replacement. A safely rolled-back late publication failure leaves the nonce reusable. This transaction invariant ends when the function successfully returns: it is impossible to prevent a same-UID principal from creating a hardlink afterward, so deployment must treat post-return same-UID activity as trusted rather than claiming perpetual receipt confidentiality. Actual collection/provider operations and approval issuance remain separate hosted/owner lanes. No AH1/AH2 output may be treated as authority.

Run:

```text
pnpm test:g2:backup-restore-readiness
pnpm typecheck:g2:backup-restore-readiness
```
