# Wave AN — deterministic G0 provider bundle assembler architecture

Date: 2026-08-04
Status: architecture decision; local implementation and hostile fixtures may follow
Base: `b321424a1001976a3b2563b349be71043745e178`

## Decision and boundary

Build three independent, deterministic artifacts—one each for Vercel `58.4.4`, Railway `5.30.1`, and Supabase `2.110.0`—from an already prepared npm source tree and the exact reviewed lockfile. The assembler is an unprivileged, local-only transformer. It does not run npm, package scripts, CLIs, provider calls, sessions, credential discovery, retries, deployment, signing, or privileged installation. It neither needs nor accepts a token, `HOME`, provider scope, URL, arbitrary command, or network access. Network-denial tests are part of acceptance.

The approved production targets are explicit inputs and, for this package set, are fixed to:

* `/opt/wordle-royale/g0-provider-tools/vercel-58.4.4`
* `/opt/wordle-royale/g0-provider-tools/railway-5.30.1`
* `/opt/wordle-royale/g0-provider-tools/supabase-2.110.0`

Each output contains only its provider's transitive closure; no package directory or inode is shared between outputs. Its canonical manifest is installed adjacent to, never inside, the root as `<bundleRoot>.tree-manifest.json`, matching `validateProviderToolBundleForExecution`. A canonical descriptor targets the exact **final absolute** root above, not a build/staging path. Rebuilding for another final root deliberately changes descriptor bytes and is not the same artifact.

Wave AN does not weaken Wave AM. In particular, the existing production validator's root ownership, safe ancestry, non-writability, single-link files, complete pre/post snapshots, runtime pin, and manifest checks remain mandatory. A successful local assembly is not a production-valid bundle and authorizes no copy, ownership change, adapter execution, or G0 retry.

## Inputs and honest trust statement

The reviewed acquisition declaration pins:

* root `package.json`, SHA-256 `58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde`;
* lockfile v3 `package-lock.json`, SHA-256 `bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90`;
* exact direct dependencies `vercel@58.4.4`, `@railway/cli@5.30.1`, and `supabase@2.110.0`;
* target tuple `linux/x64/glibc`, and separately approved exact Node and npm executable realpaths, versions, and hashes used for acquisition;
* production runtime `/usr/bin/node`, version `v18.19.1`, SHA-256 `f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d`; and
* the Wave AN assembler source revision/hash and closed provider policy.

A fresh source is prepared in a new empty, owner-only, non-project directory with command data equivalent to:

```text
<approved-npm> ci --ignore-scripts --no-audit --no-fund
```

The exact package and lock bytes are copied in first; no existing `node_modules`, npm configuration, workspace, or lifecycle environment is admitted. Acquisition should use an isolated cache/config and a separately approved network or populated-cache phase. The local assembler only consumes the completed tree after network isolation is in force. It rejects lock/package drift and an incomplete or extraneous install.

This pinning is integrity, not provenance or safety proof. Lock `integrity` binds downloaded tarball bytes; it does not prove publisher identity, absence of malicious package code, registry correctness, npm correctness, or safety when the CLI later executes. `--ignore-scripts` prevents lifecycle scripts during acquisition, but does not make shipped JavaScript or native binaries trustworthy. Node, npm, registry/cache, the reviewed lock, platform selection, assembler, and later privileged installer remain trust inputs. The current 414 MiB user-owned tree at `/home/ashar/.hermes/profiles/athena/tools/wordle-g0-provider-tools` is an inventory/measurement source only, never a production trust root.

## Lockfile closure

Parse JSON with duplicate-key rejection, bounded depth/string/count/bytes, and a closed lockfile-v3 shape sufficient for resolution. Never execute package metadata. The lock `packages` map and the installed physical layout are authoritative; the legacy dependency summary is not.

For each provider, begin at its exact direct package path and compute a fixed point over `dependencies`, `optionalDependencies`, and `peerDependencies`:

1. Resolve an edge exactly as CommonJS package lookup would resolve a package directory from the referring physical package: its own `node_modules/<name>`, then each ancestor package location's `node_modules/<name>`, ending at the source root. Scoped names are one logical name. Paths must be normalized UTF-8 relative paths with no empty, dot, backslash, NUL, absolute, or case-colliding component.
2. The resolved path must be a lock `packages` record and a real installed package directory whose `name`/`version` and lock version agree. Validate the dependency/peer range using npm-compatible semver; never select by object order or “closest version.” A required unresolved or incompatible edge fails.
3. Include compatible optional dependencies present for the exact declared OS/CPU/libc tuple. A compatible optional edge absent from the npm-ci result fails; an incompatible optional record is excluded. Optional peer absence is allowed only when `peerDependenciesMeta[name].optional === true`; if present, it must resolve, satisfy its range, and enter the closure. Required peers must resolve and enter it.
4. Reject lock links/workspaces, file/git/directory sources, missing integrity for registry packages, packages marked for another included platform, and physical packages not represented by the lock. Record why every excluded optional record is incompatible.
5. Iterate in raw UTF-8 byte order to a bounded fixed point. The result is the set of exact physical lock paths, not merely package names; two installed versions are distinct nodes.

Materialization copies the complete payload owned by every selected package directory. “Complete” means every directory and regular file under that package, except descendant package roots (materialized independently) and `node_modules/.bin`. `.bin` launchers are generated conveniences and are ignored whether file or symlink; they never enter closure, output, or manifests. Any other untracked nested `node_modules` content, missing payload node, or source node not attributable to the lock fails. Do not cherry-pick an entrypoint or native binary.

The independent output root additionally contains the exact root `package-lock.json` and one generated invocation profile. It does not contain the source root `package.json`, npm cache, `node_modules/.package-lock.json`, logs, descriptor, install plan, or manifest. Provider-package `package.json` remains present as part of its complete directory.

## Hostile source walk and race resistance

Treat the source as adversarial even when user-owned. A Linux implementation uses descriptor-relative traversal (`openat2` with `RESOLVE_BENEATH|RESOLVE_NO_SYMLINKS|RESOLVE_NO_MAGICLINKS`, or an equivalently reviewed native helper), never string-only `realpath` followed by reopening. Hold parent directory descriptors while enumerating. Reject every source symlink outside the explicitly ignored `.bin`, hardlink (`nlink != 1` or repeated `dev:ino`), socket, FIFO, device, mount crossing, sparse/oversized file, non-regular/non-directory node, invalid UTF-8 name, traversal, and case collision.

Open each file read-only/no-follow, compare `lstat` with `fstat`, stream hash and copy from that same descriptor, then compare identity, size, mode, link count, ctime, and mtime again. Snapshot directory identity/metadata before and after children and perform a second complete source walk after staging. A changed path, directory entry set, inode, metadata, or bytes fails and deletes staging. Bounds are enforced while discovering and streaming, before allocation. Tests race rename/replacement/truncate/chmod/link operations before, during, and after copy. Merely comparing pre/post path hashes is not an acceptable substitute for descriptor-relative copying.

Destination creation is also descriptor-relative with exclusive create, no-follow, and single-link checks. No source metadata, timestamp, owner, xattr, ACL, capability, or hardlink is preserved.

## Canonical contents, modes, profile, manifest, and descriptor

Normalize names/order by raw UTF-8 bytes. Set every directory to `0555` and ordinary file to `0444`. Only the exact pinned Railway native `node_modules/@railway/cli/bin/railway` and Supabase native `node_modules/@supabase/cli-linux-x64/bin/supabase` are `0555`; Vercel's JS entrypoint remains `0444` because the pinned runtime opens it. Reject setuid/setgid/sticky bits and xattrs/capabilities in staging. Timestamps are excluded from the contract and set to a fixed epoch where the filesystem supports it; bytes and manifest remain the authority.

Generate, do not hand-copy, `invocation-profiles/<provider>-g0-readonly/1.json` by importing the named compiled record from `scripts/g0-readonly-provider-profiles.mjs` and applying the same `canonicalInvocationProfileDocument` implementation used by the runtime. Its bytes are canonical recursively key-sorted JSON plus one LF. Cross-check `hashInvocationProfile` over the compiled operations, hash the written bytes, and require equality. This binds exact runtime selectors, argv, schemas, and result policies—not only the profile name. Environment-dependent imports, extra provider records, or a profile hash supplied by CLI input fail.

The tree manifest uses `wordle-royale-provider-tool-tree-manifest/v1`, includes the root, every output directory, and every output regular file, in raw-byte path order. Entries have only `{path,type,mode}` or `{path,type,mode,sha256}`. Canonical JSON is recursively key-sorted and ends in one LF. Scan the completed staging tree independently and require exact manifest equality; never derive the final manifest solely from intended writes.

Generate a closed `wordle-royale-provider-tool/v1` descriptor and bind all of the following: official package and exact version; exact final `bundleRoot`/`bundleRealpath`; package `package.json`; common lockfile; entrypoint; selected native package/package-json/binary where applicable; runtime path/realpath/version/hash; complete tree manifest hash; invocation profile identity/hash; official distribution and standard-session mechanism. Vercel has `nativeBinary:null`. The descriptor itself is canonical JSON plus LF and lives outside the bundle. A local publication index records hashes of descriptor, manifest, bundle-tree digest, acquisition declaration, and install plan. It contains no credential/session location.

## Measured bounds

A production-shaped AN-3 assembly/validation run against a disposable owner-only, permission-normalized clone of the current pinned inventory source produced:

| Provider | closure package paths | manifest nodes | payload bytes | canonical manifest bytes |
|---|---:|---:|---:|---:|
| Vercel | 287 | 8,092 | 164,762,096 | 1,299,188 |
| Railway | 17 | 260 | 26,361,107 | 38,969 |
| Supabase | 8 | 818 | 216,499,736 | 127,870 |

These measurements prove the production assembler, independent staging scanner, canonical manifest, and descriptor bindings against the inventory bytes; they do not bless that user-owned tree or its normalized clone. AN-5 must reproduce the artifacts from two fresh npm-ci sources before installation input is approved. The profile's digest value is fixed-width, so generating its real hash does not change manifest length.

Use closed provider-specific limits, checked both by assembler and production manifest loader:

| Provider | max packages | max nodes | max payload | max manifest |
|---|---:|---:|---:|---:|
| Vercel | 400 | 8,500 | 192 MiB | **1,310,720 bytes (1.25 MiB)** |
| Railway | 24 | 320 | 32 MiB | 49,152 bytes |
| Supabase | 24 | 900 | 224 MiB | 147,456 bytes |

Also cap lock bytes at 256 KiB, profile at 256 KiB, descriptor/install metadata at 256 KiB each, path bytes at 1,024, component bytes at 255, and one file at 224 MiB. Crossing any limit fails before publication. The existing generic 1 MiB production manifest cap may be raised **only** to a provider-indexed table after descriptor policy identifies Vercel; Railway and Supabase do not inherit Vercel's exception. The Vercel cap is 11,532 bytes above the measured canonical size, not an unbounded global increase. A package update requires new measurements and review; limits never auto-grow.

## Local publication, reproducibility, and no overwrite

One invocation builds exactly one provider into a new sibling temporary publication directory on the same filesystem. Inputs include provider, source root, local output path, acquisition declaration, and exact final root. Existing output, descriptor, manifest, temp-name collision, or commit marker causes failure; there is no `--force` and no idempotence-by-overwrite. A repeated invocation with identical inputs either creates the absent artifact or returns an explicit `ALREADY_PUBLISHED_IDENTICAL` after read-only verification of every indexed byte. It never mutates it. Different bytes at the requested path fail collision.

After closure/copy, independently rescan and validate staging, write and fsync the bundle, adjacent manifest, descriptor, acquisition record, install plan, and index. Write the canonical `COMMIT` record last, fsync it and the staging directory, then publish the containing directory with `renameat2(RENAME_NOREPLACE)` and fsync the parent. Consumers accept only a complete index whose last-bound commit digest matches all members. On any error, remove only the still-identified private temp inode tree; never follow a replaced path.

Reproducibility acceptance uses two empty npm-ci source directories, two empty assembler staging roots, and the same final absolute root. It requires byte-identical package path sets, bundle regular files, normalized modes, profile, manifest, descriptor, plan data, index, and commit record. Local owner, inode, temporary path, readdir order, umask, locale, timezone, and mtimes may differ and cannot enter canonical bytes. Compare a third independent scanner's digest, not just assembler reports.

## Staging validation versus privileged installation

`validateStagedProviderBundle` is a separate unprivileged validator. It checks closed input policy, exact closure/completeness, bytes, normalized modes, manifest/profile/descriptor bindings, bounds, publication index, and source/build reproducibility. It expects a staging owner and can never be selected by the collector or production runner.

`validateProviderToolBundleForExecution` remains the sole production execution validator and receives no `allowUserOwned`, `staging`, ownership override, or skipped-ancestry option. It continues to require root-owned safe ancestors and bundle, no collector/group/world writes, no links, exact adjacent canonical manifest, pins, and before/after identity. Unit tests may model root snapshots as Wave AM already permits; production code always inspects the real filesystem.

The assembler emits an install **plan**, not an installation. The plan is closed data plus displayable commands identifying exact local publication inodes/hashes, explicit final roots/adjacent files, desired `root:root` ownership and normalized modes, no-overwrite/atomic-copy requirements, and the exact post-copy production-validation command. It contains no `sudo`, shell interpolation, wildcard, relative destination, delete, provider invocation, or automatic execution. A separately reviewed privileged installer/approval must copy bytes (never hardlink), establish safe root-owned ancestors, chown/chmod, atomically publish without replacement, and invoke the unchanged production validator. Approval is required independently for each provider. The assembler must not detect privilege and “helpfully” perform these steps.

## Hostile acceptance criteria

All acceptance is local and provider-call-free:

1. Two fresh exact acquisitions and assemblies produce byte-identical independent artifacts for all three providers; each descriptor names its explicit production root and passes staging binding checks.
2. Wrong package/lock/npm/Node/runtime/platform/final-root/version/hash; lock duplicate keys; unsupported lock source/link; missing, extraneous, unresolved, incompatible, hoisted, nested, optional, or peer dependency; and package-json drift fail closed.
3. Every selected package directory is complete. Omitted/extra/swapped package files and natives fail. `.bin` symlinks are absent and harmlessly ignored; every other symlink, hardlink, duplicate inode, special file, mount escape, traversal, invalid name, collision, and hidden nested dependency fails.
4. Race fixtures replace a file or ancestor, rename a directory, mutate bytes/mode/time/link count, and alter the tree before/during/after streaming. No raced build publishes.
5. Modes are exactly normalized; profile bytes are derived from compiled provider records; modifying an argv/schema/result policy changes the profile and descriptor/manifest hashes. Hand-supplied profile bytes fail.
6. Manifest omission/addition/order/mode/hash/noncanonical JSON and adjacent-path substitution fail. The Vercel measured manifest passes its 1.25 MiB cap; one-byte-over cap fails; the other providers remain under their narrower caps.
7. Existing/different output, temp collision, concurrent publishers, failure before commit, commit write/fsync/rename failure, parent replacement, and late mutation never overwrite or expose an accepted partial publication. An identical repeat is read-only.
8. Staging ownership passes only staging validation and fails production ownership policy. A fake staging flag cannot reach or weaken production validation. Privileged commands are never spawned.
9. Static and syscall tests show no sockets/DNS, provider CLI, package lifecycle script, credential/session lookup, arbitrary subprocess, `sudo`, signing, retry, deploy, or mutation. Canary tokens, `HOME`, npm auth, provider output, and source absolute paths do not appear in canonical artifacts.
10. All Wave AM-1 provider-tool-bundle and broader G0 sanitized-runtime, read-only-adapter, and retry-collector tests remain green.

## Dependency-aware delivery cards

### AN-1 — closed source/acquisition declaration and lock resolver

Implement bounded strict parsing, exact package/lock/toolchain/target checks, Node-layout closure, semver, optional/peer/platform rules, and closed provider bounds. Depends on reviewed npm/Node acquisition pins. **Accept:** resolver fixtures cover hoisting, nesting, two versions, required/optional peers, compatible/incompatible optional packages, missing/extraneous nodes, and all malformed lock cases without network or execution.

### AN-2 — race-safe package copier and canonical profile

Depends on AN-1 and a reviewed descriptor-relative filesystem helper. Copy complete selected package payloads, ignore only `.bin`, normalize modes, and compile the profile from production records. **Accept:** all link/special/path/mount/race/partial-copy fixtures fail; changed compiled operation changes canonical output; no source script executes.

### AN-3 — manifest, descriptor, bounds, and staging validator

Depends on AN-2. Independently rescan, canonicalize, bind all pins/final roots, implement the provider-indexed manifest cap, and keep staging policy structurally separate from production. **Accept:** measured fresh-build sizes are recorded; Vercel alone receives the narrow exception; every omission/swap/binding/cap attack fails; production root policy is unchanged.

### AN-4 — no-overwrite commit-last local publisher and install-plan emitter

Depends on AN-3. Implement same-filesystem private staging, fsyncs, `RENAME_NOREPLACE`, commit/index verification, collision-safe cleanup, identical read-only replay, and inert install data. **Accept:** crash/fault/concurrency matrix exposes no valid partial artifact and executes no privileged command.

### AN-5 — independent-build and AM/G0 regression gate

Depends on AN-1..4 and two separately prepared exact npm-ci trees. Compare all bytes/modes with a third scanner, run network/process tracing and hostile suites, then run unchanged AM/G0 baseline. **Accept:** all three independent bundles reproduce; no socket/provider/root/session activity occurs; privileged installation remains a separate ungranted card.

## Recommendation

Implement through AN-5 locally, but stop before installation. Approve the acquisition toolchain and measured closures explicitly, keep three physically independent artifacts, and raise the manifest limit only for the measured Vercel descriptor. A deterministic user-owned artifact is reviewable installation input—not an immutable production bundle, live evidence, provider authorization, or retry authority.
