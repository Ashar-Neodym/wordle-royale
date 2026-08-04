import { constants } from 'node:fs';
import { chmod, mkdir, open, readdir, rename, rm, rmdir, writeFile, lstat } from 'node:fs/promises';
import { generateProviderBundleArtifacts, PROVIDER_BUNDLE_COPY_SCHEMA } from './g0-provider-bundle-artifact-core.mjs';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import { getProviderToolArtifactPolicy } from './g0-provider-tool-bundle.mjs';

const sourceRevision = '3bb698e44024ab3fd3e279d0877a971f26bc21a4';
const sourceHash = `sha256:${'a'.repeat(64)}`;
function entriesFor(provider) {
  const policy = getProviderToolArtifactPolicy(provider); const profile = generateProviderBundleProfile(provider);
  const files = new Map([
    ['package-lock.json', policy.lockfileSha256], [profile.relativePath, profile.sha256],
    [policy.entrypoint, policy.entrypointSha256], [`node_modules/${policy.package}/package.json`, `sha256:${'b'.repeat(64)}`],
  ]);
  if (policy.native) { files.set(policy.native.path, policy.native.sha256); files.set(`node_modules/${policy.native.package}/package.json`, `sha256:${'c'.repeat(64)}`); }
  const paths = new Map([['.', { path: '.', type: 'directory', mode: 0o555 }]]);
  for (const [path, hash] of files) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i += 1) { const dir = parts.slice(0, i).join('/'); paths.set(dir, { path: dir, type: 'directory', mode: 0o555 }); }
    paths.set(path, { path, type: 'file', mode: path === policy.native?.path ? 0o555 : 0o444, sha256: hash });
  }
  return [...paths.values()].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
}
export function testArtifacts(provider = 'vercel') {
  const entries = entriesFor(provider);
  return generateProviderBundleArtifacts({ provider, copierResult: { schemaVersion: PROVIDER_BUNDLE_COPY_SCHEMA, entries, packageCount: 1, nodeCount: entries.length, payloadBytes: 1, sourceSnapshotSha256: sourceHash } });
}
export async function makeSyntheticDeps(options = {}) {
  const artifacts = testArtifacts('vercel');
  const assembler = async ({ destinationRoot }) => {
    await mkdir(destinationRoot, { mode: 0o700 }); await writeFile(`${destinationRoot}/payload`, Buffer.from('tiny\n'), { mode: 0o400 });
    const root = await open(destinationRoot, constants.O_RDONLY | constants.O_DIRECTORY); try { await root.chmod(0o555); } finally { await root.close(); }
    return { status: 'STAGED', provider: 'vercel', packageCount: 1, nodeCount: 2, payloadBytes: 5, sourceSnapshotSha256: sourceHash };
  };
  const stagingValidator = async ({ stagingRoot }) => ({ status: 'STAGING_VALID', stagingRoot, artifacts });
  const sourceScanner = async () => ({ canonicalSourceSnapshotSha256: sourceHash });
  const publicationValidator = async ({ publicationParent, publicationName }) => {
    if (options.invalidFinal && publicationParent === options.publicationParent) throw Object.assign(new Error('invalid'), { code: 'INVALID' });
    return Object.freeze({ status: 'PUBLICATION_VALID', publicationValid: true, provider: 'vercel', artifactId: 'vercel-58.4.4', publicationId: publicationName, treeSha256: artifacts.manifestSha256, marker: publicationParent === options.publicationParent && options.differentFinal ? 'different' : 'same', counts: { nodeCount: 2, packageCount: 1, payloadBytes: 5 } });
  };
  const helperRunner = async ({ frame, parent }) => {
    const parentPath = `/proc/self/fd/${parent.handle.fd}`;
    if (frame.action === 'cleanup') {
      const root = `${parentPath}/${frame.scratchName}`; let unsafe = false;
      const makeWritable = async (path) => {
        const st = await lstat(path); if (st.isFile()) { if (st.nlink !== 1) { unsafe = true; return; } await chmod(path, 0o600); return; }
        if (!st.isDirectory()) { unsafe = true; return; }
        await chmod(path, 0o700); for (const name of await readdir(path)) await makeWritable(`${path}/${name}`);
      };
      await makeWritable(root).catch(() => { unsafe = true; }); if (unsafe) return 'CLEANUP_IDENTITY_LOST';
      await rm(root, { recursive: true, force: false }); return 'CLEANED';
    }
    if (frame.action === 'move') {
      const source = `${parentPath}/${frame.scratchName}/.bundle-work`;
      const destination = `${parentPath}/${frame.scratchName}/${frame.publicationName}/bundle`;
      try { await lstat(destination); return 'COLLISION'; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await rename(source, destination); return 'MOVED';
    }
    try { await lstat(`${parentPath}/${frame.publicationName}`); return 'COLLISION'; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await rename(`${parentPath}/${frame.scratchName}/${frame.publicationName}`, `${parentPath}/${frame.publicationName}`);
    await rmdir(`${parentPath}/${frame.scratchName}`); await parent.handle.sync(); return 'PUBLISHED';
  };
  return { assembler, stagingValidator, sourceScanner, publicationValidator, helperRunner, openHelper: null };
}
export async function cleanupSyntheticFixture(root) {
  const makeWritable = async (path) => {
    const st = await lstat(path);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      await chmod(path, 0o700);
      for (const name of await readdir(path)) await makeWritable(`${path}/${name}`);
      return;
    }
    await chmod(path, 0o600);
  };
  await makeWritable(root).catch(() => {});
  await rm(root, { recursive: true, force: true });
}
export const INPUT_REVISION = sourceRevision;
