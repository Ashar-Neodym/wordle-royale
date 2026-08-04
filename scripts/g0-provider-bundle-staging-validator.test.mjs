import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { validateStagedProviderBundle } from './g0-provider-bundle-staging-validator.mjs';

const SNAPSHOT = `sha256:${'a'.repeat(64)}`;
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const rejects = (code, promise) => assert.rejects(promise, (error) => error?.code === code, `expected ${code}`);

async function writable(path) {
  let st; try { st = await lstat(path); } catch { return; }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    await chmod(path, 0o700);
    for (const name of await readdir(path)) await writable(join(path, name));
  } else if (!st.isSymbolicLink()) await chmod(path, 0o600);
}
async function cleanup(path) { await writable(path); await rm(path, { recursive: true, force: true }); }

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'wordle-an3b-')); await chmod(base, 0o700);
  const root = join(base, 'staging');
  const profile = generateProviderBundleProfile('vercel');
  const files = new Map([
    ['package-lock.json', Buffer.from('{"fixture":true}\n')],
    ['node_modules/vercel/package.json', Buffer.from('{"name":"vercel","version":"58.4.4"}\n')],
    ['node_modules/vercel/dist/vc.js', Buffer.from('fixture entrypoint\n')],
    [profile.relativePath, profile.bytes],
  ]);
  await mkdir(root);
  for (const [relative, bytes] of files) {
    const path = join(root, ...relative.split('/')); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); await chmod(path, 0o444);
  }
  const makeReadonly = async (path) => {
    const st = await lstat(path); if (!st.isDirectory()) return;
    for (const name of await readdir(path)) await makeReadonly(join(path, name));
    await chmod(path, 0o555);
  };
  await makeReadonly(root);
  const directoryPaths = ['.', 'invocation-profiles', 'invocation-profiles/vercel-g0-readonly', 'node_modules', 'node_modules/vercel', 'node_modules/vercel/dist'];
  const payloadBytes = [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  const assemblyResult = Object.freeze({ status: 'STAGED', provider: 'vercel', packageCount: 1, nodeCount: directoryPaths.length + files.size, payloadBytes, sourceSnapshotSha256: SNAPSHOT });
  return { base, root, assemblyResult, files };
}

const RACE_BYTES = 64 * 1024 * 1024;
async function addRaceFile(f, directory = join(f.root, 'node_modules/vercel/dist')) {
  await chmod(directory, 0o755);
  const path = join(directory, 'race-payload');
  await writeFile(path, 'x'); await truncate(path, RACE_BYTES); await chmod(path, 0o444); await chmod(directory, 0o555);
  return {
    path,
    assemblyResult: Object.freeze({ ...f.assemblyResult, nodeCount: f.assemblyResult.nodeCount + 1, payloadBytes: f.assemblyResult.payloadBytes + RACE_BYTES }),
  };
}

async function waitUntilHeld(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    for (const fd of await readdir('/proc/self/fd')) {
      let target; try { target = await readlink(`/proc/self/fd/${fd}`); } catch { continue; }
      if (target === path) return;
    }
    await new Promise((accept) => setTimeout(accept, 1));
  }
  assert.fail(`validator did not hold ${path}`);
}

test('closed API rejects extra inputs and malformed assembly reports', async () => {
  const f = await fixture();
  try {
    await rejects('STAGING_VALIDATOR_INPUT_INVALID', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: f.assemblyResult, collectorUid: process.getuid() }));
    await rejects('STAGING_ASSEMBLY_RESULT_INVALID', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: { ...f.assemblyResult, provider: 'railway' } }));
    await rejects('STAGING_VALIDATOR_INPUT_INVALID', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: `${f.root}/..`, assemblyResult: f.assemblyResult }));
  } finally { await cleanup(f.base); }
});

test('independent complete scan reaches immutable artifact pin enforcement', async () => {
  const f = await fixture();
  try {
    await rejects('ARTIFACT_LOCKFILE_PIN_MISMATCH', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: f.assemblyResult }));
  } finally { await cleanup(f.base); }
});

test('root mode, additions, symlinks, and repeated file inodes fail before artifact generation', async () => {
  for (const attack of ['mode', 'addition', 'symlink', 'hardlink']) {
    const f = await fixture();
    try {
      if (attack === 'mode') await chmod(f.root, 0o755);
      else {
        await chmod(f.root, 0o755);
        if (attack === 'addition') { await writeFile(join(f.root, 'extra'), 'x'); await chmod(join(f.root, 'extra'), 0o444); }
        if (attack === 'symlink') await symlink('package-lock.json', join(f.root, 'alias'));
        if (attack === 'hardlink') await link(join(f.root, 'package-lock.json'), join(f.root, 'alias'));
        await chmod(f.root, 0o555);
      }
      const wanted = attack === 'mode' ? 'STAGING_ROOT_UNSAFE' : attack === 'addition' ? 'STAGING_NODE_COUNT_MISMATCH' : attack === 'symlink' ? 'STAGING_SYMLINK_FORBIDDEN' : 'STAGING_FILE_POLICY';
      await rejects(wanted, validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: f.assemblyResult }));
    } finally { await cleanup(f.base); }
  }
});

test('assembly node, payload, digest, and provider drift fail closed', async () => {
  const f = await fixture();
  try {
    for (const changed of [
      { ...f.assemblyResult, nodeCount: f.assemblyResult.nodeCount + 1 },
      { ...f.assemblyResult, payloadBytes: f.assemblyResult.payloadBytes + 1 },
    ]) await rejects(changed.nodeCount !== f.assemblyResult.nodeCount ? 'STAGING_NODE_COUNT_MISMATCH' : 'STAGING_PAYLOAD_MISMATCH', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: changed }));
    await rejects('STAGING_ASSEMBLY_RESULT_INVALID', validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: { ...f.assemblyResult, sourceSnapshotSha256: digest(Buffer.from('uppercase')).toUpperCase() } }));
  } finally { await cleanup(f.base); }
});

test('descriptor-relative scan rejects a nested replacement that is scanned and then restored', async () => {
  const f = await fixture(); const dist = join(f.root, 'node_modules/vercel/dist'); const original = `${dist}.original`; const replacement = `${dist}.replacement`;
  try {
    const raced = await addRaceFile(f); const vercel = join(f.root, 'node_modules/vercel'); await chmod(f.root, 0o755); await chmod(vercel, 0o755);
    await rename(dist, original); await mkdir(replacement); await writeFile(join(replacement, 'vc.js'), 'fixture entrypoint\n');
    await chmod(join(replacement, 'vc.js'), 0o444); await writeFile(join(replacement, 'race-payload'), 'x');
    await truncate(join(replacement, 'race-payload'), RACE_BYTES); await chmod(join(replacement, 'race-payload'), 0o444); await chmod(replacement, 0o555);
    await rename(replacement, dist); await chmod(vercel, 0o555); await chmod(f.root, 0o555);
    const validation = validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: raced.assemblyResult });
    await waitUntilHeld(join(dist, 'race-payload'));
    await chmod(vercel, 0o755); await rename(dist, replacement); await rename(original, dist); await chmod(vercel, 0o555);
    await rejects('STAGING_FILESYSTEM_CHANGED', validation);
  } finally { await cleanup(f.base); }
});

test('held root and parent replacement races fail closed', async (t) => {
  for (const target of ['root', 'parent']) await t.test(target, async () => {
    const f = await fixture(); const moved = `${f.base}.moved`;
    try {
      const raced = await addRaceFile(f);
      const validation = validateStagedProviderBundle({ provider: 'vercel', stagingRoot: f.root, assemblyResult: raced.assemblyResult });
      await waitUntilHeld(raced.path);
      if (target === 'root') {
        await rename(f.root, `${f.root}.moved`); await mkdir(f.root); await chmod(f.root, 0o555);
      } else {
        await rename(f.base, moved); await mkdir(f.base); await chmod(f.base, 0o700);
      }
      await assert.rejects(validation, (error) => ['STAGING_FILESYSTEM_CHANGED', 'STAGING_ROOT_CHANGED', 'STAGING_PARENT_CHANGED'].includes(error?.code));
    } finally { await cleanup(f.base); await cleanup(moved); }
  });
});

test('validator is structurally separate from execution validation and documents Node xattr limit', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-staging-validator.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /validateProviderToolBundleForExecution|allowUserOwned|collectorUid|ownerOverride|betweenSnapshots/u);
  assert.match(source, /process\.getuid/u);
  assert.match(source, /no built-in listxattr\(2\) API/u);
  assert.match(source, /\/proc\/self\/fd\/\$\{handle\.fd\}/u);
  assert.doesNotMatch(source, /join\(stagingRoot\s*,/u, 'recursive staging traversal must stay anchored to held directory descriptors');
  assert.doesNotMatch(source, /node:(?:net|http|https|dns|tls|child_process)|\b(?:fetch|npm|sudo|spawn|exec)\b|process\.env/u);
});
