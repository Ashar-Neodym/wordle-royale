import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, collectInventory, createReceipt, validateInventory, verifyReceipt } from './provider-provenance-core.mjs';
import { validProviderSnapshot } from './provider-provenance-fixture.mjs';

const key = Buffer.from('mock-receipt-signing-material-32-bytes-minimum');
const clone = (value) => structuredClone(value);
function at(root, path) { return path.split('.').reduce((value, part) => value[Number.isInteger(Number(part)) ? Number(part) : part], root); }
function mutate(root, fixture) {
  const parts = fixture.path.split('.');
  const leaf = parts.pop();
  const parent = at(root, parts.join('.'));
  if (fixture.operation === 'delete') delete parent[leaf];
  else if (fixture.operation === 'copy') parent[leaf] = at(root, fixture.from);
  else parent[leaf] = fixture.value;
}

const hostile = JSON.parse(readFileSync(new URL('./fixtures/provider-provenance-hostile.json', import.meta.url), 'utf8'));

for (const fixture of hostile) test(`hostile fixture: ${fixture.name}`, () => {
  const snapshot = validProviderSnapshot();
  mutate(snapshot, fixture);
  assert.throws(() => collectInventory(snapshot), (error) => error.code === fixture.error);
});

test('preserves absent, explicitly empty, non-empty and masked-unknown without values', () => {
  const inventory = collectInventory(validProviderSnapshot());
  const variables = inventory.environments.preview.vercel.variables;
  assert.deepEqual(Object.fromEntries(variables.map(({ name, state }) => [name, state])), {
    VERCEL_ABSENT: 'absent',
    VERCEL_EMPTY: 'explicitly-empty',
    VERCEL_MASKED: 'masked-unknown',
    VERCEL_SET: 'non-empty',
  });
  const serialized = canonicalJson(inventory);
  assert.doesNotMatch(serialized, /fixture-present-value/);
  assert.ok(variables.every((entry) => !Object.hasOwn(entry, 'value')));
});

for (const [suffix, expectedState] of [['ABSENT', 'absent'], ['EMPTY', 'explicitly-empty'], ['MASKED', 'masked-unknown']]) {
  test(`validator fails closed for required ${expectedState} provider value`, () => {
    const snapshot = validProviderSnapshot();
    snapshot.requiredVariables.vercel.push(`VERCEL_${suffix}`);
    const result = validateInventory(collectInventory(snapshot));
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((issue) => issue.name === `VERCEL_${suffix}` && issue.state === expectedState));
  });
}

test('receipt binds canonical inventory and sanitized evidence digest', () => {
  const snapshot = validProviderSnapshot();
  const inventory = collectInventory(snapshot);
  const receipt = createReceipt(inventory, snapshot, key, 'mock-key-v1');
  assert.equal(verifyReceipt(inventory, receipt, key), true);
  const tampered = clone(inventory);
  tampered.environments.production.vercel.identity.deploymentId = 'vercel-deployment-tampered';
  assert.equal(verifyReceipt(tampered, receipt, key), false);
  assert.notEqual(receipt.inventoryDigest, receipt.evidenceDigest);
  assert.deepEqual(Object.keys(receipt).sort(), ['collector', 'evidenceDigest', 'inventoryDigest', 'keyId', 'schemaVersion', 'signature']);
});

test('CLI emits separate canonical files, verifies them, and never emits provider values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'provider-provenance-'));
  const paths = Object.fromEntries(['snapshot', 'inventory', 'receipt', 'key'].map((name) => [name, join(directory, `${name}.json`)]));
  writeFileSync(paths.snapshot, JSON.stringify(validProviderSnapshot()));
  writeFileSync(paths.key, key);
  const cli = fileURLToPath(new URL('./provider-provenance.mjs', import.meta.url));
  const collectOutput = execFileSync(process.execPath, [cli, 'collect', '--snapshot', paths.snapshot, '--inventory', paths.inventory, '--receipt', paths.receipt, '--key-file', paths.key, '--key-id', 'mock-key-v1'], { encoding: 'utf8' });
  assert.equal(collectOutput, '');
  assert.equal(execFileSync(process.execPath, [cli, 'verify', '--inventory', paths.inventory, '--receipt', paths.receipt, '--key-file', paths.key], { encoding: 'utf8' }), 'VALID\n');
  assert.doesNotMatch(readFileSync(paths.inventory, 'utf8'), /fixture-present-value/);
  assert.notEqual(readFileSync(paths.inventory, 'utf8'), readFileSync(paths.receipt, 'utf8'));
});
