#!/usr/bin/env node
import { dirname } from 'node:path';
import { evaluateG2BackupRestoreReadiness, g2CanonicalJson, g2Sha256 } from './g2-backup-restore-readiness-core.mjs';
import {
  exactAbsolutePath, openG2ProtectedDirectory, publishG2Eligibility, readG2ProtectedJson,
  resolveG2CollectorKey,
} from './g2-backup-restore-readiness-offline-core.mjs';

const OPTIONS = Object.freeze([
  'policy', 'challenge', 'evidence', 'provider-receipt', 'keyring',
  'expected-challenge-id', 'expected-run-id', 'expected-nonce', 'expected-collector-key-id',
  'expected-repository', 'expected-source-git-sha', 'expected-source-artifact-digest',
  'expected-migration-digest', 'expected-policy-digest', 'expected-provider-policy-digest',
  'expected-source-identity-digest', 'expected-restore-identity-digest', 'replay-dir', 'output-dir',
]);
const INPUTS = Object.freeze(['policy', 'challenge', 'evidence', 'provider-receipt', 'keyring']);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function argumentsOf(argv) {
  const values = {};
  if (argv.length !== OPTIONS.length * 2) fail('CLI_ARGUMENT_INVALID');
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1]; const key = flag?.startsWith('--') ? flag.slice(2) : '';
    if (!OPTIONS.includes(key) || value === undefined || Object.hasOwn(values, key)) fail('CLI_ARGUMENT_INVALID');
    values[key] = value;
  }
  if (Object.keys(values).length !== OPTIONS.length) fail('CLI_ARGUMENT_INVALID');
  for (const key of [...INPUTS, 'replay-dir', 'output-dir']) exactAbsolutePath(values[key]);
  return values;
}
function same(actual, expected) { if (actual !== expected) fail('INDEPENDENT_BINDING_MISMATCH'); }
async function validateInputParents(paths) {
  const seen = new Set(); const roots = [];
  try {
    for (const path of paths) {
      const parent = dirname(path); if (seen.has(parent)) continue; seen.add(parent);
      roots.push(await openG2ProtectedDirectory(parent));
    }
  } finally { await Promise.all(roots.map((root) => root.handle.close())); }
}
function classify(error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(error.code) ? error.code : 'LOCAL_IO_FAILURE';
  if (code === 'CHALLENGE_REPLAY') return { code, status: 3 };
  const local = new Set([
    'DIRECTORY_UNAVAILABLE', 'DIRECTORY_POLICY', 'DIRECTORY_DESCRIPTOR_UNAVAILABLE', 'DIRECTORY_ALIAS',
    'OUTPUT_ALREADY_EXISTS', 'OUTPUT_FILE_POLICY', 'OUTPUT_CANDIDATE_CHANGED', 'OUTPUT_PUBLICATION_RACE',
    'REPLAY_MARKER_POLICY', 'REPLAY_MARKER_CHANGED', 'EACCES', 'EDQUOT', 'EEXIST', 'EFBIG', 'EINTR', 'EIO', 'ELOOP', 'EMFILE',
    'ENFILE', 'ENOENT', 'ENOSPC', 'ENOTDIR', 'EPERM', 'EROFS', 'EXDEV',
  ]);
  return { code: local.has(code) ? code : (code.startsWith('ERR_') ? 'LOCAL_IO_FAILURE' : code), status: local.has(code) || code.startsWith('ERR_') ? 4 : 2 };
}

let outputRoot; let replayRoot;
try {
  const options = argumentsOf(process.argv.slice(2));
  await validateInputParents(INPUTS.map((name) => options[name]));
  const records = await Promise.all(INPUTS.map((name) => readG2ProtectedJson(options[name])));
  const identities = new Set(records.map(({ dev, ino }) => `${dev}:${ino}`));
  if (identities.size !== records.length) fail('INPUT_FILE_ALIAS');
  const [policy, challenge, evidence, providerReceipt, keyring] = records.map(({ value }) => value);

  same(policy.expectedChallengeId, options['expected-challenge-id']);
  same(policy.expectedRunId, options['expected-run-id']);
  same(policy.expectedNonce, options['expected-nonce']);
  same(policy.expectedCollectorKeyId, options['expected-collector-key-id']);
  same(policy.repository, options['expected-repository']);
  same(policy.sourceGitSha, options['expected-source-git-sha']);
  same(policy.sourceArtifactDigest, options['expected-source-artifact-digest']);
  same(policy.migrationDigest, options['expected-migration-digest']);
  same(g2Sha256(g2CanonicalJson(policy)), options['expected-policy-digest']);
  same(g2Sha256(g2CanonicalJson(policy.providerPolicy)), options['expected-provider-policy-digest']);
  same(g2Sha256(g2CanonicalJson(policy.identities.sourceProduction)), options['expected-source-identity-digest']);
  same(g2Sha256(g2CanonicalJson(policy.identities.restoreDestination)), options['expected-restore-identity-digest']);

  // The signing key must have been active at observation and remain approved and active
  // at verification. Date.now is deliberately the only clock available to production.
  const collectorPublicKey = resolveG2CollectorKey(keyring, options['expected-collector-key-id'], evidence.observedAt);
  resolveG2CollectorKey(keyring, options['expected-collector-key-id'], new Date(Date.now()).toISOString());
  const receipt = evaluateG2BackupRestoreReadiness({ challenge, evidence, providerReceipt, collectorPublicKey, policy, now: Date.now() });

  outputRoot = await openG2ProtectedDirectory(options['output-dir']);
  replayRoot = await openG2ProtectedDirectory(options['replay-dir']);
  const output = await publishG2Eligibility({ outputRoot, replayRoot, runId: options['expected-run-id'], nonce: options['expected-nonce'], receipt, canonicalJson: g2CanonicalJson });
  process.stdout.write(`${JSON.stringify({ ok: true, decision: 'eligible_to_request_G2_approval', receiptDigest: receipt.receiptDigest, output })}\n`);
} catch (error) {
  const reported = classify(error);
  process.stderr.write(`${JSON.stringify({ ok: false, code: reported.code })}\n`);
  process.exitCode = reported.status;
} finally {
  await replayRoot?.handle.close().catch(() => {});
  await outputRoot?.handle.close().catch(() => {});
}
