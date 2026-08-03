# Wave AI-2 — hardened production G2 evidence collector

Status: implemented as a local production CLI and verified with a synthetic executable adapter followed by the shipped Wave AH CLI. It performs evidence mechanics only. It does not grant G2, backup, restore, database, provider, hosted-mutation, or production authority.

## Command boundary

`scripts/g2-backup-restore-evidence-collector.mjs` accepts exactly seven absolute normalized path options: `--challenge`, `--policy`, `--operation-plan`, `--signing-key`, `--keyring`, `--output-dir`, and `--collector-replay-dir`. There are no adapter argv, environment, operation, clock, host, URL, SQL, provider, or mutation options. Production uses `Date.now` only.

All five input files are owner `0600`, regular, single-link, `O_NOFOLLOW` descriptor reads with before/opened/after identity checks. Their protected parent directories are owner `0700`, and input inode aliasing is rejected. Output and collector-replay roots are owner `0700` descriptor anchors, cannot alias, and their original names are revalidated throughout publication so a root replacement fails and rolls back rather than returning paths into a replacement directory. The private Ed25519 key must derive the independently keyring-approved public identity; key approval is checked at challenge issuance and collection time.

## Sole subprocess boundary

Only `g2-backup-restore-evidence-collector-runner.mjs` imports `node:child_process`. The operation plan still has exactly the seven AI-1 semantic operations. Production additionally requires one identical, absolute-normalized executable policy for every call. Before operation one it captures device, inode, UID, exact `0500` mode, single-link count, realpath, and SHA-256 through an `O_NOFOLLOW` descriptor. It revalidates that snapshot before and after every spawn and after operation seven.

The opened executable descriptor is inherited as fd 3 and execed as `/proc/self/fd/3`, closing the pathname replacement race while supporting shebang adapters. Spawn is always `shell:false`, in an isolated process group, with ignored stdin and only `LANG=C`, `LC_ALL=C`, `PATH=/usr/bin:/bin`, and `TZ=UTC`. Stdout, stderr, per-call timeout, and a five-minute aggregate timeout are bounded. Timeout/limit termination kills the process group. Raw stdout/stderr are never reported.

The core generates all argv. Strict UTF-8 JSON parsing rejects malformed/trailing data, lexical duplicate keys, and depth over 32 before closed-envelope and Wave AH cross-operation validation. Signing occurs only after semantic preflight.

## Commit-last publication and replay

The collector replay marker uses a `collector-` prefix and a directory explicitly separate from Wave AH verifier replay. Output names are reserved before adapter execution. After all seven calls, semantic verification, Ed25519 signing, receipt generation, and in-memory Wave AH evaluation succeed, four private canonical `0600` candidates are created and fsynced: evidence, provider receipt, inventory, and eligibility. Collector replay is atomically consumed only then. Finals are linked from owned candidate inodes, and the fsynced collector commit manifest is published last. Without that manifest partial finals are untrusted. Every failure rolls back only invocation-owned names/inodes and its own replay marker; collisions never overwrite files. The success response says only `eligible_to_request_G2_approval`, while every authority boolean remains false and fresh approval remains required.

## Verification

`g2-backup-restore-evidence-collector-cli.e2e.test.mjs` dynamically creates protected inputs, an ephemeral Ed25519 key/keyring, and a local single-link `0500` synthetic adapter. It runs the production collector as a subprocess, independently recomputes inventory/digests and verifies both signatures, asserts every authority field remains false, then runs the shipped Wave AH CLI as a second subprocess against emitted files. It also covers exact CLI closure and internally generated argv/minimal environment, output-before-replay collision behavior, replay rejection, concurrent nonce use, private/public mismatch, mixed bindings, executable identity/mode/hash drift, bounded nonzero/timeout/stdout/stderr/malformed-output failures, secret canaries, stable exit classes, static import closure, and strace proof of exactly eight collector-orchestration `execve` calls (CLI plus seven adapters) with no `socket` or `connect`. Deterministic transaction regressions cover late output collision; output/replay root replacement; candidate, final, replay-marker, and commit hardlink/removal/replacement; and late-commit rollback with no trusted partial bundle.

The collector protects the transaction while its descriptors are open and verifies named roots immediately before returning. As with any local same-UID artifact, filesystem contents can still be changed by that UID after the process has returned; downstream consumers must retain their own protected descriptor-read and digest/signature checks.

Run:

```text
pnpm test:g2:backup-restore-evidence-collector
pnpm typecheck:g2:backup-restore-evidence-collector
```
