#!/usr/bin/env node
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson, collectInventory, createReceipt, validateInventory, verifyReceipt } from './provider-provenance-core.mjs';

function usage() {
  return 'usage: provider-provenance.mjs collect --snapshot FILE --expected-identities FILE --expected-nonce ID --inventory FILE --receipt FILE --key-file FILE --key-id ID [--now ISO]\n' +
    '   or: provider-provenance.mjs verify --snapshot FILE --expected-identities FILE --expected-nonce ID --inventory FILE --receipt FILE --key-file FILE [--now ISO]';
}
function args(values) {
  const parsed = { command: values[0] };
  for (let index = 1; index < values.length; index += 2) { const flag = values[index]; if (!flag?.startsWith('--') || values[index + 1] === undefined || Object.hasOwn(parsed, flag.slice(2))) throw new Error('invalid arguments'); parsed[flag.slice(2)] = values[index + 1]; }
  return parsed;
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomicJson(path, value) { const target = resolve(path); const temporary = `${target}.tmp-${process.pid}`; await writeFile(temporary, `${canonicalJson(value)}\n`, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, target); }
async function key(path) { const bytes = await readFile(path); if (bytes.byteLength < 32) throw new Error('receipt key file must contain at least 32 bytes'); return bytes; }
async function constraints(options) {
  const result = { expectedNonce: options['expected-nonce'], expectedIdentities: await json(options['expected-identities']) };
  if (options.now) { const parsed = Date.parse(options.now); if (!Number.isFinite(parsed)) throw new Error('invalid --now'); result.now = parsed; }
  return result;
}
try {
  const options = args(process.argv.slice(2));
  const common = ['snapshot', 'expected-identities', 'expected-nonce', 'inventory', 'receipt', 'key-file'];
  if (options.command === 'collect') {
    for (const name of [...common, 'key-id']) if (!options[name]) throw new Error(`missing --${name}`);
    if (resolve(options.inventory) === resolve(options.receipt) || resolve(options.snapshot) === resolve(options.inventory) || resolve(options.snapshot) === resolve(options.receipt)) throw new Error('snapshot, inventory and receipt must use separate paths');
    const snapshot = await json(options.snapshot); const policy = await constraints(options); const inventory = collectInventory(snapshot, policy);
    const receipt = createReceipt(inventory, snapshot, await key(options['key-file']), options['key-id'], policy);
    await atomicJson(options.inventory, inventory); await atomicJson(options.receipt, receipt);
  } else if (options.command === 'verify') {
    for (const name of common) if (!options[name]) throw new Error(`missing --${name}`);
    const snapshot = await json(options.snapshot); const policy = await constraints(options); const inventory = await json(options.inventory);
    if (!verifyReceipt(inventory, await json(options.receipt), await key(options['key-file']), snapshot, policy)) throw new Error('receipt or native-evidence verification failed');
    const validation = validateInventory(inventory); if (!validation.valid) throw new Error(`inventory validation failed (${validation.issues.map((issue) => issue.code).join(',')})`);
    process.stdout.write('VALID\n');
  } else throw new Error('unknown command');
} catch (error) { process.stderr.write(`provider-provenance: ${error instanceof Error ? error.message : 'failure'}\n${usage()}\n`); process.exitCode = 1; }
