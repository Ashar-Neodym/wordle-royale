import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalProviderToolJson, PROVIDER_TOOL_SCHEMA } from './g0-provider-tool-bundle.mjs';
import { collectG0RetryEvidence, G0_RETRY_COLLECTOR_POLICY_DIGEST, G0_RETRY_PROTECTED_BINDINGS_SCHEMA, g0RetryCollectorPolicy } from './g0-retry-evidence-collector-core.mjs';
import { parseAdapterArguments, validateRailwayCandidate, validateSupabaseCandidate, validateVercelCandidate } from './g0-readonly-provider-adapter-common.mjs';
import { createSanitizedProviderRuntime, G0_ADAPTER_CONTEXT_SCHEMA, hashInvocationProfile } from './g0-sanitized-provider-adapter-runtime.mjs';
import { RAILWAY_ADAPTER, SUPABASE_ADAPTER, VERCEL_ADAPTER } from './g0-readonly-provider-profiles.mjs';

const CLEAN_ENV = { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin', TZ: 'UTC' };
const H = (c) => `sha256:${c.repeat(64)}`;
const scripts = new URL('.', import.meta.url);
const adapterPath = (provider) => new URL(`g0-${provider}-readonly-adapter.mjs`, scripts).pathname;
const argv = (provider) => ['collect', '--provider', provider, '--challenge-id', 'challenge-am4-001', '--run-id', 'run-am4-001', '--nonce', 'nonce-am4-001', '--collector-key-id', 'collector-am4-001', '--challenge-digest', H('a'), '--policy-digest', G0_RETRY_COLLECTOR_POLICY_DIGEST, '--format', 'json'];
const compiled = { vercel: VERCEL_ADAPTER, railway: RAILWAY_ADAPTER, supabase: SUPABASE_ADAPTER };
const account = g0RetryCollectorPolicy.accounts;

function descriptor(provider, root) {
  const policy = {
    vercel: ['vercel', '58.4.4', 'node_modules/vercel/dist/vc.js', null, 'sha256:56b16d6893212069398eb30e2d96943421cd8a5ba7ea3372a1dd5743ed23d363', null],
    railway: ['@railway/cli', '5.30.1', 'node_modules/@railway/cli/bin/railway.js', 'node_modules/@railway/cli/bin/railway', 'sha256:21023bebb7838bd52d7646bf0ce75d3c33dc259797dd6e920e318be630184d2d', 'sha256:26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2'],
    supabase: ['supabase', '2.110.0', 'node_modules/supabase/dist/supabase.js', 'node_modules/@supabase/cli-linux-x64/bin/supabase', 'sha256:253caa8c31ee5976322d04a8bd7752622c0915e7943de3f74e2b73395c54a240', 'sha256:e0574b435f54898aa1f5f6fe0696e61b612dafc9b86a2aa538cf8215fc3c9e9f'],
  }[provider];
  const nativeBinary = policy[3] ? { package: provider === 'supabase' ? '@supabase/cli-linux-x64' : policy[0], version: policy[1], path: policy[3], sha256: policy[5], packageJsonSha256: H('8') } : null;
  return { schemaVersion: PROVIDER_TOOL_SCHEMA, distribution: 'official_npm_cli', package: policy[0], version: policy[1], bundleRoot: root, bundleRealpath: root, entrypoint: policy[2], entrypointSha256: policy[4], packageJsonSha256: H('1'), lockfileSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90', treeManifestSha256: H('2'), runtime: { path: '/usr/bin/node', realpath: '/usr/bin/node', version: 'v18.19.1', sha256: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d' }, sessionMode: 'standard_os_user_session', invocationProfile: compiled[provider].invocationProfile, invocationProfileSha256: hashInvocationProfile(compiled[provider].invocationProfile, compiled[provider].operations), nativeBinary };
}

const vercelIdentity = { email: 'fixture@example.invalid', name: null, team: { id: account.vercel.teamId, name: 'Fixture Team', slug: account.vercel.teamSlug }, username: 'fixture-user' };
const railway = { data: { workspace: { id: account.railway.workspaceId, name: account.railway.workspaceName, plan: 'HOBBY', projectCount: 1, projectCountIncludingDeleted: 1 }, customerType: { fields: [{ name: 'id' }, { name: 'name' }, { name: 'creditBalance' }] } } };
const supabase = { _tag: 'Error', error: { code: 'LegacyPlatformAuthRequiredError', message: 'Access token not provided.' } };

async function pinnedCliContractFixture(provider, mode = 'ok') {
  const root = await mkdtemp(join(tmpdir(), `wordle-am4-pinned-${provider}-`)); const d = descriptor(provider, root);
  const source = `#!/usr/bin/node\nconst a=process.argv.slice(2),mode=${JSON.stringify(mode)},identity=${JSON.stringify(vercelIdentity)},railway=${JSON.stringify(railway)},supabase=${JSON.stringify(supabase)};\n` +
    `const banner='Vercel CLI 58.4.4 (Node.js '+process.versions.node+')';\n` +
    `if(${JSON.stringify(provider)}==='vercel'){const whoami=JSON.stringify(['whoami','--scope',${JSON.stringify(account.vercel.teamId)},'--json','--no-color','--non-interactive']);const billing=JSON.stringify(['api','/v1/billing/charges?from=2000-01-01&to=2000-01-02','--scope',${JSON.stringify(account.vercel.teamId)},'--raw','--no-color','--non-interactive']);if(JSON.stringify(a)===whoami){let x=structuredClone(identity);if(mode==='race'&&require('fs').existsSync(${JSON.stringify(join(root, 'seen'))}))x.team.slug='raced';else require('fs').writeFileSync(${JSON.stringify(join(root, 'seen'))},'x');if(mode==='extra-root')x.raw='secret';process.stderr.write(banner+(mode==='team-stderr'?' hostile':'')+'\\n');process.stdout.write(JSON.stringify(x));}else if(JSON.stringify(a)===billing){if(mode==='billing-stdout')process.stdout.write('{}');const detail=mode==='billing-mixed'?'Unauthorized Not Found 500 404':('Not Found ('+(mode==='billing-code'?'403':'404')+')');process.stderr.write(banner+' | api is in beta — https://vercel.com/feedback\\nError: '+detail+'\\n');process.exit(mode==='billing-exit' ? 2 : 1)}else process.exit(9);}` +
    `else if(${JSON.stringify(provider)}==='railway'){const expected=${JSON.stringify(RAILWAY_ADAPTER.operations.workspace_before.args)};if(JSON.stringify(a)!==JSON.stringify(expected))process.exit(9);if(mode==='auth-exit'){process.stderr.write('AUTH_CANARY');process.exit(1)}let x=structuredClone(railway);if(mode==='field')x.data.customerType.fields.push({name:'tax_amount'});if(mode==='race'&&require('fs').existsSync(${JSON.stringify(join(root, 'seen'))}))x.data.workspace.projectCount=2;else require('fs').writeFileSync(${JSON.stringify(join(root, 'seen'))},'x');if(mode==='stderr')process.stderr.write('warning');process.stdout.write(JSON.stringify(x));}` +
    `else {const expected=['projects','list','--output-format','json'];if(JSON.stringify(a)!==JSON.stringify(expected))process.exit(9);let x=structuredClone(supabase);if(mode==='code')x.error.code='OtherError';if(mode==='message')x.error.message='Access token expired';if(mode==='stderr')process.stderr.write('warning');process.stdout.write(JSON.stringify(x));process.exit(mode==='exit'?2:1);}`;
  const target = provider === 'vercel' ? join(root, d.entrypoint) : join(root, d.nativeBinary.path);
  await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, source, { mode: 0o500 }); await chmod(target, 0o500);
  const now = Date.now(); const context = { schemaVersion: G0_ADAPTER_CONTEXT_SCHEMA, toolDescriptor: d, issuedAt: new Date(now - 60_000).toISOString(), observationDeadline: new Date(now + 60_000).toISOString() };
  const contextPath = join(root, 'context.json'); await writeFile(contextPath, `${canonicalProviderToolJson(context)}\n`);
  return { contextPath, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function runAdapter(provider, contextPath, args = argv(provider)) {
  return new Promise((resolve, reject) => { const fd = openSync(contextPath, 'r'); const child = spawn(adapterPath(provider), args, { env: CLEAN_ENV, stdio: ['ignore', 'pipe', 'pipe', fd] }); const out = [], err = []; child.stdout.on('data', (x) => out.push(x)); child.stderr.on('data', (x) => err.push(x)); child.on('error', reject); child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() })); });
}
for (const provider of Object.keys(compiled)) await chmod(adapterPath(provider), 0o500);

async function blocked(provider, mode = 'ok') {
  const fixture = await pinnedCliContractFixture(provider, mode); try {
    const result = await runAdapter(provider, fixture.contextPath);
    if (result.code !== 0 && mode === 'ok') {
      const fd = openSync(fixture.contextPath, 'r'); let runtime;
      try { runtime = createSanitizedProviderRuntime({ expectedProvider: provider, expectedInvocationProfile: compiled[provider].invocationProfile, operations: compiled[provider].operations, descriptorFd: fd, ambientEnv: CLEAN_ENV }); await compiled[provider].probe(runtime); }
      catch (error) { result.debug = error?.code ?? error?.message; } finally { runtime?.close(); }
    }
    return result;
  } finally { await fixture.cleanup(); }
}

test('pinned fake CLI contract fixtures yield exactly the three blocked envelopes', async () => {
  const envelopes = {};
  for (const [provider, code] of [['vercel', 'VERCEL_BILLING_COMPLETENESS_UNAVAILABLE'], ['railway', 'RAILWAY_TAX_OR_FEE_UNKNOWN'], ['supabase', 'SUPABASE_AUTH_UNAVAILABLE']]) {
    const result = await blocked(provider); assert.equal(result.code, 0, `${provider}: ${result.debug}`); assert.equal(result.stderr, '');
    const envelope = JSON.parse(result.stdout); assert.equal(envelope.status, 'blocked'); assert.deepEqual(envelope.blocker, { code }); assert.equal(envelope.payload, null); envelopes[provider] = envelope;
  }
  const challenge = { schemaVersion: 'wordle-royale-g0-retry-challenge/v1', challengeId: 'challenge-am4-001', runId: 'run-am4-001', nonce: 'nonce-am4-001', issuedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(), collectorKeyId: 'collector-am4-001', qualification: { receiptDigest: H('1'), targetSha: g0RetryCollectorPolicy.targetSha, sourceArtifactDigest: H('2'), manifestDigest: H('3'), providerDefaultPolicyDigest: H('4') }, priorConsumedApproval: { approvalId: 'approval-am4-001', artifactDigest: H('5') }, priorAttempt: { artifactDigest: H('6') }, expectedCreatedResources: Object.fromEntries(Object.keys(g0RetryCollectorPolicy.createdIds).map((kind) => [kind, { id: g0RetryCollectorPolicy.createdIds[kind], name: g0RetryCollectorPolicy.createdNames[kind] }])), expectedPreviewIds: { ...g0RetryCollectorPolicy.preview } };
  const now = new Date().toISOString(); const protectedBindings = { schemaVersion: G0_RETRY_PROTECTED_BINDINGS_SCHEMA, challengeId: challenge.challengeId, runId: challenge.runId, nonce: challenge.nonce, collectorKeyId: challenge.collectorKeyId, challengeDigest: H('a'), policyDigest: G0_RETRY_COLLECTOR_POLICY_DIGEST, now };
  assert.equal(collectG0RetryEvidence({ challenge, protectedBindings, ...envelopes }).status, 'blocked');
});

test('exact pinned argv and resultPolicy are bound by the invocation profile hash', () => {
  assert.deepEqual(VERCEL_ADAPTER.operations.identity_before.args, ['whoami', '--scope', account.vercel.teamId, '--json', '--no-color', '--non-interactive']);
  assert.deepEqual(VERCEL_ADAPTER.operations.billing_capability.args, ['api', '/v1/billing/charges?from=2000-01-01&to=2000-01-02', '--scope', account.vercel.teamId, '--raw', '--no-color', '--non-interactive']);
  assert.deepEqual(RAILWAY_ADAPTER.operations.workspace_before.args, RAILWAY_ADAPTER.operations.workspace_after.args); assert.equal(RAILWAY_ADAPTER.operations.workspace_before.args[0], 'api'); assert.match(RAILWAY_ADAPTER.operations.workspace_before.args[1], /projectCountIncludingDeleted: projectCount\(includeDeleted: true\)/u);
  assert.deepEqual(SUPABASE_ADAPTER.operations.auth_preflight.args, ['projects', 'list', '--output-format', 'json']);
  const altered = structuredClone(SUPABASE_ADAPTER.operations); altered.auth_preflight.resultPolicy = 'vercel_billing_404'; assert.notEqual(hashInvocationProfile(SUPABASE_ADAPTER.invocationProfile, SUPABASE_ADAPTER.operations), hashInvocationProfile(SUPABASE_ADAPTER.invocationProfile, altered));
});

test('hostile near-miss stderr, exit, code, message, fields, pagination, and account races emit no envelope', async () => {
  for (const [provider, modes] of Object.entries({ vercel: ['team-stderr', 'billing-code', 'billing-mixed', 'billing-exit', 'billing-stdout', 'race', 'extra-root'], railway: ['field', 'race', 'stderr', 'auth-exit'], supabase: ['code', 'message', 'stderr', 'exit'] })) {
    for (const mode of modes) { const result = await blocked(provider, mode); assert.notEqual(result.code, 0, `${provider}/${mode}`); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); }
  }
});

test('outer protected argv drifts fail silently', async () => {
  assert.equal(parseAdapterArguments(argv('vercel'), 'vercel').runId, 'run-am4-001'); const fixture = await pinnedCliContractFixture('vercel');
  try { for (const bad of [argv('vercel').slice(1), [...argv('vercel'), 'extra'], argv('vercel').map((x, i) => i === 12 ? 'bad' : x)]) { const result = await runAdapter('vercel', fixture.contextPath, bad); assert.notEqual(result.code, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); } } finally { await fixture.cleanup(); }
});

test('complete candidate validators remain pure and collector-native', () => {
  const page = (n) => ({ complete: true, nextCursor: '', totalCount: n }); const interval = { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' }; const absent = (kind) => ({ id: g0RetryCollectorPolicy.createdIds[kind], name: g0RetryCollectorPolicy.createdNames[kind], idLookup: 'absent', nameLookup: 'absent', pendingDeletion: false, tombstone: false });
  const v = validateVercelCandidate({ identity: { accountId: account.vercel.teamId, ...account.vercel }, inventory: { accountId: account.vercel.teamId, page: page(1), projects: [{ id: g0RetryCollectorPolicy.preview.vercelProjectId, name: 'preview', pendingDeletion: false, tombstone: false }] }, billing: { accountId: account.vercel.teamId, billingInterval: interval, currency: 'USD', chargeUsd: '0.0000', complete: true } }); assert.equal(v.chargeQuotes[0].chargeUsd, '0.0000');
  const topology = { accountId: account.railway.workspaceId, page: page(3), preview: { projectId: g0RetryCollectorPolicy.preview.railwayProjectId, environmentId: g0RetryCollectorPolicy.preview.railwayEnvironmentId, serviceId: g0RetryCollectorPolicy.preview.railwayServiceId, unchanged: true }, priorCreatedResources: Object.fromEntries(['railwayProject', 'railwayEnvironment', 'railwayService', 'railwayServiceInstance'].map((kind) => [kind, absent(kind)])) };
  const r = validateRailwayCandidate({ identity: { accountId: account.railway.workspaceId, ...account.railway }, topology, billing: { accountId: account.railway.workspaceId, billingInterval: interval, currency: 'USD', subtotalUsd: '4.9000', taxesUsd: '0.0100', feesUsd: '0.0100', appliedCreditsUsd: '0.0000', unappliedBalanceUsd: '12.0000', complete: true } }); assert.deepEqual(Object.keys(r.costQuotes[0]), ['currency', 'interval', 'subtotalUsd', 'taxesUsd', 'feesUsd', 'appliedCreditsUsd', 'unappliedBalanceUsd']);
  assert.equal(validateSupabaseCandidate({ auth: { authenticated: true, accountId: 'account_1' }, projects: { accountId: 'account_1', page: page(1), projects: [{ projectRef: g0RetryCollectorPolicy.preview.postgresqlProjectRef }] } }).preview.unchanged, true);
});

test('adapter profile has no projects API, environment/variable reads, invented list/status/usage, transport, or mutation', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('g0-readonly-provider-profiles.mjs', scripts), 'utf8');
  for (const forbidden of [/project(?:s)?\s+(?:list|api)/iu, /environment/iu, /variables?/iu, /\b(?:status|usage)\b/iu, /\bfetch\s*\(/u, /\b(?:create|delete|deploy|update|login|link)\b/iu]) assert.doesNotMatch(source, forbidden);
});
