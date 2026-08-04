import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  canonicalInvocationProfileDocument, G0_INVOCATION_PROFILE_SCHEMA, hashInvocationProfile,
} from './g0-invocation-profile.mjs';
import * as runtime from './g0-sanitized-provider-adapter-runtime.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { RAILWAY_ADAPTER, SUPABASE_ADAPTER, VERCEL_ADAPTER } from './g0-readonly-provider-profiles.mjs';

const ADAPTERS = { vercel: VERCEL_ADAPTER, railway: RAILWAY_ADAPTER, supabase: SUPABASE_ADAPTER };
const EXPECTED = {
  vercel: ['sha256:57bbbbb58811f3252550c1b25a4c438a6638d4197905f9e2482618f14cc10adf', 'invocation-profiles/vercel-g0-readonly/1.json'],
  railway: ['sha256:cfa0f0092eb2f4bf2564175e7e0bb5302a088cf028a00da67f0590e2f5991229', 'invocation-profiles/railway-g0-readonly/1.json'],
  supabase: ['sha256:bfd46eabb405c09eae4bda87dd4fbe15122b18c819111674dd825627ea1383c4', 'invocation-profiles/supabase-g0-readonly/1.json'],
};
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const code = (wanted, fn) => assert.throws(fn, (error) => error?.code === wanted, `expected ${wanted}`);

test('all closed providers produce fixed canonical LF-terminated profile artifacts', () => {
  for (const [provider, adapter] of Object.entries(ADAPTERS)) {
    const artifact = generateProviderBundleProfile(provider);
    assert.deepEqual(Object.keys(artifact).sort(), ['bytes', 'invocationProfile', 'provider', 'relativePath', 'sha256']);
    assert.equal(artifact.provider, provider);
    assert.equal(artifact.invocationProfile, adapter.invocationProfile);
    assert.equal(artifact.relativePath, EXPECTED[provider][1]);
    assert.equal(artifact.sha256, EXPECTED[provider][0]);
    assert.equal(artifact.sha256, hashInvocationProfile(adapter.invocationProfile, adapter.operations));
    assert.equal(artifact.sha256, digest(artifact.bytes));
    assert.equal(artifact.bytes.at(-1), 0x0a);
    assert.notEqual(artifact.bytes.at(-2), 0x0a);
    assert.equal(artifact.bytes.toString('utf8'), `${canonicalInvocationProfileDocument(adapter.invocationProfile, adapter.operations)}\n`);
    assert.equal(Object.isFrozen(artifact), true);
    assert.equal(Object.isFrozen(adapter.operations), true);
    for (const operation of Object.values(adapter.operations)) {
      assert.equal(Object.isFrozen(operation), true);
      assert.equal(Object.isFrozen(operation.args), true);
      if (operation.schema) assert.equal(Object.isFrozen(operation.schema), true);
    }
  }
});

test('artifact has a closed schema and excludes executable profile behavior and blockers', () => {
  for (const provider of Object.keys(ADAPTERS)) {
    const parsed = JSON.parse(generateProviderBundleProfile(provider).bytes);
    assert.deepEqual(Object.keys(parsed).sort(), ['invocationProfile', 'operations', 'schemaVersion']);
    assert.equal(parsed.schemaVersion, G0_INVOCATION_PROFILE_SCHEMA);
    assert.equal(JSON.stringify(parsed).includes('blocker'), false);
    assert.equal(JSON.stringify(parsed).includes('probe'), false);
    const visit = (value) => {
      assert.notEqual(typeof value, 'function');
      if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
    };
    visit(parsed);
  }
});

test('every runtime, argv, schema, and result-policy mutation changes the digest', () => {
  const base = RAILWAY_ADAPTER.operations;
  const original = hashInvocationProfile(RAILWAY_ADAPTER.invocationProfile, base);
  const mutations = [
    (x) => { x.workspace_before.runtime = 'node_entrypoint'; },
    (x) => { x.workspace_before.args[0] = 'whoami'; },
    (x) => { x.workspace_before.schema.fields.data.fields.workspace.fields.projectCount.max = 999; },
    (x) => { x.workspace_before.resultPolicy = 'vercel_json_banner'; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base); mutate(changed);
    assert.notEqual(hashInvocationProfile(RAILWAY_ADAPTER.invocationProfile, changed), original);
  }
});

test('generator rejects unsupported, malformed, missing, and extra caller input', () => {
  code('PROVIDER_UNSUPPORTED', () => generateProviderBundleProfile('other'));
  code('PROVIDER_PROFILE_INPUT_INVALID', () => generateProviderBundleProfile());
  code('PROVIDER_PROFILE_INPUT_INVALID', () => generateProviderBundleProfile({ provider: 'vercel' }));
  code('PROVIDER_PROFILE_INPUT_INVALID', () => generateProviderBundleProfile('vercel', { operations: {} }));
});

test('runtime re-exports the exact shared profile API', () => {
  assert.equal(runtime.G0_INVOCATION_PROFILE_SCHEMA, G0_INVOCATION_PROFILE_SCHEMA);
  assert.equal(runtime.canonicalInvocationProfileDocument, canonicalInvocationProfileDocument);
  assert.equal(runtime.hashInvocationProfile, hashInvocationProfile);
});

test('profile extraction and generator have only static pure imports and no ambient capabilities', async () => {
  const profile = await readFile(new URL('./g0-invocation-profile.mjs', import.meta.url), 'utf8');
  const generator = await readFile(new URL('./g0-provider-bundle-profile.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...profile.matchAll(/^import .* from '([^']+)';$/gmu)].map((x) => x[1]), ['node:crypto', './g0-provider-tool-bundle.mjs']);
  assert.deepEqual([...generator.matchAll(/^import .* from '([^']+)';$/gmu)].map((x) => x[1]), ['./g0-invocation-profile.mjs', './g0-readonly-provider-profiles.mjs']);
  for (const source of [profile, generator]) {
    assert.doesNotMatch(source, /node:(?:fs|net|http|https|dns|tls|child_process)|\bprocess(?:\.env)?\b|\b(?:fetch|spawn|exec|fork)\s*\(/u);
    assert.doesNotMatch(source, /\bimport\s*\(|\brequire\s*\(/u);
  }
});
