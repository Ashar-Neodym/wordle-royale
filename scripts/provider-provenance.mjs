#!/usr/bin/env node
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalJson, collectInventory, createReceipt, validateInventory, verifyReceipt } from './provider-provenance-core.mjs';

function usage() {
  return 'usage: provider-provenance.mjs collect --snapshot FILE --inventory FILE --receipt FILE --key-file FILE --key-id ID\n' +
    '   or: provider-provenance.mjs verify --inventory FILE --receipt FILE --key-file FILE';
}
function args(values) {
  const parsed = { command: values[0] };
  for (let index = 1; index < values.length; index += 2) {
    const flag = values[index];
    if (!flag?.startsWith('--') || values[index + 1] === undefined) throw new Error('invalid arguments');
    parsed[flag.slice(2)] = values[index + 1];
  }
  return parsed;
}
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomicJson(path, value) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${canonicalJson(value)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}
async function key(path) {
  const bytes = await readFile(path);
  if (bytes.byteLength < 32) throw new Error('receipt key file must contain at least 32 bytes');
  return bytes;
}

try {
  const options = args(process.argv.slice(2));
  if (options.command === 'collect') {
    for (const name of ['snapshot', 'inventory', 'receipt', 'key-file', 'key-id']) if (!options[name]) throw new Error(`missing --${name}`);
    if (resolve(options.inventory) === resolve(options.receipt)) throw new Error('inventory and receipt must use separate paths');
    const snapshot = await json(options.snapshot);
    const inventory = collectInventory(snapshot);
    const receipt = createReceipt(inventory, snapshot, await key(options['key-file']), options['key-id']);
    await atomicJson(options.inventory, inventory);
    await atomicJson(options.receipt, receipt);
  } else if (options.command === 'verify') {
    for (const name of ['inventory', 'receipt', 'key-file']) if (!options[name]) throw new Error(`missing --${name}`);
    const inventory = await json(options.inventory);
    const valid = verifyReceipt(inventory, await json(options.receipt), await key(options['key-file']));
    if (!valid) throw new Error('receipt verification failed');
    const validation = validateInventory(inventory);
    if (!validation.valid) throw new Error(`inventory validation failed (${validation.issues.map((issue) => issue.code).join(',')})`);
    process.stdout.write('VALID\n');
  } else throw new Error('unknown command');
} catch (error) {
  process.stderr.write(`provider-provenance: ${error instanceof Error ? error.message : 'failure'}\n${usage()}\n`);
  process.exitCode = 1;
}
