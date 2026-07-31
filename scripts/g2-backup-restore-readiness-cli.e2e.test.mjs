import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { access, chmod, link, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { buildSyntheticG2Bundle } from './g2-backup-restore-synthetic-fixture.mjs';
import { deriveG2BackupRestoreInventory, g2CanonicalJson, g2Sha256 } from './g2-backup-restore-readiness-core.mjs';
import { openG2ProtectedDirectory, publishG2Eligibility } from './g2-backup-restore-readiness-offline-core.mjs';

const CLI = resolve(dirname(new URL(import.meta.url).pathname), 'g2-backup-restore-readiness.mjs');
const CANARY = 'AH2_SECRET_CANARY_MUST_NEVER_APPEAR';
const markerNames = ['curl', 'wget', 'vercel', 'railway', 'psql', 'supabase'];
const absent = (path) => assert.rejects(access(path));
const signWith = (privateKey, value) => `ed25519:${sign(null, Buffer.from(g2CanonicalJson(value)), privateKey).toString('base64')}`;
function shiftIso(value, delta) { return new Date(Date.parse(value) + delta).toISOString(); }

function dynamicBundle(privateKey, ids = {}) {
  const signer = (value) => signWith(privateKey, value);
  const bundle = buildSyntheticG2Bundle({ signCanonical: signer, ...ids });
  const desiredIssued = Date.now() - 30_000; const delta = desiredIssued - Date.parse(bundle.challenge.issuedAt);
  for (const field of ['issuedAt', 'expiresAt']) bundle.challenge[field] = shiftIso(bundle.challenge[field], delta);
  const timestampPaths = [
    ['observedAt'], ['expiresAt'], ['providerPolicyObservation', 'observedAt'],
    ...['recoveryPointAt', 'sourceCutoffAt', 'restoreRequestedAt', 'verificationCompletedAt'].map((field) => ['rpoRtoMeasurement', field]),
    ...['startedAt', 'completedAt'].map((field) => ['backupArtifact', field]),
    ...['startedAt', 'completedAt'].map((field) => ['restoreDrill', field]),
    ...['windowStartedAt', 'windowCompletedAt'].map((field) => ['productionNoMutation', field]),
    ['cleanup', 'checkedAt'], ['retention', 'retainedUntil'],
  ];
  for (const path of timestampPaths) {
    let parent = bundle.evidence; for (const part of path.slice(0, -1)) parent = parent[part];
    parent[path.at(-1)] = shiftIso(parent[path.at(-1)], delta);
  }
  bundle.evidence.challengeDigest = g2Sha256(g2CanonicalJson(bundle.challenge));
  const unsignedEvidence = { ...bundle.evidence }; delete unsignedEvidence.signature;
  bundle.evidence.signature = signer(unsignedEvidence);
  const inventory = deriveG2BackupRestoreInventory(bundle.evidence, bundle.challenge, bundle.policy);
  const unsignedReceipt = {
    ...bundle.providerReceipt,
    challengeDigest: g2Sha256(g2CanonicalJson(bundle.challenge)),
    evidenceDigest: g2Sha256(g2CanonicalJson(bundle.evidence)),
    inventoryDigest: g2Sha256(g2CanonicalJson(inventory)),
  };
  delete unsignedReceipt.signature;
  bundle.providerReceipt = { ...unsignedReceipt, signature: signer(unsignedReceipt) };
  bundle.inventory = inventory;
  return bundle;
}
function runCli(args, env = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env, AH2_SECRET: CANARY } });
    const stdout = []; const stderr = []; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('CLI watchdog')); }, 15_000);
    child.stdout.on('data', (chunk) => stdout.push(chunk)); child.stderr.on('data', (chunk) => stderr.push(chunk)); child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); accept({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() }); });
  });
}
function parseFailure(result, status, code) {
  assert.equal(result.code, status, result.stderr); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { ok: false, code }); assert.equal(result.stderr.split('\n').length, 2); assert.equal(result.stderr.includes(CANARY), false);
}
async function setup(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'g2-ah2-')); const protectedDir = join(root, 'protected'); const output = join(root, 'output'); const replay = join(root, 'replay'); const hostilePath = join(root, 'hostile-path');
  await Promise.all([protectedDir, output, replay, hostilePath].map((path) => mkdir(path, { mode: 0o700 })));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const suffix = `${process.pid}-${Math.random().toString(16).slice(2)}`; const bundle = dynamicBundle(privateKey, { challengeId: `challenge-ah2-${suffix}`, runId: `run-ah2-${suffix}`, nonce: `nonce-ah2-${suffix}`, collectorKeyId: `key-ah2-${suffix}` });
  options.mutate?.(bundle);
  if (options.mutate) {
    const signer = (value) => signWith(privateKey, value);
    const unsignedEvidence = { ...bundle.evidence }; delete unsignedEvidence.signature; bundle.evidence.signature = signer(unsignedEvidence);
    const inventory = deriveG2BackupRestoreInventory(bundle.evidence, bundle.challenge, bundle.policy);
    const unsignedReceipt = { ...bundle.providerReceipt, challengeDigest:g2Sha256(g2CanonicalJson(bundle.challenge)), evidenceDigest:g2Sha256(g2CanonicalJson(bundle.evidence)), inventoryDigest:g2Sha256(g2CanonicalJson(inventory)) }; delete unsignedReceipt.signature;
    bundle.providerReceipt = { ...unsignedReceipt, signature:signer(unsignedReceipt) };
  }
  const keyring = { schemaVersion: 'wordle-provider-collector-keyring/v1', keys: [{ keyId: bundle.challenge.collectorKeyId, publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(), notBefore: new Date(Date.now() - 3600_000).toISOString(), notAfter: new Date(Date.now() + 3600_000).toISOString(), revokedAt: null }] };
  const values = { policy: bundle.policy, challenge: bundle.challenge, evidence: bundle.evidence, 'provider-receipt': bundle.providerReceipt, keyring };
  const files = {};
  for (const [name, value] of Object.entries(values)) { files[name] = join(protectedDir, `${name}.json`); await writeFile(files[name], `${JSON.stringify(value)}\n`, { mode: 0o600 }); await chmod(files[name], 0o600); }
  const marker = join(root, 'path-command-ran');
  for (const name of markerNames) await writeFile(join(hostilePath, name), `#!/bin/sh\nprintf ran > '${marker}'\n`, { mode: 0o700 });
  const p = bundle.policy;
  const args = [
    '--policy', files.policy, '--challenge', files.challenge, '--evidence', files.evidence, '--provider-receipt', files['provider-receipt'], '--keyring', files.keyring,
    '--expected-challenge-id', p.expectedChallengeId, '--expected-run-id', p.expectedRunId, '--expected-nonce', p.expectedNonce, '--expected-collector-key-id', p.expectedCollectorKeyId,
    '--expected-repository', p.repository, '--expected-source-git-sha', p.sourceGitSha, '--expected-source-artifact-digest', p.sourceArtifactDigest,
    '--expected-migration-digest', p.migrationDigest, '--expected-policy-digest', g2Sha256(g2CanonicalJson(p)), '--expected-provider-policy-digest', g2Sha256(g2CanonicalJson(p.providerPolicy)),
    '--expected-source-identity-digest', g2Sha256(g2CanonicalJson(p.identities.sourceProduction)), '--expected-restore-identity-digest', g2Sha256(g2CanonicalJson(p.identities.restoreDestination)),
    '--replay-dir', replay, '--output-dir', output,
  ];
  const outputFile = join(output, `${p.expectedRunId}.eligibility.json`);
  return { root, protectedDir, output, replay, hostilePath, marker, bundle, keyring, files, args, outputFile, run: (custom = args) => runCli(custom, { PATH: hostilePath }), cleanup: () => rm(root, { recursive: true, force: true }) };
}
function replaceArg(args, flag, value) { const copy = [...args]; copy[copy.indexOf(flag) + 1] = value; return copy; }

async function assertNoSideEffects(s) { await absent(s.outputFile); assert.deepEqual(await readdir(s.replay), []); assert.equal((await readdir(s.output)).some((name) => name.includes('.candidate')), false); await absent(s.marker); }

test('production CLI verifies dynamically externally signed evidence, publishes canonical 0600 receipt, and invokes no PATH command', async () => {
  const s = await setup(); try {
    const result = await s.run(); assert.equal(result.code, 0, result.stderr); assert.equal(result.stderr, '');
    const response = JSON.parse(result.stdout); assert.deepEqual(Object.keys(response).sort(), ['decision', 'ok', 'output', 'receiptDigest'].sort());
    assert.equal(response.decision, 'eligible_to_request_G2_approval'); assert.equal(response.output, s.outputFile);
    const bytes = await readFile(s.outputFile); const receipt = JSON.parse(bytes); assert.deepEqual(bytes, Buffer.from(`${g2CanonicalJson(receipt)}\n`));
    assert.equal((await stat(s.outputFile)).mode & 0o777, 0o600);
    const unsigned = { ...receipt }; delete unsigned.receiptDigest; assert.equal(receipt.receiptDigest, g2Sha256(g2CanonicalJson(unsigned))); assert.equal(response.receiptDigest, receipt.receiptDigest);
    for (const field of ['g2Authorized', 'backupExecutionAuthorized', 'restoreExecutionAuthorized', 'productionMutationAuthorized']) assert.equal(receipt[field], false);
    assert.equal((await readdir(s.output)).some((name) => name.includes('.candidate')), false); await absent(s.marker);
  } finally { await s.cleanup(); }
});

test('fully signed future evidence fails before marker/output with no CLI clock override', async () => {
  const future = new Date(Date.now() + 30_000).toISOString();
  const s = await setup({ mutate: (bundle) => { bundle.evidence.observedAt = future; bundle.evidence.cleanup.checkedAt = future; bundle.evidence.productionNoMutation.windowCompletedAt = future; } });
  try { parseFailure(await s.run(), 2, 'FUTURE_EVIDENCE'); await assertNoSideEffects(s); }
  finally { await s.cleanup(); }
});

test('strict protected inputs reject duplicate keys, trailing data, excessive depth, unknown and omitted fields with no side effects', async (t) => {
  const cases = [
    ['duplicate', 'policy', (raw) => raw.replace('"repository":', `"secretCanary":"${CANARY}","repository":"attacker/repo","repository":`), 'DUPLICATE_JSON_KEY'],
    ['trailing', 'policy', (raw) => `${raw} trailing`, 'JSON_SYNTAX'],
    ['depth', 'policy', () => `${'['.repeat(33)}0${']'.repeat(33)}`, 'JSON_DEPTH'],
    ['unknown', 'evidence', (raw) => raw.replace('{', '{"unexpected":true,'), 'UNKNOWN_FIELD'],
    ['omitted', 'evidence', (raw) => { const value = JSON.parse(raw); delete value.cleanup; return JSON.stringify(value); }, 'OMITTED_FIELD'],
  ];
  for (const [name, file, mutate, code] of cases) await t.test(name, async () => { const s = await setup(); try { const raw = await readFile(s.files[file], 'utf8'); await writeFile(s.files[file], mutate(raw), { mode: 0o600 }); parseFailure(await s.run(), 2, code); await assertNoSideEffects(s); } finally { await s.cleanup(); } });
});

test('protected regular-file policy rejects symlink, hardlink, permissive mode and aliased inputs', async (t) => {
  for (const [name, mutate, code] of [
    ['symlink', async (s) => { const target = `${s.files.evidence}.real`; await rename(s.files.evidence, target); await symlink(target, s.files.evidence); }, 'UNSAFE_INPUT_FILE'],
    ['hardlink', async (s) => { await link(s.files.evidence, `${s.files.evidence}.hard`); }, 'UNSAFE_INPUT_FILE'],
    ['permissive', async (s) => chmod(s.files.keyring, 0o640), 'UNSAFE_INPUT_FILE'],
    ['same pathname alias', async (s) => { s.args = replaceArg(s.args, '--challenge', s.files.policy); }, 'INPUT_FILE_ALIAS'],
  ]) await t.test(name, async () => { const s = await setup(); try { await mutate(s); parseFailure(await s.run(s.args), 2, code); await assertNoSideEffects(s); } finally { await s.cleanup(); } });
});

test('all independent bindings and exact argument schema fail closed before replay', async (t) => {
  for (const flag of ['--expected-challenge-id', '--expected-run-id', '--expected-nonce', '--expected-collector-key-id', '--expected-source-git-sha', '--expected-policy-digest', '--expected-source-identity-digest', '--expected-restore-identity-digest']) {
    await t.test(flag, async () => { const s = await setup(); try { parseFailure(await s.run(replaceArg(s.args, flag, 'attacker-binding-value')), 2, 'INDEPENDENT_BINDING_MISMATCH'); await assertNoSideEffects(s); } finally { await s.cleanup(); } });
  }
  const s = await setup(); try { parseFailure(await s.run([...s.args, '--now', new Date().toISOString()]), 2, 'CLI_ARGUMENT_INVALID'); await assertNoSideEffects(s); } finally { await s.cleanup(); }
});

test('signature, digest, key approval and sensitive/raw input failures are sanitized and side-effect free', async (t) => {
  for (const [name, mutate, code] of [
    ['evidence signature', (s) => { s.bundle.evidence.signature = `ed25519:${Buffer.alloc(64).toString('base64')}`; }, 'PROVIDER_RECEIPT_DIGEST_MISMATCH'],
    ['receipt digest', (s) => { s.bundle.providerReceipt.inventoryDigest = `sha256:${'a'.repeat(64)}`; }, 'PROVIDER_RECEIPT_DIGEST_MISMATCH'],
    ['key id', (s) => { s.keyring.keys[0].keyId = 'other-unapproved-key'; }, 'COLLECTOR_KEY_NOT_APPROVED'],
    ['raw secret', (s) => { s.bundle.evidence.rawSecretPayload = CANARY; }, 'SENSITIVE_OR_RAW_FIELD_FORBIDDEN'],
  ]) await t.test(name, async () => { const s = await setup(); try { mutate(s); const target = name === 'key id' ? s.files.keyring : name === 'raw secret' || name === 'evidence signature' ? s.files.evidence : s.files['provider-receipt']; const value = name === 'key id' ? s.keyring : name === 'receipt digest' ? s.bundle.providerReceipt : s.bundle.evidence; await writeFile(target, JSON.stringify(value), { mode: 0o600 }); const result = await s.run(); parseFailure(result, 2, code); assert.equal((result.stdout + result.stderr).includes(CANARY), false); await assertNoSideEffects(s); } finally { await s.cleanup(); } });
});

test('output collision is preflighted before marker and nonce remains reusable', async () => {
  const s = await setup(); try {
    await writeFile(s.outputFile, 'occupied\n', { mode: 0o600 }); parseFailure(await s.run(), 4, 'OUTPUT_ALREADY_EXISTS'); assert.deepEqual(await readdir(s.replay), []); assert.equal(await readFile(s.outputFile, 'utf8'), 'occupied\n');
    await unlink(s.outputFile); const alternate = join(s.root, 'alternate-output'); await mkdir(alternate, { mode: 0o700 }); const retry = await s.run(replaceArg(s.args, '--output-dir', alternate)); assert.equal(retry.code, 0, retry.stderr);
  } finally { await s.cleanup(); }
});

test('replay collision publishes nothing and leaves no candidate', async () => {
  const s = await setup(); try { assert.equal((await s.run()).code, 0); const other = join(s.root, 'other-output'); await mkdir(other, { mode: 0o700 }); const result = await s.run(replaceArg(s.args, '--output-dir', other)); parseFailure(result, 3, 'CHALLENGE_REPLAY'); assert.deepEqual(await readdir(other), []); } finally { await s.cleanup(); }
});

test('concurrent same nonce with different outputs yields exactly one success', async () => {
  const s = await setup(); try { const other = join(s.root, 'other-output'); await mkdir(other, { mode: 0o700 }); const results = await Promise.all([s.run(), s.run(replaceArg(s.args, '--output-dir', other))]); assert.deepEqual(results.map((r) => r.code).sort(), [0, 3]); const published = (await readdir(s.output)).length + (await readdir(other)).length; assert.equal(published, 1); for (const result of results.filter((r) => r.code !== 0)) parseFailure(result, 3, 'CHALLENGE_REPLAY'); } finally { await s.cleanup(); }
});

test('0700 directory policy and output/replay alias fail with local-I/O status', async (t) => {
  for (const [name, mutate, code] of [
    ['output mode', (s) => chmod(s.output, 0o755), 'DIRECTORY_POLICY'],
    ['replay mode', (s) => chmod(s.replay, 0o755), 'DIRECTORY_POLICY'],
    ['directory alias', (s) => { s.args = replaceArg(s.args, '--replay-dir', s.output); }, 'DIRECTORY_ALIAS'],
  ]) await t.test(name, async () => { const s = await setup(); try { await mutate(s); parseFailure(await s.run(s.args), 4, code); await absent(s.marker); } finally { await s.cleanup(); } });
});

test('descriptor-anchored output and replay publication survive replacement of both original root paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g2-ah2-root-race-')); const output = join(root, 'output'); const replay = join(root, 'replay');
  const detachedOutput = join(root, 'detached-output'); const detachedReplay = join(root, 'detached-replay');
  await Promise.all([mkdir(output, { mode: 0o700 }), mkdir(replay, { mode: 0o700 })]);
  const outputRoot = await openG2ProtectedDirectory(output); const replayRoot = await openG2ProtectedDirectory(replay);
  try {
    await rename(output, detachedOutput); await mkdir(output, { mode: 0o700 });
    await rename(replay, detachedReplay); await mkdir(replay, { mode: 0o700 });
    const receipt = { decision: 'eligible_to_request_G2_approval', authority: false };
    await publishG2Eligibility({ outputRoot, replayRoot, runId: 'run-root-replacement', nonce: 'nonce-root-replacement', receipt, canonicalJson: g2CanonicalJson });
    assert.deepEqual(await readdir(output), []); assert.deepEqual(await readdir(replay), []);
    assert.deepEqual(await readdir(detachedOutput), ['run-root-replacement.eligibility.json']);
    assert.equal((await readdir(detachedReplay)).length, 1);
    assert.deepEqual(JSON.parse(await readFile(join(detachedOutput, 'run-root-replacement.eligibility.json'), 'utf8')), receipt);
  } finally { await outputRoot.handle.close(); await replayRoot.handle.close(); await rm(root, { recursive: true, force: true }); }
});

test('publication detects candidate hardlinks through completion and rolls back owned names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'g2-ah2-hardlink-race-')); const output = join(root, 'output'); const replay = join(root, 'replay');
  await Promise.all([mkdir(output, { mode:0o700 }), mkdir(replay, { mode:0o700 })]);
  const outputRoot = await openG2ProtectedDirectory(output); const replayRoot = await openG2ProtectedDirectory(replay); const attack = join(output, 'attacker-hardlink');
  try {
    await assert.rejects(publishG2Eligibility({ outputRoot, replayRoot, runId:'run-hardlink-race', nonce:'nonce-hardlink-race', receipt:{ ok:true }, canonicalJson:g2CanonicalJson, transactionHook:async(stage, paths)=>{ if(stage==='marker-ready') await link(paths.candidatePath, attack); } }), (error)=>error.code==='OUTPUT_CANDIDATE_CHANGED');
    assert.deepEqual(await readdir(output), ['attacker-hardlink']); assert.deepEqual(await readdir(replay), []); assert.equal((await stat(attack)).nlink, 1);
  } finally { await outputRoot.handle.close(); await replayRoot.handle.close(); await rm(root,{recursive:true,force:true}); }
});

test('publication detects replay marker removal and replacement without deleting attacker content', async (t) => {
  for (const [name, stage, replace] of [['removal','marker-ready',false], ['replacement before link','marker-ready',true], ['replacement after link','final-linked',true]]) await t.test(name, async()=>{
    const root=await mkdtemp(join(tmpdir(),'g2-ah2-marker-race-')); const output=join(root,'output'); const replay=join(root,'replay'); await Promise.all([mkdir(output,{mode:0o700}),mkdir(replay,{mode:0o700})]);
    const outputRoot=await openG2ProtectedDirectory(output); const replayRoot=await openG2ProtectedDirectory(replay);
    try {
      await assert.rejects(publishG2Eligibility({ outputRoot,replayRoot,runId:`run-marker-${name.replaceAll(' ','-')}`,nonce:`nonce-marker-${name.replaceAll(' ','-')}`,receipt:{ok:true},canonicalJson:g2CanonicalJson,transactionHook:async(current,paths)=>{if(current===stage){await unlink(paths.markerPath);if(replace)await writeFile(paths.markerPath,'attacker-owned-replacement\n',{mode:0o600});}}}),error=>error.code==='REPLAY_MARKER_CHANGED');
      assert.deepEqual(await readdir(output),[]);
      if(replace){assert.equal((await readdir(replay)).length,1);assert.equal(await readFile(join(replay,(await readdir(replay))[0]),'utf8'),'attacker-owned-replacement\n');}else assert.deepEqual(await readdir(replay),[]);
    } finally { await outputRoot.handle.close(); await replayRoot.handle.close(); await rm(root,{recursive:true,force:true}); }
  });
});

test('late candidate failure rolls back owned marker and leaves nonce reusable', async () => {
  const root=await mkdtemp(join(tmpdir(),'g2-ah2-late-rollback-')); const output=join(root,'output'); const replay=join(root,'replay'); await Promise.all([mkdir(output,{mode:0o700}),mkdir(replay,{mode:0o700})]);
  const outputRoot=await openG2ProtectedDirectory(output); const replayRoot=await openG2ProtectedDirectory(replay);
  try {
    await assert.rejects(publishG2Eligibility({outputRoot,replayRoot,runId:'run-late-rollback',nonce:'nonce-late-rollback',receipt:{ok:true},canonicalJson:g2CanonicalJson,transactionHook:async(stage,paths)=>{if(stage==='marker-ready')await unlink(paths.candidatePath);}}),error=>error.code==='OUTPUT_CANDIDATE_CHANGED');
    assert.deepEqual(await readdir(output),[]); assert.deepEqual(await readdir(replay),[]);
    await publishG2Eligibility({outputRoot,replayRoot,runId:'run-late-rollback',nonce:'nonce-late-rollback',receipt:{ok:true},canonicalJson:g2CanonicalJson});
    assert.deepEqual(await readdir(output),['run-late-rollback.eligibility.json']); assert.equal((await readdir(replay)).length,1);
  } finally { await outputRoot.handle.close(); await replayRoot.handle.close(); await rm(root,{recursive:true,force:true}); }
});

test('a final hardlink added before completion prevents apparent success and rolls back owned names', async () => {
  const root=await mkdtemp(join(tmpdir(),'g2-ah2-final-hardlink-')); const output=join(root,'output'); const replay=join(root,'replay'); await Promise.all([mkdir(output,{mode:0o700}),mkdir(replay,{mode:0o700})]); const attack=join(output,'attacker-final-hardlink');
  const outputRoot=await openG2ProtectedDirectory(output); const replayRoot=await openG2ProtectedDirectory(replay);
  try {
    await assert.rejects(publishG2Eligibility({outputRoot,replayRoot,runId:'run-final-hardlink',nonce:'nonce-final-hardlink',receipt:{ok:true},canonicalJson:g2CanonicalJson,transactionHook:async(stage,paths)=>{if(stage==='candidate-unlinked')await link(paths.finalPath,attack);}}),error=>error.code==='OUTPUT_PUBLICATION_RACE');
    assert.deepEqual(await readdir(output),['attacker-final-hardlink']); assert.deepEqual(await readdir(replay),[]); assert.equal((await stat(attack)).nlink,1);
  } finally { await outputRoot.handle.close(); await replayRoot.handle.close(); await rm(root,{recursive:true,force:true}); }
});

test('G2 production modules statically contain no subprocess, transport, database or provider SDK imports', async () => {
  for (const name of ['g2-backup-restore-readiness.mjs', 'g2-backup-restore-readiness-offline-core.mjs', 'g2-backup-restore-readiness-core.mjs']) {
    const source = await readFile(join(dirname(CLI), name), 'utf8');
    assert.equal(/(?:node:)?(?:child_process|http2?|https|tls|net|dgram|dns)|(?:pg|postgres|vercel|railway|supabase)(?:\/|['"])/u.test(source), false, name);
  }
});

test('strace transport/exec proof is explicit when available', async (t) => {
  let strace;
  for (const candidate of ['/usr/bin/strace', '/bin/strace']) { try { await access(candidate); strace = candidate; break; } catch {} }
  if (!strace) { t.diagnostic('strace unavailable: static import and PATH canaries remain enforced'); return; }
  const s = await setup(); const trace = join(s.root, 'trace.log'); try {
    const result = await new Promise((accept) => { const child = spawn(strace, ['-f', '-e', 'trace=execve,connect,socket', '-o', trace, process.execPath, CLI, ...s.args], { env: { ...process.env, PATH: s.hostilePath }, stdio: ['ignore', 'pipe', 'pipe'] }); const out = []; const err = []; child.stdout.on('data', (x) => out.push(x)); child.stderr.on('data', (x) => err.push(x)); child.on('close', (code) => accept({ code, stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString() })); });
    assert.equal(result.code, 0, result.stderr); const traced = await readFile(trace, 'utf8'); assert.equal(/socket\(|connect\(/u.test(traced), false); assert.equal((traced.match(/execve\(/gu) ?? []).length, 1);
  } finally { await s.cleanup(); }
});
