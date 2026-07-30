import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, COLLECTOR_ID, collectInventory, createReceipt, RECEIPT_VERSION, sha256, validateInventory, verifyReceipt } from './provider-provenance-core.mjs';
import { collectionConstraints, expectedIdentities, resignNativeEvidence, validProviderSnapshot } from './provider-provenance-fixture.mjs';

const key = Buffer.from('mock-receipt-signing-material-32-bytes-minimum');
const clone = structuredClone;
function collect(snapshot, overrides = {}) { return collectInventory(snapshot, collectionConstraints(snapshot, overrides)); }
function receipt(snapshot, inventory = collect(snapshot), overrides = {}) { return createReceipt(inventory, snapshot, key, 'mock-key-v1', collectionConstraints(snapshot, overrides)); }
function signedReceipt(snapshot, inventory) {
  const unsigned = { schemaVersion: RECEIPT_VERSION, collector: COLLECTOR_ID, keyId: 'mock-key-v1', inventoryDigest: sha256(canonicalJson(inventory)), evidenceDigest: sha256(canonicalJson(snapshot)) };
  return { ...unsigned, signature: `hmac-sha256:${createHmac('sha256', key).update(canonicalJson(unsigned)).digest('hex')}` };
}

// Blocker 1: verifier and validator must reject malformed caller inventories, even if re-signed.
test('strict inventory schema rejects unknown, omitted, collector, identity, artifact, manifest, observation and provenance corruption', () => {
  const snapshot = validProviderSnapshot(); const base = collect(snapshot);
  const mutations = [
    (x) => { x.extra = true; },
    (x) => { delete x.environments.preview.vercel.variables; },
    (x) => { x.collector = 'attacker/collector@9'; },
    (x) => { x.environments.preview.vercel.identity.deploymentId = ''; },
    (x) => { x.environments.preview.vercel.artifact.artifactDigest = 'bad'; },
    (x) => { x.environments.preview.vercel.artifact.manifest.subjectDeploymentId = 'deployment-swapped'; },
    (x) => { x.environments.preview.postgresql.observations[1].schemaDigest = `sha256:${'1'.repeat(64)}`; },
    (x) => { x.environments.preview.railway.provenance.adapter = 'caller-json/v1'; },
  ];
  for (const mutate of mutations) { const hostile = clone(base); mutate(hostile); assert.equal(validateInventory(hostile).valid, false); assert.equal(verifyReceipt(hostile, receipt(snapshot), key, snapshot, collectionConstraints(snapshot)), false); }
});

// Blocker 2: only signed native Vercel/Railway/PostgreSQL envelopes are accepted and bound.
test('strict native adapters reject caller-asserted, wrong-provider and tampered evidence', () => {
  for (const [provider, mutate] of [
    ['vercel', (e) => { e.payload.identity.deploymentId = 'caller-deployment'; }],
    ['railway', (e) => { e.signature = `ed25519:${Buffer.alloc(64).toString('base64')}`; }],
    ['postgresql', (e) => { e.adapter = 'postgresql-caller-asserted/v1'; }],
  ]) {
    const snapshot = validProviderSnapshot(); mutate(snapshot.providers[provider].preview);
    assert.throws(() => collect(snapshot), (error) => ['UNAUTHENTICATED_NATIVE_EVIDENCE', 'WRONG_NATIVE_ADAPTER'].includes(error.code));
  }
});
test('receipt binds authenticated native evidence digest and requires evidence at verification', () => {
  const snapshot = validProviderSnapshot(); const inventory = collect(snapshot); const signed = receipt(snapshot, inventory);
  assert.equal(verifyReceipt(inventory, signed, key), false);
  assert.equal(verifyReceipt(inventory, signed, key, snapshot, collectionConstraints(snapshot)), true);
  const other = validProviderSnapshot({ collectedAt: snapshot.collectedAt, nonce: snapshot.nonce });
  other.providers.vercel.preview.payload.variables[1].value = 'different-provider-value'; resignNativeEvidence(other, 'vercel', 'preview');
  assert.equal(verifyReceipt(inventory, signed, key, other, collectionConstraints(other)), false);
});

// Blocker 3: freshness, challenge nonce and out-of-band identity expectations are mandatory.
test('rejects stale and future evidence with bounded freshness', () => {
  const stale = validProviderSnapshot({ collectedAt: '2026-07-29T12:00:00.000Z' });
  assert.throws(() => collect(stale, { now: Date.parse('2026-07-29T12:05:00.001Z') }), (error) => error.code === 'STALE_EVIDENCE');
  const future = validProviderSnapshot({ collectedAt: '2026-07-29T12:01:00.000Z' });
  assert.throws(() => collect(future, { now: Date.parse('2026-07-29T12:00:00.000Z') }), (error) => error.code === 'FUTURE_EVIDENCE');
});
test('rejects absent/wrong expected nonce and deployment identity', () => {
  const snapshot = validProviderSnapshot(); const constraints = collectionConstraints(snapshot);
  assert.throws(() => collectInventory(snapshot, { ...constraints, expectedNonce: undefined }), (error) => error.code === 'EXPECTED_NONCE_REQUIRED');
  assert.throws(() => collectInventory(snapshot, { ...constraints, expectedNonce: 'other-challenge' }), (error) => error.code === 'NONCE_MISMATCH');
  const wrong = clone(constraints.expectedIdentities); wrong.production.railway.deploymentId = 'unexpected-deployment';
  assert.throws(() => collectInventory(snapshot, { ...constraints, expectedIdentities: wrong }), (error) => error.code === 'UNEXPECTED_IDENTITY');
});

// Blocker 4: artifact, deployment and manifest subjects are independently linked.
test('rejects deployment swaps and manifest deployment swaps', () => {
  for (const field of ['deploymentId', 'manifest.subjectDeploymentId']) {
    const snapshot = validProviderSnapshot(); const artifact = snapshot.providers.vercel.preview.payload.artifact;
    if (field === 'deploymentId') artifact.deploymentId = 'vercel-deployment-prod'; else artifact.manifest.subjectDeploymentId = 'vercel-deployment-prod';
    resignNativeEvidence(snapshot, 'vercel', 'preview');
    assert.throws(() => collect(snapshot), (error) => ['DEPLOYMENT_ARTIFACT_MISMATCH', 'DEPLOYMENT_MANIFEST_MISMATCH'].includes(error.code));
  }
});
test('rejects production artifacts reused in preview and identical cross-environment artifacts', () => {
  for (const provider of ['vercel', 'railway']) {
    const snapshot = validProviderSnapshot();
    snapshot.providers[provider].preview.payload.artifact.artifactDigest = snapshot.providers[provider].production.payload.artifact.artifactDigest;
    snapshot.providers[provider].preview.payload.artifact.manifest.subjectArtifactDigest = snapshot.providers[provider].production.payload.artifact.artifactDigest;
    resignNativeEvidence(snapshot, provider, 'preview');
    assert.throws(() => collect(snapshot), (error) => error.code === 'CROSS_ENV_ARTIFACT_REUSE');
  }
  const crossProvider = validProviderSnapshot();
  crossProvider.providers.vercel.preview.payload.artifact.artifactDigest = crossProvider.providers.railway.production.payload.artifact.artifactDigest;
  crossProvider.providers.vercel.preview.payload.artifact.manifest.subjectArtifactDigest = crossProvider.providers.railway.production.payload.artifact.artifactDigest;
  resignNativeEvidence(crossProvider, 'vercel', 'preview');
  assert.throws(() => collect(crossProvider), (error) => error.code === 'CROSS_ENV_ARTIFACT_REUSE');
});

// Blocker 5: all resource namespaces are globally disjoint across environments.
test('rejects same-field, PostgreSQL replica and cross-provider preview/production resource collisions', () => {
  const cases = [
    (s) => { s.providers.postgresql.preview.payload.observations[0].replicaId = s.providers.postgresql.production.payload.observations[0].replicaId; resignNativeEvidence(s, 'postgresql', 'preview'); },
    (s) => { s.providers.vercel.preview.payload.identity.projectId = s.providers.railway.production.payload.identity.serviceId; resignNativeEvidence(s, 'vercel', 'preview'); },
    (s) => { s.providers.railway.preview.payload.identity.environmentId = s.providers.postgresql.production.payload.observations[0].databaseId; resignNativeEvidence(s, 'railway', 'preview'); },
  ];
  for (const mutate of cases) { const snapshot = validProviderSnapshot(); mutate(snapshot); assert.throws(() => collect(snapshot), (error) => error.code === 'PREVIEW_PRODUCTION_OVERLAP'); }
});

// Blocker 6: derivations are nonblank and normalized before receipt derivation.
test('artifact and manifest derivations reject whitespace and trim accepted text', () => {
  for (const path of ['artifactDigestDerivation', 'manifest.derivation']) {
    const snapshot = validProviderSnapshot(); const artifact = snapshot.providers.vercel.preview.payload.artifact;
    if (path === 'artifactDigestDerivation') artifact.artifactDigestDerivation = '      '; else artifact.manifest.derivation = '\t  ';
    resignNativeEvidence(snapshot, 'vercel', 'preview'); assert.throws(() => collect(snapshot), (error) => error.code === 'EMPTY_FIELD');
  }
  const snapshot = validProviderSnapshot(); snapshot.providers.vercel.preview.payload.artifact.artifactDigestDerivation = '  normalized derivation text  '; resignNativeEvidence(snapshot, 'vercel', 'preview');
  assert.equal(collect(snapshot).environments.preview.vercel.artifact.artifactDigestDerivation, 'normalized derivation text');
});

test('preserves absent, explicitly empty, non-empty and masked-unknown without values', () => {
  const variables = collect(validProviderSnapshot()).environments.preview.vercel.variables;
  assert.deepEqual(Object.fromEntries(variables.map(({ name, state }) => [name, state])), { VERCEL_ABSENT: 'absent', VERCEL_EMPTY: 'explicitly-empty', VERCEL_MASKED: 'masked-unknown', VERCEL_SET: 'non-empty' });
  assert.doesNotMatch(canonicalJson(variables), /fixture-present-value/); assert.ok(variables.every((entry) => !Object.hasOwn(entry, 'value')));
});
for (const [suffix, expectedState] of [['ABSENT', 'absent'], ['EMPTY', 'explicitly-empty'], ['MASKED', 'masked-unknown']]) test(`validator fails closed for required ${expectedState}`, () => {
  const snapshot = validProviderSnapshot(); snapshot.requiredVariables.vercel.push(`VERCEL_${suffix}`); const result = validateInventory(collect(snapshot));
  assert.equal(result.valid, false); assert.ok(result.issues.some((issue) => issue.name === `VERCEL_${suffix}`));
});

test('receipt creation and verification fail closed for every unproven required-variable state', () => {
  for (const suffix of ['ABSENT', 'EMPTY', 'MASKED']) {
    const snapshot = validProviderSnapshot(); snapshot.requiredVariables.vercel.push(`VERCEL_${suffix}`); const inventory = collect(snapshot);
    assert.equal(validateInventory(inventory).valid, false);
    assert.throws(() => receipt(snapshot, inventory), (error) => error.code === 'REQUIRED_VARIABLE_UNPROVEN');
    // This correctly bound receipt reproduces the signature that the former fail-open path accepted.
    assert.equal(verifyReceipt(inventory, signedReceipt(snapshot, inventory), key, snapshot, collectionConstraints(snapshot)), false);
  }
});

test('CLI emits separate canonical files, verifies native evidence, and never emits provider values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'provider-provenance-')); const paths = Object.fromEntries(['snapshot', 'identities', 'inventory', 'receipt', 'key'].map((name) => [name, join(directory, `${name}.json`)]));
  const snapshot = validProviderSnapshot(); writeFileSync(paths.snapshot, JSON.stringify(snapshot)); writeFileSync(paths.identities, JSON.stringify(expectedIdentities(snapshot))); writeFileSync(paths.key, key);
  const cli = fileURLToPath(new URL('./provider-provenance.mjs', import.meta.url)); const common = ['--snapshot', paths.snapshot, '--expected-identities', paths.identities, '--expected-nonce', snapshot.nonce, '--inventory', paths.inventory, '--receipt', paths.receipt, '--key-file', paths.key, '--now', snapshot.collectedAt];
  assert.equal(execFileSync(process.execPath, [cli, 'collect', ...common, '--key-id', 'mock-key-v1'], { encoding: 'utf8' }), '');
  assert.equal(execFileSync(process.execPath, [cli, 'verify', ...common], { encoding: 'utf8' }), 'VALID\n');
  assert.doesNotMatch(readFileSync(paths.inventory, 'utf8'), /fixture-present-value/); assert.notEqual(readFileSync(paths.inventory, 'utf8'), readFileSync(paths.receipt, 'utf8'));
});
