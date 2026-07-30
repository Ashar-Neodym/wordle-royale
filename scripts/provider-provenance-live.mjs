#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  collectLiveBundle, commitLiveBundle, createSecureChildRunner, loadCommittedBundle,
  readProtectedFile, readProtectedJson, verifyAndConsumeLiveBundle,
} from './provider-provenance-live-collector-core.mjs';

function parse(argv) {
  const command = argv[0]; const values = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/u.test(flag ?? '') || value === undefined || Object.hasOwn(values, flag.slice(2))) { const error = new Error('INVALID_ARGUMENTS'); error.code = 'INVALID_ARGUMENTS'; throw error; }
    values[flag.slice(2)] = value;
  }
  return { command, values };
}
function requireOnly(values, required) {
  const actual = Object.keys(values).sort(); const expected = [...required].sort();
  if (actual.join('|') !== expected.join('|')) { const error = new Error('INVALID_ARGUMENTS'); error.code = 'INVALID_ARGUMENTS'; throw error; }
}
const output = (value, stream = process.stdout) => stream.write(`${JSON.stringify(value)}\n`);
function absoluteOption(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) { const error = new Error('PROTECTED_PATH_NOT_ABSOLUTE'); error.code = 'PROTECTED_PATH_NOT_ABSOLUTE'; throw error; }
  return resolve(value);
}

try {
  const { command, values } = parse(process.argv.slice(2));
  if (command === 'collect') {
    requireOnly(values, ['challenge', 'policy', 'plans', 'signing-key', 'output-dir']);
    const challenge = await readProtectedJson(absoluteOption(values.challenge));
    const policy = await readProtectedJson(absoluteOption(values.policy));
    const plans = await readProtectedJson(absoluteOption(values.plans));
    const signingKey = await readProtectedFile(absoluteOption(values['signing-key']), { maxBytes: 16 * 1024 });
    const outputDirectory = absoluteOption(values['output-dir']);
    // Executor snapshots are transient and independent of publication. commitLiveBundle validates and anchors the output root itself.
    const stagingDirectory = await mkdtemp(join(tmpdir(), 'wordle-live-executors-'));
    try {
      const bundle = await collectLiveBundle({ challenge, policy, plans, signingKey, childRunner: createSecureChildRunner({ stagingDirectory }) });
      const path = await commitLiveBundle(outputDirectory, bundle);
      output({ ok: true, command: 'collect', runId: challenge.runId, bundleDirectory: path });
    } finally { await rm(stagingDirectory, { recursive: true, force: true }); }
  } else if (command === 'verify') {
    requireOnly(values, ['bundle-dir', 'policy', 'keyring', 'replay-dir']);
    const bundle = await loadCommittedBundle(absoluteOption(values['bundle-dir']));
    const policy = await readProtectedJson(absoluteOption(values.policy));
    const keyring = await readProtectedJson(absoluteOption(values.keyring));
    const inventory = await verifyAndConsumeLiveBundle({ bundle, keyring, policy, replayDirectory: absoluteOption(values['replay-dir']) });
    output({ ok: true, command: 'verify', runId: inventory.runId, inventoryDigestVerified: true, replayConsumed: true });
  } else { const error = new Error('INVALID_COMMAND'); error.code = 'INVALID_COMMAND'; throw error; }
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(error.code) ? error.code : 'LIVE_PROVENANCE_FAILED';
  output({ ok: false, code }, process.stderr); process.exitCode = 1;
}
