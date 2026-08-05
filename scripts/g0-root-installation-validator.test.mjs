import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALLATION_RECEIPT_SCHEMA, parseInstallationReceiptWire, validateInstallationReceipt } from './g0-root-installation-validator.mjs';
const valid = () => ({
  approvalPhrase: 'INSTALL THE THREE VERIFIED G0 PROVIDER BUNDLES ROOT-OWNED IMMUTABLE',
  destination: '/opt/wordle-royale/g0-provider-tools',
  providers: ['vercel-58.4.4', 'railway-5.30.1', 'supabase-2.110.0'].map((artifactId) => ({ artifactId, counts: { bytes: 1, nodes: 2 }, memberHashes: Object.fromEntries(['COMMIT', 'acquisition-record.json', 'bundle.tree-manifest.json', 'descriptor.json', 'install-plan.json', 'publication-index.json'].map((x) => [x, `sha256:${'b'.repeat(64)}`])), publicationId: `${artifactId}-id`, treeSha256: `sha256:${'c'.repeat(64)}` })),
  schemaVersion: INSTALLATION_RECEIPT_SCHEMA,
  sourceReceiptSha256: `sha256:${'a'.repeat(64)}`,
  sourceRevision: '6cc4944a6f4051d5aa72edd6eb7e0a9b2e2e941f',
});
test('canonical installation receipt accepts exactly the three ordered providers', () => assert.equal(validateInstallationReceipt(valid()).providers.length, 3));
test('receipt rejects a missing provider', () => { const x = valid(); x.providers.pop(); assert.throws(() => validateInstallationReceipt(x), /INSTALL_RECEIPT_INVALID/u); });
test('receipt rejects a noncanonical source digest', () => { const x = valid(); x.sourceReceiptSha256 = 'a'.repeat(64); assert.throws(() => validateInstallationReceipt(x), /INSTALL_RECEIPT_INVALID/u); });
test('strict wire rejects duplicate keys and noncanonical bytes', () => {
  const bytes = Buffer.from(`${JSON.stringify(valid(), null, 2)}\n`);
  assert.throws(() => parseInstallationReceiptWire(bytes), /NON_CANONICAL/u);
  assert.throws(() => parseInstallationReceiptWire(Buffer.from('{"approvalPhrase":"x","approvalPhrase":"y"}\n')), /DUPLICATE_KEY/u);
});
test('closed receipt and provider schemas reject extras', () => { const x = valid(); x.extra = false; assert.throws(() => validateInstallationReceipt(x), /INSTALL_RECEIPT_INVALID/u); });
