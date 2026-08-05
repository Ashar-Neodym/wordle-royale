# Wave AJ — local-only G0 retry evidence collector architecture

Date: 2026-08-03
Status: AJ-1 semantic core and AJ-2 protected production collector implemented. Current live provider facts remain blocked. Nothing in this wave grants hosted mutation or reuses the consumed approval.

## Decision and authority boundary

The collector prepares evidence mechanics for the existing Wave AG retry validator. It does **not** decide that G0 is approved. Even a complete future collection can only feed the local decision `eligible_to_request_fresh_approval`; a separately issued fresh approval remains mandatory. The prior approval remains consumed, and `hostedMutationAuthorized` remains `false` on success and blocked results.

AJ-1 is intentionally local and pure. It has no production CLI, filesystem access, subprocess, provider SDK/adapter implementation, network call, ambient environment or clock, signature operation, private-key input, secret read, publication, or replay store. Inputs are parsed JavaScript objects representing sanitized semantic conclusions. Lexical duplicate-key rejection is an upstream byte-parser responsibility: once duplicate JSON keys have been collapsed by `JSON.parse`, no semantic module can recover that fact.

## Four-layer design

### Layer 1 — protected invocation and strict-byte intake (AJ-2)

`scripts/g0-retry-evidence-collector.mjs` owns protected challenge/history/policy/key/plan files, strict UTF-8 JSON parsing, lexical duplicate-key/depth/trailing-data rejection, owner-only file checks, an explicit protected observation time, a collector-specific replay namespace, and fail-safe publication. It independently protects challenge ID, run ID, nonce, collector key ID, challenge digest, fixed policy digest, and maximum lifetime. Every input is an owner-owned 0600 single-link regular file below an owner-owned 0700 parent.

### Layer 2 — provider observation adapters (AJ-2)

Vercel, Railway, and Supabase adapters perform read-only control-plane observation and emit one provider-specific sanitized envelope each. AJ-2 ships no provider adapter and makes no network call. Each externally supplied executable is independently pinned by absolute path, realpath, owner, 0500 mode, single link, descriptor identity, SHA-256, and version. A pinned Python subreaper runs each with `shell:false`, a fixed minimal environment, closed stdin, bounded time/stdout/stderr, and descendant cleanup. Raw provider payloads, credentials, cookies, tokens, URLs, authorization headers, and private key material never cross the sanitized envelope boundary or argv/environment.

### Layer 3 — pure semantic normalization and composition (AJ-1)

`scripts/g0-retry-evidence-collector-core.mjs` is import-free and validates exact closed envelopes for Vercel, Railway, and Supabase. Every envelope is bound to the protected challenge identifiers/digest and the fixed AJ policy digest; timestamps must be canonical, inside the challenge, and no later than the caller-protected observation time. Observation mode is exactly `provider_control_plane_read_only`, and any reported mutation fails.

The core fixes target SHA `37fe4f030b169e6ad2062c8214268a1b20699947`, prior-created IDs/names, preview IDs, account/workspace identities, plans, USD currency, and strict all-in cap to the Wave AG values. Its canonical fixed-policy digest is derived as `sha256:0f0c14a1cde090cac17699887940ee80c820ab85e715f951da546e57368f7d98`; protected bindings and every adapter envelope must carry that exact value. Challenges carry the exact fresh qualification tuple: receipt `sha256:ccf33e8e47709d8213cd01889fb934d48743d75b7995a48e2baff92bb1721ad4`, source artifact `sha256:6713e86f13f0f9b3b5522eb8cbc15abb5953af40580102f1e08690e0215533da`, manifest `sha256:e69d3757ec29176d9c0f22b7d4552bf979376b0363605a642ac339c41501d137`, and provider-default policy `sha256:d97ebf644ebc033f982e3ba284b0692ce173222fee42207e8beb14ff76b74e40`. The downstream Wave AG validator recomputes and enforces that tuple; stale targets, stale collector policy digests, challenge qualification mismatches, and partial repins fail closed. Every prior-created resource must be absent by exact ID and exact name, with no pending deletion or tombstone. Every preview identity must be exact and explicitly unchanged.

Money inputs are canonical non-negative decimal **strings** only. No `Number` conversion is used. Charges, subtotal, tax, and fees round upward to four decimal places; applied credits round downward. Unapplied account balance is validated but never subtracted. The core selects the greatest all-in result among complete quotes for the requested identical billing interval and derives `allInUsd` itself with `BigInt` fixed-point arithmetic. Unknown/null tax and fee values have component-specific failures. Negative, exponent, NaN/infinity, malformed, and exact `5.0000` all fail closed.

A complete result contains the exact unsigned `wordle-royale-g0-retry-provider-evidence/v1` body expected before adding `signature`, plus deterministic `wordle-provider-inventory/v3`. AJ-1 does not hash, sign, verify, or publish them. If an adapter reports one of the narrowly allowed current blockers, AJ-1 instead returns an authority-free blocked conclusion and emits no evidence or inventory.

### Layer 4 — signing, publication, and offline decision (AJ-2)

The production layer derives the public identity from the protected Ed25519 private key, matches it to the independently protected keyring, signs canonical evidence and the exact `wordle-provider-receipt/v3`, and executes the unchanged retry validator in memory against the exact historical artifacts. It publishes `challenge.json`, `evidence.json`, `provider-receipt.json`, `eligibility-preview.json`, and `commit-manifest.json` (last) as 0600 files in a pre-existing 0700 directory. Candidates and replay are rolled back on any failure before a trusted final commit. A successful preview remains `freshApprovalRequired:true` and `hostedMutationAuthorized:false`.

## Envelope closure

All three envelopes contain exactly: schema, provider and adapter version; challenge ID/run/nonce/key/digest; fixed policy digest; canonical observation time; read-only/no-mutation assertions; status; blocker; and provider-specific sanitized payload.

An observed Vercel payload contains only the fixed account/plan, billing interval, complete charge quotes, exact prior project absence, and exact preview preservation. An observed Railway payload contains only the fixed workspace/plan, billing interval, complete all-in quote components, all four exact prior resource absences, and exact preview preservation. An observed Supabase payload contains only the exact preview project reference and preservation assertion. Unknown and omitted fields fail closed.

Blocked envelopes have `payload:null` and exactly one provider-specific blocker code; observed envelopes have `blocker:null`. This prevents a blocked status from smuggling a partially trusted payload.

## Current live blockers

The current known facts do not support evidence composition:

- **Vercel:** billing completeness is unavailable, represented only as `VERCEL_BILLING_COMPLETENESS_UNAVAILABLE`.
- **Railway:** tax and/or fee completeness is unknown, represented only as `RAILWAY_TAX_OR_FEE_UNKNOWN`.
- **Supabase:** authenticated read-only observation is unavailable, represented only as `SUPABASE_AUTH_UNAVAILABLE`.

With those three envelopes, AJ-1 deterministically returns `status:"blocked"`, no evidence, no inventory, and `hostedMutationAuthorized:false`. Blockers are not converted to zero-cost or absence claims. In particular, unknown tax/fee is never treated as zero, and unavailable auth is never treated as proof that a preview resource is unchanged.

## Sequencing

1. **AJ-1:** pure schemas, protected binding validation, decimal normalization, exact unsigned evidence/inventory composition, and blocked conclusions.
2. **AJ-2 (this change):** hardened external adapter boundary, strict-byte intake, protected Ed25519 signing, digest chain, replay-safe owner-only publication, and in-memory execution of the unchanged Wave AG validator. A successful result still only permits requesting a fresh approval.

No phase may skip a predecessor's boundary by accepting raw provider output, ambient challenge values, incomplete billing components, mutable preview identities, or a provider-created assertion of its own authority.

## Verification

The AJ-1 hostile suite covers directional decimal rounding without floating point; malformed/negative/exponent/NaN values; complete same-interval quote selection; unapplied balance exclusion; unknown/null/omitted cost components; strict cap; exact evidence and inventory shape/determinism; all envelope bindings, closure, times, read-only/no-mutation requirements; all exact resources and preview identities; provider-specific blocked states; and static proof that the semantic core imports no module and contains no clock, environment, filesystem, subprocess, network, or signing primitive.

Run:

```text
pnpm test:g0:retry-evidence-collector
pnpm typecheck:g0:retry-evidence-collector
node --test scripts/g0-retry-eligibility.test.mjs
```
