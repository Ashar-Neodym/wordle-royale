# Wave AM — G0 real read-only adapter/session/tool-pinning architecture

Date: 2026-08-04  
Status: architecture decision; implementable and fixture-testable while live evidence is blocked  
Base: `78d054ddcd421840b4aa0bca70f121a299f9c8ee`

## Decision

Ship Vercel, Railway, and Supabase adapters now as **blocked-capable collectors**, not evidence-success claims. Preserve AJ's outer boundary exactly: the current 17 challenge argv, closed stdin, `shell:false`, fixed `LANG,LC_ALL,PATH,TZ`, adapter absolute path/realpath/owner/0500/single-link/SHA/version pins, bounded streams/time/children, strict envelope parsing, and no publication/replay consumption on blockers. Never add `HOME`, tokens, cookies, session paths, or arbitrary commands to argv/environment.

Extend the protected adapter plan with a non-secret official-tool descriptor. The runner validates it and sends canonical JSON on dedicated read-only FD 3. The adapter reads and closes FD 3 before spawning the CLI; the CLI never inherits it. This preserves 17 argv and portability without ambient `PATH` discovery or compiled-in machine paths.

Reject the discovered npm tree as a production trust root: its root and `.bin` launchers are user-owned mode 0775, and dependencies load by path after process start. Entrypoint hashes alone cannot prevent dependency substitution. Stage the same official packages in an operator-controlled immutable bundle: root-owned, safe ancestors, no collector/group/world writes, preferably a read-only mount. Pin its complete dependency closure. This local staging is not a provider action.

## Current facts and envelopes

Discovered official versions are Vercel `58.4.4`, Railway `5.30.1`, and Supabase `2.110.0` under `/home/ashar/.hermes/profiles/athena/tools/wordle-g0-provider-tools`. Fresh calls must reproduce facts; adapters must not embed them.

Discovery digests (inventory aids, not production trust until copied into an immutable complete bundle):

| Item | SHA-256 |
|---|---|
| Vercel `dist/vc.js` | `56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363` |
| Railway JS launcher | `21023bebb7838bd52d7646bf0ce75d3c33dc259797dd6e920e318be630184d2d` |
| Railway native binary | `26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2` |
| Supabase JS launcher | `253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240` |
| Supabase linux-x64 binary | `e0574b435f54898aa1f5f6fe0696e61b612dafc9b86a2aa538cf8215fc3c9e9f` |
| Root `package-lock.json` | `bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90` |
| `/usr/bin/node` | `f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d` |

* **Vercel:** use the existing standard session and explicitly scope every read to team `team_OeoH1n8WNMnJfgo4otQGevCG`. Re-prove Hobby, preview identity, and prior ID/name absence. Billing endpoint 404 does not prove complete zero charge: emit only `VERCEL_BILLING_COMPLETENESS_UNAVAILABLE`, `payload:null`.
* **Railway:** explicitly scope to workspace `ae263dc6-85f3-4d84-9415-ecdf621f49b6`. Re-prove Hobby, preview, and exact inventory. Usage/credits without complete subtotal, tax, fee, invoice interval, and applied-credit semantics is insufficient: emit only `RAILWAY_TAX_OR_FEE_UNKNOWN`, `payload:null`.
* **Supabase:** run the pinned CLI non-interactive auth preflight. No standard session means only `SUPABASE_AUTH_UNAVAILABLE`, `payload:null`; it proves no preservation fact.

The three blocked envelopes must produce `CURRENT_LIVE_BLOCKED`, no evidence/inventory/publication, no replay marker, and `hostedMutationAuthorized:false`.

## Closed schemas

Introduce `wordle-royale-g0-retry-adapter-plan/v2`. Keep v1 bindings/limits and make each adapter entry exactly:

```json
{
  "provider":"vercel",
  "version":"wordle-g0-vercel-readonly/1",
  "executable":{"path":"/absolute/adapter","realpath":"/absolute/adapter","sha256":"sha256:...","version":"wordle-g0-vercel-readonly/1"},
  "tool":{
    "schemaVersion":"wordle-royale-provider-tool/v1",
    "distribution":"official_npm_cli",
    "package":"vercel",
    "version":"58.4.4",
    "bundleRoot":"/absolute/immutable/bundle",
    "bundleRealpath":"/absolute/immutable/bundle",
    "entrypoint":"node_modules/vercel/dist/vc.js",
    "entrypointSha256":"sha256:...",
    "packageJsonSha256":"sha256:...",
    "lockfileSha256":"sha256:...",
    "treeManifestSha256":"sha256:...",
    "runtime":{"path":"/usr/bin/node","realpath":"/usr/bin/node","version":"...","sha256":"sha256:..."},
    "sessionMode":"standard_os_user_session",
    "invocationProfile":"vercel-g0-readonly/1",
    "invocationProfileSha256":"sha256:..."
  }
}
```

Railway additionally pins the official native `bin/railway`; Supabase pins the selected platform package/native binary. The canonical relative-path-sorted tree manifest lists every regular file SHA/mode and directory mode. Reject symlinks, devices, sockets, FIFOs, writable nodes, hardlinks, `..`, duplicate/case-colliding paths, omitted files, and unsafe ancestors. Tool roots may be shared; adapter executables may not alias. The plan has no credential path/value; `sessionMode` names only a mechanism.

Add closed `toolDescriptor` and plan-digest fields to the private runner→supervisor frame. The supervisor writes one bounded canonical frame to a pipe mapped read-only as adapter FD 3; FD 0 remains `/dev/null`. Missing, extra, malformed, oversized, or digest-mismatched data fails. Verify ancestry, immutability, manifest, lock/package/entrypoint/native/runtime hashes before and after execution. If collector UID can mutate the tree, fail `TOOL_BUNDLE_POLICY_MISMATCH`; pre/post hashes are defense in depth, not a replacement for immutability.

The current binding `now` must mean independently protected **observation ceiling**, selected after issuance, late enough for bounded reads, and strictly before expiry. Rename it `observationDeadline` in binding v2 (or lock this v1 meaning). Include this non-secret ceiling on FD 3. Each adapter timestamps after its final required read and rejects time outside `[issuedAt, observationDeadline]`; adapter time cannot widen the ceiling.

## Session and invocation

Derive home from effective-UID passwd data (`os.userInfo().homedir`), never `process.env.HOME`; reject relative path, UID mismatch, symlinked home, unsafe ownership, or unexpected realpath. This resolves `/home/ashar` under the current stripped environment. The adapter never opens, locates by filename, stats, parses, hashes, copies, prints, or persists a session credential file. Only the official CLI reads its standard session internally.

Build the CLI child environment from scratch: fixed locale/path/timezone; verified passwd `HOME`; deterministic XDG paths required by the pinned CLI; documented telemetry/update-check disable constants; no inherited variables. Forbid all `*_TOKEN`, auth-header, cookie, URL, linked-project, and binary-override variables. Start in a dedicated empty owner-only non-project cwd, preventing `.vercel`, `.railway`, `supabase`, Git, dotenv, or package metadata from selecting scope.

Only fixed invocation templates in the pinned profile are legal. Provider output/session/challenge text cannot become a command, endpoint, flag, GraphQL document, environment, or path. Use explicit protected team/workspace/project/environment/service IDs. Read identity/scope before and after observations and require exact account IDs. Session expiry/rotation, account drift, prompt, rate limit, schema drift, incomplete pagination, or scope ambiguity fails closed.

Profiles exhaustively allow reads and deny deploy/provision/create/update/delete/link/login/logout, billing mutation, environment/variable/secret operations, database/SQL/schema/migration/function/storage operations, and G0 retry. No direct-HTTP fallback: inability of the official CLI to make a narrow safe read retains the applicable blocker or fails generically.

## Raw-output boundary

Spawn CLI with `shell:false`, closed stdin, bounded timeout/stdout/stderr, and outer-subreaper cleanup. Capture raw bytes only in private fixed-capacity memory. Never inherit, forward, quote, hash, sample, redact-and-log, or put them in errors. Parse strict UTF-8 and exact version/profile schemas; duplicate/unknown keys, truncation, malformed money, redirects, or mixed scopes fail. Project only closed allowlisted scalars into a typed record, discard/zero raw buffers, then construct the envelope. Adapter stderr stays empty; failures exit silently and collector reports fixed codes. Narrow blockers require positive recognition of exact conditions, never arbitrary nonzero/unparseable output.

## Dependency-aware cards

### AM-1 — immutable tool bundle
Depends on approved package/runtime versions. Build the non-secret bundle, manifests, invocation profiles, and descriptors; make no provider call. **Accept:** wrong path/version/hash/runtime, writable ancestor/dependency, symlink/hardlink, omitted/swapped native binary, lock drift, and before/during/after mutation all fail.

### AM-2 — descriptor FD and containment
Depends on AM-1 and AJ runner/subreaper. Implement plan v2, FD-3 transfer, complete pin checks, and closure while retaining 17 argv/minimal env/closed stdin/limits/cleanup. **Accept:** descriptor never appears in argv/env/output, grandchildren lack FD 3, malformed frames fail, all AJ hostile tests remain green.

### AM-3 — common adapter runtime
Depends on AM-2. Implement passwd home, empty cwd, child env allowlist, fixed dispatcher, strict capture/parser, account-before/after checks, observation ceiling, and envelope writer; expose no general command API. **Accept:** canaries in parent env, fake session, raw stdout/stderr, URLs, and headers never occur in process listings, adapter/collector output, logs, output, or replay.

### AM-4 — provider adapters, blocked first
Depends on AM-3 and fake CLIs. Implement exact reads/projections. Production may ship with current blockers. `observed` remains gated until reviewed fixtures match fresh complete live schemas. **Accept:** blocked fixtures yield exact null-payload envelopes; complete fake fixtures exercise success locally; fixture/config/nonzero cannot enable real success.

### AM-5 — hostile integration and later live gate
Depends on AM-1..4. Run fake executable integration first. A separately approved live run is read-only and expected to remain blocked. **Accept:** tracing shows only pinned processes and approved reads; no mutation/credential argument/secret/database/schema access; blocked execution leaves output/replay empty.

## Hostile tests

Cover wrong CLI/runtime/path/realpath/version/hash; writable/replaced dependencies; traversal/collision/symlink/hardlink; native swap; FD digest/malformed/inheritance; HOME/XDG/token injection; malicious project cwd; wrong account/session-rotation race; prompt/update/telemetry write; redirect/unapproved origin or method; pagination truncation; duplicate/unknown JSON/invalid UTF-8; stream/time/descendant limits; raw token/header/URL canaries; malformed/off-interval money; ID/name disagreement, pending deletion/tombstone/preview drift; all three blockers; fake success in production; and parent SIGKILL. Static tests forbid mutation commands/methods, token names, session filenames, direct HTTP, SQL/schema APIs, or child-buffer logging, and assert exactly 17 argv plus the unchanged outer four-variable environment.

## Decisive recommendation

Proceed through AM-4 with fake official-CLI fixtures and ship real adapters in fail-closed blocked mode. Do not weaken the runner, export credentials, trust ambient PATH/project state, or accept the current writable npm tree based on entrypoint hashes. Use a complete immutable plan-pinned tool bundle, FD-3 non-secret descriptor, passwd-derived standard session, explicit account/scope revalidation, and memory-only sanitization. Replace a blocker only when the pinned CLI freshly supplies every closed-schema fact; until then Wave AM creates no G0 evidence and no authority.
