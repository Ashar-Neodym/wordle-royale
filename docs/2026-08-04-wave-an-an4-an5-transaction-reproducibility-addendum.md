# Wave AN — AN-4/AN-5 transaction and reproducibility addendum

Date: 2026-08-04  
Owner: Elisa  
Status: architecture addendum only; no AN-4/AN-5 implementation, installation, provider execution, or authority granted  
Base reviewed: `acd0098e5983303a56b051272e77173dfc33c47d`

## 1. Decision, precedence, and stop line

This addendum closes the local publication transaction and reproducibility contracts left open by the Wave AN architecture. It is normative for AN-4 and AN-5 and supersedes conflicting wording in the parent document. In particular:

* AN-4 emits **data only**. Its install plan contains no command, argv, `sudo`, provider invocation, session operation, authentication material, or executable approval. The parent document's reference to putting a post-copy command in the plan is replaced by the inert validation selector below.
* AN-5 means two physically independent acquisitions, with all three provider outputs assembled from each acquisition: `2 acquisitions × 3 providers = 6 local publications`. “All three independent bundles reproduce” means the Vercel pair, Railway pair, and Supabase pair are each identical. It does **not** mean three builds of one provider, and the independent scanner is not a third build.
* The three provider outputs within either acquisition are physically independent trees. The corresponding outputs across the two acquisitions are also physically independent. No output may share a regular-file inode, hardlink, reflink, package directory, cache file, or writable backing tree with another output.
* Root installation, ownership changes to uid/gid 0, execution of a provider CLI, production validation against `/opt`, session/auth discovery, signing, deployment, and G0 retry remain out of scope. AN-4 and AN-5 must run unprivileged and stop with user-owned local evidence.

The existing AN-1 through AN-3 parser, resolver, copier, artifact generator, staging validator, and unchanged `validateProviderToolBundleForExecution` production policy remain prerequisites. AN-4 must not add a staging switch to that production validator.

## 2. Fixed names and artifact placement

### 2.1 Repository acquisition inputs

AN-5a shall commit the already reviewed acquisition bytes at these exact repository-relative paths:

```text
tools/g0-provider-acquisition/v1/package.json
tools/g0-provider-acquisition/v1/package-lock.json
```

The required SHA-256 values, without a prefix in `sha256sum` output and with `sha256:` in JSON, are:

| Path | SHA-256 |
|---|---|
| `tools/g0-provider-acquisition/v1/package.json` | `58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde` |
| `tools/g0-provider-acquisition/v1/package-lock.json` | `bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90` |

Before committing, AN-5a must compare these bytes to the existing reviewed inventory files and verify both hashes. This addendum records that the existing local inventory files were checked at the reviewed base and produced exactly those two hashes; their ownership/modes are not trusted and are not copied into the repository contract. The committed files are acquisition inputs, not the monorepo root package files and not an npm workspace.

### 2.2 Publication directory

`publicationParent` is an absolute caller-selected local directory. It and every ancestry component below the caller's trusted workspace must be owned by the invoking uid, must not be a symlink, and must have mode `0700`. The publisher creates one temporary sibling and one final child below a held descriptor for `publicationParent`:

```text
<publicationParent>/
  .an4-tmp-<128-bit-lowercase-hex>/       # private, noncanonical name, mode 0700
  <publicationId>/                        # final publication container, mode 0700
    bundle/                               # provider tree, existing AN-3 normalized modes
    bundle.tree-manifest.json             # mode 0400 locally
    descriptor.json                       # mode 0400 locally
    acquisition-record.json               # mode 0400 locally
    install-plan.json                     # mode 0400 locally
    publication-index.json                # mode 0400 locally; written penultimate
    COMMIT                                # mode 0400 locally; written last
```

`publicationId` is lowercase `<artifactId>-<first32hex>`, where `first32hex` is the first 32 hexadecimal characters of the SHA-256 of canonical `publication-index.json`. `artifactId` is exactly one of:

* `vercel-58.4.4`
* `railway-5.30.1`
* `supabase-2.110.0`

All names inside the publication are fixed. Unknown, missing, duplicate, case-colliding, non-UTF-8, linked, or special entries invalidate it. The temporary name and `publicationParent` never enter canonical bytes.

The tree manifest and descriptor are **outside** `bundle/`. The local manifest is adjacent to the local tree as `bundle.tree-manifest.json`. This avoids a self-hashing manifest and mirrors the production adjacency rule. Neither file is a tree-manifest entry.

### 2.3 Exact production destinations, data only

The immutable descriptor continues to bind these bundle roots:

| Artifact | Bundle root | Adjacent tree manifest | Metadata root |
|---|---|---|---|
| `vercel-58.4.4` | `/opt/wordle-royale/g0-provider-tools/vercel-58.4.4` | `/opt/wordle-royale/g0-provider-tools/vercel-58.4.4.tree-manifest.json` | `/opt/wordle-royale/g0-provider-tools/metadata/vercel-58.4.4` |
| `railway-5.30.1` | `/opt/wordle-royale/g0-provider-tools/railway-5.30.1` | `/opt/wordle-royale/g0-provider-tools/railway-5.30.1.tree-manifest.json` | `/opt/wordle-royale/g0-provider-tools/metadata/railway-5.30.1` |
| `supabase-2.110.0` | `/opt/wordle-royale/g0-provider-tools/supabase-2.110.0` | `/opt/wordle-royale/g0-provider-tools/supabase-2.110.0.tree-manifest.json` | `/opt/wordle-royale/g0-provider-tools/metadata/supabase-2.110.0` |

The exact metadata destinations below each metadata root are `descriptor.json`, `acquisition-record.json`, `install-plan.json`, `publication-index.json`, and `COMMIT`. These destinations are declarations only. AN-4/AN-5 do not create the metadata root or anything below `/opt`.

A later, separately approved installer must validate the complete local publication before copying. A later production loader reads `metadata/<artifactId>/descriptor.json` with closed parsing, canonical-byte and size checks, calls `validateProviderToolDescriptor`, and passes that descriptor and its fixed expected provider to the unchanged `validateProviderToolBundleForExecution`. That validator reads only the exact adjacent `<bundleRoot>.tree-manifest.json`, verifies it, and scans the production tree. It does not treat the local publication index as a substitute for production filesystem validation.

## 3. Canonical wire rules and closed schemas

Every JSON member below is UTF-8, recursively key-sorted canonical JSON followed by exactly one LF. Numbers are safe non-negative integers. Digests are lowercase `sha256:<64hex>`. Relative paths use `/`, are nonempty, normalized, and contain no absolute, empty, `.`, `..`, backslash, NUL, or case-colliding component. Parsers reject duplicate keys, unknown keys, invalid UTF-8, noncanonical bytes, and files over 256 KiB. Fixed arrays are in the order shown; set-like arrays are raw UTF-8 byte sorted.

### 3.1 Acquisition record

`acquisition-record.json` has exactly this shape:

```json
{
  "acquisitionInputs": {
    "lockfile": {
      "path": "tools/g0-provider-acquisition/v1/package-lock.json",
      "sha256": "sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90"
    },
    "packageJson": {
      "path": "tools/g0-provider-acquisition/v1/package.json",
      "sha256": "sha256:58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde"
    }
  },
  "canonicalSourceSnapshotSha256": "sha256:<64hex>",
  "networkPolicy": {
    "allowedDnsOnly": true,
    "allowedRegistryOrigin": "https://registry.npmjs.org/",
    "ambientCredentialsAllowed": false,
    "ambientProxyAllowed": false,
    "registryTlsOnly": true
  },
  "npmPolicy": {
    "audit": false,
    "fund": false,
    "ignoreScripts": true,
    "installOperation": "ci"
  },
  "schemaVersion": "wordle-royale-g0-acquisition-record/v1",
  "target": {
    "cpu": "x64",
    "libc": "glibc",
    "os": "linux"
  },
  "toolchain": {
    "node": {
      "path": "/home/ashar/.nvm/versions/node/v26.3.0/bin/node",
      "realpath": "/home/ashar/.nvm/versions/node/v26.3.0/bin/node",
      "sha256": "sha256:5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926",
      "version": "v26.3.0"
    },
    "npm": {
      "path": "/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js",
      "realpath": "/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js",
      "sha256": "sha256:8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7",
      "version": "11.16.0"
    }
  }
}
```

The two physical acquisitions intentionally produce the same record when reproducible. Run label, source absolute path, cache path, uid, inode, time, hostname, and trace filename belong only in the noncanonical acceptance evidence directory, never in this record.

`canonicalSourceSnapshotSha256` is not the existing AN-3 copier race witness. AN-4a defines it as the hash of canonical `wordle-royale-g0-canonical-source-snapshot/v1`: the raw-byte-sorted physical package-path set resolved from the lock, all package payload directories and regular files reachable from those roots, file SHA-256 values, and the output-normalized mode each node would receive. It includes all three root dependency closures, excludes only every `node_modules/.bin`, contains no inode/dev/uid/gid/time/source absolute path, and is independently rescanned before publication. The current `sourceSnapshotSha256` returned by the copier remains a per-run race witness and must be checked during staging validation, but it is not published because it binds physical inode metadata and therefore cannot reproduce across independent trees.

The hashed source-snapshot document is retained as AN-5 evidence (not as a publication member) and has exactly this shape:

```json
{
  "entries": [
    {
      "mode": 365,
      "path": "<exact lock package path or owned descendant>",
      "type": "directory"
    },
    {
      "mode": 292,
      "path": "<exact lock package path or owned descendant file>",
      "sha256": "sha256:<64hex>",
      "type": "file"
    }
  ],
  "packagePaths": ["<exact nonempty lock packages-map key>"],
  "schemaVersion": "wordle-royale-g0-canonical-source-snapshot/v1",
  "target": {
    "cpu": "x64",
    "libc": "glibc",
    "os": "linux"
  }
}
```

`entries` and `packagePaths` are each raw-UTF-8 byte sorted and duplicate-free. Directory mode is decimal `365` (`0555`); ordinary file mode is decimal `292` (`0444`); only the two already pinned Railway and Supabase native paths use file mode `365`. The document walks each physical package's owned payload exactly once: a descendant physical package root is not recursively charged to its ancestor and is scanned from its own `packagePaths` entry. Root `package.json`, root `package-lock.json`, `.bin`, npm cache/config/logs, and `node_modules/.package-lock.json` are not source-package payload entries; their exact acquisition-input hashes are bound separately by the acquisition record. Symlinks outside ignored `.bin`, hardlinks, special files, untracked nested package roots, missing lock package roots, and conflicting ownership of a path invalidate the snapshot. The document is capped at 4 MiB and 20,000 nodes; exceeding either bound fails rather than truncates.

### 3.2 Inert install plan

`install-plan.json` has exactly this shape:

```json
{
  "artifactId": "<closed artifactId>",
  "destinations": {
    "acquisitionRecord": "<absolute metadata root>/acquisition-record.json",
    "bundleRoot": "<exact absolute bundle root>",
    "commit": "<absolute metadata root>/COMMIT",
    "descriptor": "<absolute metadata root>/descriptor.json",
    "installPlan": "<absolute metadata root>/install-plan.json",
    "publicationIndex": "<absolute metadata root>/publication-index.json",
    "treeManifest": "<exact absolute bundle root>.tree-manifest.json"
  },
  "privilegedExecutionAuthorized": false,
  "productionValidation": {
    "descriptorSource": "descriptor.json",
    "expectedArtifactId": "<closed artifactId>",
    "validatorExport": "validateProviderToolBundleForExecution",
    "validatorModule": "scripts/g0-provider-tool-bundle.mjs"
  },
  "publicationPolicy": {
    "atomicNoReplaceRequired": true,
    "copyRegularFilesRequired": true,
    "hardlinksForbidden": true,
    "safeRootOwnedAncestryRequired": true,
    "separateHumanApprovalRequired": true
  },
  "requiredMetadata": {
    "directoryMode": 365,
    "fileMode": 292,
    "gid": 0,
    "uid": 0
  },
  "schemaVersion": "wordle-royale-g0-inert-install-plan/v1",
  "sources": {
    "acquisitionRecord": "acquisition-record.json",
    "bundleRoot": "bundle",
    "commit": "COMMIT",
    "descriptor": "descriptor.json",
    "installPlan": "install-plan.json",
    "publicationIndex": "publication-index.json",
    "treeManifest": "bundle.tree-manifest.json"
  }
}
```

Decimal `365` is `0555`; decimal `292` is `0444`. Bundle node modes come only from the manifest. The plan contains no `command`, `commands`, `argv`, shell, interpreter, `sudo`, delete operation, wildcard, provider executable, session field, auth field, credential location, token, environment, approval identity, or mutable authorization bit. `privilegedExecutionAuthorized` is required to be the literal `false`; a `true` value is invalid rather than an approval mechanism. Source names are publication-relative and destinations are exact absolute paths. The validation selector is inert identity data, not an invocation recipe.

The human installation gate is a separate future card, `AN-INSTALL-1`, outside Wave AN. Approval must be explicit for one indexed publication and one artifact destination set, must occur after AN-5 evidence review, and must not be stored by changing this plan. No such approval currently exists.

### 3.3 Publication index

`publication-index.json` has exactly this shape:

```json
{
  "artifactId": "<closed artifactId>",
  "canonicalSourceSnapshotSha256": "sha256:<64hex>",
  "members": {
    "acquisitionRecord": {
      "mode": 256,
      "path": "acquisition-record.json",
      "sha256": "sha256:<64hex>"
    },
    "bundle": {
      "path": "bundle",
      "treeManifestSha256": "sha256:<64hex>"
    },
    "descriptor": {
      "mode": 256,
      "path": "descriptor.json",
      "sha256": "sha256:<64hex>"
    },
    "installPlan": {
      "mode": 256,
      "path": "install-plan.json",
      "sha256": "sha256:<64hex>"
    },
    "treeManifest": {
      "mode": 256,
      "path": "bundle.tree-manifest.json",
      "sha256": "sha256:<64hex>"
    }
  },
  "schemaVersion": "wordle-royale-g0-local-publication-index/v1",
  "sourceRevision": "<40 lowercase git hex>"
}
```

Decimal `256` is local mode `0400`. `sourceRevision` is the exact reviewed assembler source commit, with a clean tracked worktree attested separately by AN-5. `members.bundle.treeManifestSha256` is the SHA-256 of canonical manifest bytes and, per the existing AN-3 definition, is also the bundle-tree digest. The manifest itself binds every tree path, type, normalized mode, and regular-file byte hash. The index separately binds the exact manifest bytes, descriptor, inert plan, acquisition record, canonical source snapshot, and assembler source revision. It does not include itself or `COMMIT`, so there is no hash cycle.

The descriptor hash in the index binds its fixed final absolute root, runtime, profile, entrypoint/native pins, package metadata, and manifest hash. The acquisition-record hash binds the committed package/lock inputs and acquisition tool/policy. Thus replacing any tree byte, mode, manifest, descriptor, plan, acquisition fact, source snapshot, or source revision invalidates the publication.

### 3.4 Commit record

`COMMIT` has exactly this shape and no other fields:

```json
{
  "publicationIndexSha256": "sha256:<64hex>",
  "schemaVersion": "wordle-royale-g0-local-publication-commit/v1"
}
```

It is canonical JSON plus LF despite its extensionless name. It is created last and binds canonical `publication-index.json`. A directory without a valid `COMMIT`, with a commit not matching its index, or whose fully rederived index differs is not a publication.

## 4. AN-4 filesystem transaction

### 4.1 Helper boundaries

AN-4 has four non-overlapping boundaries:

1. **Existing assembler/copy helper:** creates only `bundle/` in a new empty private temporary container. It retains AN-1/AN-2 source race checks and never publishes.
2. **Existing independent staging validator plus AN-4 source-snapshot scanner:** rescans `bundle/`, rederives manifest/descriptor and the canonical source snapshot, and returns immutable canonical bytes. It cannot rename, install, or execute a provider.
3. **New local publisher native helper:** performs only descriptor-relative create, write, chmod, fsync, `renameat2`, and identity-safe cleanup below a caller-opened `publicationParent`. It accepts one bounded canonical frame and inherited directory/file descriptors, not arbitrary commands or environment. It has no socket API and spawns nothing.
4. **New read-only publication validator/third scanner:** opens the final parent and publication with no-follow descriptors, parses every closed member, independently scans all paths/bytes/modes twice, rederives manifest/index/commit/publication id, and returns a digest report. It has no mutation or replay path.

JavaScript path resolution is not the transaction boundary. The native helper uses `openat2(RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_MAGICLINKS|RESOLVE_NO_XDEV)` where available and reviewed `openat`/`fstatat`/held-fd equivalence otherwise. Destination creation uses `O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC`; all regular files require `nlink == 1`; every opened descendant must remain on the publication parent's device.

### 4.2 Ordered protocol

The publisher performs this exact sequence for one provider:

1. Open and verify every trusted ancestry component and `publicationParent`; hold the parent fd for the whole transaction. Require invoking-uid ownership, `0700`, no symlink/magiclink, and one filesystem for parent, temp, and final.
2. Independently test absence of the deterministic final name with `fstatat(..., AT_SYMLINK_NOFOLLOW)`. Presence does not authorize mutation; it enters only the replay/collision path in section 4.4.
3. Create `.an4-tmp-<128-bit-hex>` with `mkdirat(...,0700)` and fail on collision rather than reuse. Open it no-follow, record `(dev,ino)`, and hold its fd.
4. Invoke AN-1..AN-3 into `bundle/` under that held temp fd. Validate the bundle twice. Generate canonical manifest and descriptor from the second scan. Independently compute the canonical source snapshot.
5. Create `bundle.tree-manifest.json`, `descriptor.json`, `acquisition-record.json`, and `install-plan.json` exclusively as `0600`; write from bounded held bytes; `fdatasync`/`fsync` each while open; set `0400`; re-`fstat` and rehash from the same fd.
6. Fsync every bundle regular file after its final bytes/mode. Fsync bundle directories bottom-up after their children and final `0555` modes. Fsync the temp publication directory after the bundle and four sidecars exist.
7. Rederive the complete bundle scan and all member hashes from held descriptors. Create `publication-index.json` exclusively, write canonical bytes, fsync, set `0400`, rehash, and fsync the temp directory. The index is penultimate.
8. Derive the final `publicationId` from the index. Recheck final-name absence. Create `COMMIT` exclusively, write canonical bytes, fsync, set `0400`, rehash, then fsync the temp directory. `COMMIT` is the last member created.
9. Run the complete read-only publication validator through the held temp fd. No acceptance check may trust only in-memory intended writes.
10. Atomically publish with Linux `renameat2(parentFd,tempName,parentFd,publicationId,RENAME_NOREPLACE)`. There is no fallback to plain `rename`, link/unlink, replace, exchange, copy, or `--force`; `ENOSYS`, unsupported filesystem, collision, or parent identity change fails closed.
11. Fsync `publicationParent`, reopen the final name no-follow, require the recorded temp `(dev,ino)`, and run the complete validator again. Return `PUBLISHED` only after this succeeds.

Every successful return has one final, complete, durable publication. A crash before rename exposes only an invalid temp name. A crash after rename exposes either no final name or a complete commit-bound directory; consumers still require full validation. Parent-fsync failure is an error even if a complete name is visible; a later invocation may recognize it only through full identical replay.

### 4.3 Consumer acceptance rule

A consumer accepts only a child whose name exactly matches the rederived publication id and for which all of the following hold in one descriptor-relative, two-scan validation:

* container owner is the invoking uid, mode is exactly `0700`, ancestry is safe, and all nodes are on one device;
* the seven fixed members and no others exist, all files are regular/single-link, and all local modes are exact;
* bundle bytes and modes exactly reproduce the canonical tree manifest;
* manifest and descriptor pass existing provider-indexed bounds and closed AN-3 validation;
* descriptor points to the fixed production root, never the local or temp root;
* acquisition record and install plan pass their closed schemas;
* index rederives byte for byte, binds the canonical source snapshot, and hashes every member;
* `COMMIT` hashes that exact index; and
* the two complete scans, including identities and metadata, are equal.

Neither existence of `COMMIT` alone nor a successful assembler report is sufficient.

### 4.4 No-overwrite replay and collision semantics

If the final child already exists, the publisher performs no write, chmod, timestamp update, lock creation, cleanup, or rename against it. It opens it read-only/no-follow and runs the complete validation above. It then compares the newly rederived intended index and every canonical member/tree byte and mode:

* exact equality after full revalidation returns `ALREADY_PUBLISHED_IDENTICAL`;
* any invalidity returns `PUBLICATION_COLLISION_INVALID`;
* any valid but nonidentical content returns `PUBLICATION_COLLISION_DIFFERENT`.

Replay never trusts the deterministic name or commit hash as a shortcut. It reads and hashes every regular file and checks every mode. Access time must be disabled by mount policy or opened with `O_NOATIME` where permitted so replay is observably read-only; atime is excluded from canonical data but replay tests still assert no representable metadata mutation.

Two concurrent publishers can both stage, but `RENAME_NOREPLACE` permits only one winner. The loser validates the winner; it may return identical only after full byte/mode equality, otherwise collision. No publisher waits on or deletes another publisher's temp tree.

### 4.5 Failure and race-safe cleanup

Each process may remove only the temp tree whose random name it created and whose `(dev,ino)` still equals its held root descriptor. Cleanup walks bottom-up through held descriptors with no-follow `unlinkat`; before each unlink it verifies the named entry still identifies the opened inode. If a name was replaced, detached, mounted over, hardlinked, or no longer identifies the recorded inode, cleanup stops for that branch, preserves the replacement, emits `CLEANUP_IDENTITY_LOST`, and never follows or removes it. The final publication name and any pre-existing name are never cleanup targets.

Successful AN-4 removes its private scratch only after final validation. Failed acquisition/staging scratch, caches, and homes are eligible for the same identity-safe cleanup. Cleanup failure cannot convert a failed transaction into success and must be recorded for manual unprivileged review. No recursive path-based `rm -rf`, wildcard, parent traversal, privilege escalation, or attacker-owned replacement removal is allowed.

## 5. AN-5 acquisition isolation and reproducibility

### 5.1 Two physically independent acquisitions

The AN-5 harness creates `acquisition-a` and `acquisition-b` under two new empty owner-only roots. For each acquisition it creates separate, initially empty, mode-`0700` directories for source, `HOME`, npm cache, npm config, trace, scratch, and publications. The roots must have distinct directory inodes. After each `npm ci`, scanners prove that no regular-file `(dev,ino)` occurs in both source trees and that no file has `nlink != 1`. Reflink/copy-on-write clone APIs are forbidden; acquisition B is not copied from A, the repository's `node_modules`, the inventory tree, or acquisition A.

The only files placed in each empty source before npm are byte copies of the two committed acquisition inputs. Their hashes are checked before and after each acquisition. No workspace files, existing `node_modules`, lock sidecar, npm log, package manager state, or project `.npmrc` is admitted.

The pinned tool identities are exactly:

* Node path and realpath `/home/ashar/.nvm/versions/node/v26.3.0/bin/node`, version `v26.3.0`, SHA-256 `5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926`;
* npm CLI path and realpath `/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js`, version `11.16.0`, SHA-256 `8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7`.

The harness verifies realpaths, owner/mode/link count, hashes, and versions immediately before and after each npm process. It executes npm only as the pinned Node program with the pinned npm CLI file; it never resolves either from `PATH`.

Each acquisition's generated `.npmrc` is a new mode-`0600` regular single-link file with exactly:

```ini
registry=https://registry.npmjs.org/
always-auth=false
ignore-scripts=true
audit=false
fund=false
strict-ssl=true
```

The environment is an allowlist containing only deterministic locale/timezone, target, isolated path, and npm locations: `LANG=C.UTF-8`, `LC_ALL=C.UTF-8`, `TZ=UTC`, `HOME=<that acquisition home>`, `PATH=/usr/bin:/bin`, `npm_config_userconfig=<that acquisition npmrc>`, `npm_config_globalconfig=<a separate empty acquisition-owned npmrc>`, `npm_config_prefix=<an empty acquisition-owned prefix>`, `npm_config_cache=<that acquisition empty cache>`, `npm_config_registry=https://registry.npmjs.org/`, `npm_config_ignore_scripts=true`, `npm_config_audit=false`, and `npm_config_fund=false`. The harness explicitly removes every variable whose case-insensitive name contains `proxy`, `token`, `auth`, `credential`, `session`, `vercel`, `railway`, `supabase`, `npmrc`, or `npm_config` before adding only the listed `npm_config_*` keys. It also removes `NODE_OPTIONS`, `NODE_PATH`, `INIT_CWD`, `NPM_TOKEN`, `CI_JOB_TOKEN`, `SSH_AUTH_SOCK`, `GIT_ASKPASS`, and cloud/provider variables. There is no inherited user/global/project npmrc.

The only acquisition operation is equivalent to this argv vector, executed without a shell:

```text
[
  "/home/ashar/.nvm/versions/node/v26.3.0/bin/node",
  "/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js",
  "ci",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--registry=https://registry.npmjs.org/",
  "--userconfig=<that acquisition npmrc>",
  "--cache=<that acquisition empty cache>"
]
```

This argv is acceptance-harness data and is never placed in `install-plan.json` or a publication. `npm ci` must leave package and lock bytes unchanged. No lifecycle script, package binary, provider CLI, git client, shell, credential helper, session helper, or postinstall process may execute.

### 5.2 Unprivileged network and process tracing

AN-5 performs no firewall, network-namespace, routing, resolver, or other privileged mutation. Each acquisition runs under lossless unprivileged `strace -f` process/network/file-exec tracing with a new owner-only trace file. The harness records the exact lockfile `resolved` origins, generated npm configuration, resolver addresses read from the host's existing resolver configuration, npm's requested URLs, process ids, and every observed `socket`, `connect`, `sendto`, `recvfrom`, `execve`, `clone`, `fork`, and `vfork`. It does not claim preventative egress confinement that an ordinary user cannot enforce.

Acceptance is nevertheless closed over observed behavior: every lockfile package URL and npm-requested HTTP origin must be exactly `https://registry.npmjs.org/`; every external TCP connection must use port 443 and correspond to addresses resolved for that origin during the run; DNS traffic may target only the pre-recorded host resolver addresses on port 53. Proxies are absent from the environment and configs. Registry redirects or package URLs to another origin, listening sockets, metadata-service traffic, localhost proxy traffic, provider endpoints, unknown external destinations, trace loss/truncation, or an unavailable tracer make the acquisition failing rather than widening policy. This is trace-attested registry-only acquisition, not a firewall guarantee.

The complete process trace may contain only the harness/tracer and the pinned Node process running npm. Any lifecycle, package binary, provider CLI, shell, git client, credential helper, or other npm child process is a failure. After npm exits, all three assemblies and publications are run under a separate lossless trace that must contain zero `socket` or `connect` syscalls and only the reviewed assembler, pinned Python copy helper, publisher helper, and scanner boundaries. No provider CLI is executed.

### 5.3 Six outputs and third-scanner comparison

For each acquisition, invoke AN-4 once for Vercel, once for Railway, and once for Supabase, into three empty publication parents. This yields:

```text
acquisition-a: vercel-a, railway-a, supabase-a
acquisition-b: vercel-b, railway-b, supabase-b
```

All six bundle roots must have pairwise-disjoint regular-file `(dev,ino)` sets and `nlink == 1`; no hardlinks/reflinks or package directories are shared. The publication parent/container identities are expected to differ and are evidence, not canonical data.

A third scanner means an implementation that does not import publisher/index-generation functions and does not trust assembler reports. It parses canonical JSON with its own duplicate-key rejection, walks by held descriptors, hashes every regular file, records every mode and relative path, and computes comparison reports. It compares:

1. Vercel A to Vercel B;
2. Railway A to Railway B; and
3. Supabase A to Supabase B.

For each pair it requires equality of every bundle path, type, normalized mode, and file byte; manifest bytes; descriptor bytes; acquisition-record bytes; install-plan bytes; publication-index bytes; `COMMIT` bytes; canonical source snapshot; derived publication id; package closure/path set; and all declared hashes. It also independently validates each publication before comparing it. It reports inode separation, rather than inode equality. Temporary path, container inode, atime/mtime/ctime, trace path, acquisition label, and uid are compared as noncanonical isolation evidence and must satisfy the difference/policy assertions, but they are not publication bytes.

Comparison also covers artifacts copied to a disposable **unprivileged simulation root** using a test-only destination mapping and regular copies, never `/opt`, never uid/gid 0. The scanner proves the simulated copied bytes/modes match their source publications and that no overwrite occurred. This simulation is not production validation, installation, or authority and must not call `validateProviderToolBundleForExecution` against a user-owned tree.

## 6. Bite-sized delivery cards

### AN-4a — closed metadata and independent publication validator

**Depends on:** clean AN-1..AN-3 and this addendum.  
**Implement:** canonical source-snapshot scanner; acquisition record, inert plan, index, and commit schema compilers/parsers; fixed destination table; descriptor-relative read-only publication validator. Do not rename or install yet.  
**Accept:** closed-schema, duplicate-key, canonicalization, path, cap, forbidden-plan-key/value, descriptor/final-root, manifest-outside-tree, source-snapshot, omission/swap/hash/mode, index/commit cycle-avoidance, and two-scan race fixtures all fail closed. A valid fixture rederives every byte without importing the writer.

### AN-4b — fsynced no-replace publisher and replay

**Depends on:** AN-4a.  
**Implement:** private same-filesystem temp creation; held-fd writes; file/directory fsync ordering; index penultimate; commit last; `renameat2(RENAME_NOREPLACE)`; parent fsync; full identical replay; identity-safe cleanup.  
**Accept:** deterministic fault injection at every create/write/chmod/fsync/validation/rename/reopen/parent-fsync step, process kill points, two-publisher races, temp/final collision, parent/child replacement, mount/link/special-node attacks, and cleanup replacement fixtures expose no accepted partial, overwrite no byte, preserve attacker replacements, and spawn no command.

### AN-5a — committed inputs and two isolated acquisitions

**Depends on:** AN-4b and explicit review of the pinned Node/npm identities.  
**Implement:** commit the two exact input files; create two fresh independent source/home/config/cache/trace roots; run exactly one unprivileged, losslessly traced pinned `npm ci` in each with only the closed registry origin observed; compute independent canonical source snapshots.  
**Accept:** both package/lock hashes match before and after; source snapshots match; no shared inode/reflink, ambient config/credential/proxy, lifecycle/provider child, unapproved socket, or trace loss exists. A third acquisition is not required.

### AN-5b — six-publication reproducibility and regressions

**Depends on:** successful AN-5a evidence.  
**Implement:** produce three provider publications from each source while network-denied; compare every byte/mode/artifact/publication member with the independent scanner; run unprivileged copy simulation and unchanged Wave AM/G0 tests.  
**Accept:** each corresponding provider pair is byte/mode identical; all six physical trees are pairwise independent; publisher/scanner reports agree; no socket/provider/root/session/auth activity occurs; hostile AN-4 tests and unchanged AM/G0 baseline pass. Stop before `AN-INSTALL-1`.

## 7. Verification commands and expected evidence

These are implementation-card verification commands, not commands embedded in an install plan. They must run as the ordinary user. No command below invokes a provider CLI or writes `/opt`.

### AN-4a

```sh
node --check scripts/g0-provider-bundle-publication-schema.mjs
node --check scripts/g0-provider-bundle-publication-validator.mjs
node --test scripts/g0-provider-bundle-publication-validator.test.mjs
```

Expected evidence: TAP success; fixture count and names for every closed-schema/member/snapshot/race case; a scanner report containing provider artifact id, member hashes, canonical source snapshot, two-scan equality, and `publicationValid:true`. It must contain no credentials or local source absolute path.

### AN-4b

```sh
/usr/bin/python3 -m py_compile scripts/g0-bundle-publication-helper.py
node --check scripts/g0-provider-bundle-local-publisher.mjs
node --test scripts/g0-provider-bundle-local-publisher.test.mjs
node --test scripts/g0-provider-bundle-local-publisher-faults.test.mjs
```

Expected evidence: TAP success over every fault point; syscall trace proving `renameat2(...,RENAME_NOREPLACE)` and ordered fsyncs; one `PUBLISHED`, one fully validated `ALREADY_PUBLISHED_IDENTICAL` in the identical race; collision for different bytes; no accepted temp/partial; cleanup report proving replacement preservation; zero spawned privileged/provider process.

### AN-5a

```sh
sha256sum tools/g0-provider-acquisition/v1/package.json tools/g0-provider-acquisition/v1/package-lock.json
node --test scripts/g0-provider-bundle-acquisition-isolation.test.mjs
node scripts/g0-provider-bundle-acquisition-harness.mjs --evidence-root "$AN5_EVIDENCE_ROOT"
```

Expected first-command output:

```text
58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde  tools/g0-provider-acquisition/v1/package.json
bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90  tools/g0-provider-acquisition/v1/package-lock.json
```

Expected harness evidence: clean source revision; tool path/realpath/version/hash pre/post records; package/lock pre/post hashes; two distinct source/cache/home/config inode inventories; canonical source snapshot equality; complete process tree; lossless unprivileged DNS/socket/exec trace showing only approved resolver traffic and `registry.npmjs.org:443`; no lifecycle/provider child; explicit cache/config/environment allowlist; no token values. `AN5_EVIDENCE_ROOT` must be a new empty owner-only absolute directory.

### AN-5b

```sh
node --test scripts/g0-provider-bundle-reproducibility.test.mjs
node scripts/g0-provider-bundle-third-scanner.mjs --evidence-root "$AN5_EVIDENCE_ROOT" --compare-all
pnpm test:g0:provider-tool-bundle
pnpm test:g0:sanitized-provider-runtime
pnpm test:g0:readonly-provider-adapters
pnpm test:g0:retry-evidence-collector
```

Expected evidence: six valid publication reports; three pair reports named `vercel-a-b`, `railway-a-b`, and `supabase-a-b`, each with all byte/mode/member equality flags true; pairwise inode-disjoint report for all six trees; unprivileged copy-simulation equality/no-overwrite report; zero successful assembly sockets; zero provider/root/session/auth activity; all unchanged AM/G0 TAP suites green.

The harness must also preserve the exact invoked argv and environment **in the restricted evidence directory only**, with secret-value scanning. It must not put acquisition argv, traces, absolute source paths, or timestamps into canonical publication members.

## 8. Acceptance matrix

AN-4/AN-5 are complete only when all of these are demonstrated:

1. Publication parent/container is owner-only `0700`; temp and final are same filesystem; all traversal and cleanup are descriptor-relative.
2. Every output file and directory is fsynced in the specified order; index is penultimate, `COMMIT` is last, rename is Linux no-replace, and parent is fsynced.
3. No crash/fault/race yields a consumer-valid partial. No existing final or attacker replacement is overwritten, chmodded, deleted, or followed.
4. Replay is fully read-only and succeeds only after complete two-scan revalidation and byte/mode equality.
5. Manifest and descriptor remain outside the bundle; the manifest is adjacent locally and at the exact production destination; production consumption uses the descriptor and unchanged production validator as specified.
6. The inert plan has the exact closed schema, literal `privilegedExecutionAuthorized:false`, relative source names, exact final roots/metadata destinations, and no command/argv/`sudo`/provider execution/session/auth/credential content.
7. Index and commit bind the exact bundle tree manifest/digest, descriptor, plan, acquisition record, canonical source snapshot, and assembler source revision without a hash cycle.
8. Exact acquisition package and lock inputs are committed only after hash verification. Pinned Node/npm path/realpath/version/hash checks pass before and after both acquisitions.
9. Acquisition A and B have isolated HOME/npmrc/global-config/prefix/cache/source/trace roots, no ambient credentials/proxies/config, trace-attested closed registry-only network observations, ignored scripts, disabled audit/fund, and lossless socket/process traces. No privileged network enforcement is claimed or performed.
10. Three outputs are built from each acquisition. All six trees are physically independent. A third independent scanner compares every byte, mode, artifact, publication member, and unprivileged copied artifact.
11. The three corresponding provider pairs reproduce exactly. This is the sole meaning of “all three independent bundles reproduce.”
12. No provider CLI, root operation, production installation, session/auth lookup, deployment, or G0 retry occurs. A separate human approval/install card remains ungranted.

## 9. Evidence retention and cleanup

Keep the six final local publications, three pair reports, tool/input hash records, process/socket traces, source-snapshot reports, inode-separation inventory, fault matrix, regression logs, and secret-scan result until independent review. Evidence directories are owner-only `0700`; trace files are `0600`; canonical publication members retain the modes specified above. Evidence records may contain local paths and times but must contain no credential values.

After review, acquisition source trees, isolated homes, npmrc files, caches, and failed temps are removed only by the identity-safe cleanup policy in section 4.5. Final publications are removed only by an explicit separate unprivileged evidence-retention decision naming their recorded `(dev,ino)`; never by wildcard or age-based sweeping. A cleanup identity mismatch preserves the unexpected node and fails for manual review. Nothing under `/opt` is created, modified, validated, or cleaned by AN-4/AN-5.

## 10. Recommendation

Implement AN-4a, AN-4b, AN-5a, and AN-5b in that order. Review the two traced acquisitions and three independent pair comparisons, then stop. A complete local publication is reproducible installation input only; it is not a root-owned production bundle, provider authorization, session authority, live evidence, or permission to install or execute anything.
