# Wave AO: root-owned immutable provider installer

## Security boundary

`scripts/g0-root-immutable-installer.py` is the only privileged component. It is
stdlib-only and has a closed production CLI: the evidence root, reproducibility
receipt SHA-256, source revision, approval phrase, and destination are pinned.
There is no destination flag, provider selector, command runner, network code,
or import of publication/application modules. The test-only `install_for_test`
function is the sole destination-root dependency injection point.

The pinned receipt identifies the corrected Supabase publication as
`supabase-2.110.0-80161ec5f84b61f8646652ee0d20ce17` (alongside the pinned Vercel
and Railway IDs); IDs are consumed from the receipt rather than retyped into the
installer.

## Transaction

1. Open receipt, publication containers, metadata, and bundle nodes with held
   descriptors and `O_NOFOLLOW`; require the exact seven-member publication.
2. Verify successful reproducibility receipt bindings, all metadata hashes,
   complete manifests, modes, regular-node types, `nlink == 1`, and no xattrs.
   A complete pass over all three bundles finishes before any write.
3. Recheck while copying with ordinary read/write calls (never hardlink,
   `copy_file_range`, reflink, or provider execution) into one private sibling
   staging directory on the destination filesystem.
4. Seal directories `0555`, data/metadata `0444`, and manifest-declared
   executables `0555`; require root ownership in production, no xattrs and
   one-link regular files. Fsync files, directories, staging root, and parent.
5. Write canonical `installation-receipt.json` last. Commit the entire
   `g0-provider-tools` name with Linux `renameat2(RENAME_NOREPLACE)`, fsync the
   parent, then re-open the final name and check named identity/policy.

A collision cannot replace or mutate an existing name. A matching receipt is a
read-only replay. Faults before commit remove only the private random staging
name. The canonical layout has three artifact directories, adjacent tree
manifests, five adjacent metadata sidecars per artifact, and the root receipt.

## Validation and operation

`scripts/g0-root-installation-validator.mjs` independently validates receipt and
member hashes. At the real fixed root it additionally calls the existing
`validateProviderToolBundleForExecution` once per provider without an operation
callback, so no provider is run. That validator must be collected by a non-root
OS user because its policy intentionally rejects `collectorUid == 0`; the
installed root-owned tree remains readable (`0555`/`0444`).

The installer itself must eventually be invoked explicitly as root by an
operator using all four exact arguments. Producing and testing these artifacts
does **not** invoke it or its capsule bootstrap, does not run sudo, and does not
touch `/opt`.

## Exact-hash capsule bootstrap

Root must not execute the mutable checkout copy of the installer. From the
committed repository checkout, an operator may separately run this one exact
command (it prompts through `sudo`; it was not run while producing this
artifact):

```sh
/usr/bin/python3 -I -S -B scripts/g0-root-capsule-bootstrap.py --invoke-sudo
```

The unprivileged coordinator opens the exact canonical capsule manifest and
installer with `O_NOFOLLOW`, holds descriptors, checks stable inode metadata,
and requires the installer byte count and pinned SHA-256. It then supplies the
bytes on stdin to `/usr/bin/python3 -I -S -B -c` through a fixed argv (never a
shell). Only that embedded stdlib bootstrap crosses the sudo boundary; root
does not import or execute a script from `/tmp` or the checkout.

The privileged boundary has no path arguments. It can create only the fixed
`/opt/wordle-royale/installer-tools/ao-v1` ancestry and the exact
`g0-root-immutable-installer.py` capsule. It rejects symlinked, non-root-owned,
or group/world-writable ancestry; writes an exclusive private sibling with a
write-all loop; fsyncs and rereads the `0555` file; commits using
`renameat2(RENAME_NOREPLACE)`; and fsyncs the parent. A byte-identical replay
only opens and rereads the capsule. A collision is never removed or replaced,
and failure cleanup unlinks a temporary name only while it still names the
inode created by this invocation. The boundary has no delete/overwrite API,
arbitrary destination, shell, network, credential, or provider-execution path.

Run the focused unprivileged tests with:

```sh
pnpm test:g0:root-capsule-bootstrap
pnpm typecheck:g0:root-capsule-bootstrap
```

Tests use synthetic publications and disposable temp roots. They cover atomic
three-provider commit, fresh inode/mode/link policy, replay, pre-existing and
racing collisions, injected rollback, receipt/member tampering, symlinks,
hardlinks, xattrs where supported, and closed CLI/root gating.
