import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, link, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { canonicalProviderToolJson } from './g0-provider-tool-bundle.mjs';
import { scanProviderBundlePublicationStandalone } from './g0-standalone-repro-scanner.mjs';

const H = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonical = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`);
async function cleanup(root) {
  const makeWritable = async (path) => {
    const st = await lstat(path); if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { await chmod(path, 0o700); for (const name of await readdir(path)) await makeWritable(join(path, name)); }
    else await chmod(path, 0o600);
  };
  await makeWritable(root).catch(() => {}); await rm(root, { recursive: true, force: true });
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'an5-standalone-')); await chmod(root, 0o700);
  const parent = join(root, 'publications'); await mkdir(parent, { mode: 0o700 });
  const artifactId = 'vercel-58.4.4'; const sourceRevision = 'a'.repeat(40); const snapshot = H('snapshot');
  const payload = Buffer.from('independent bytes\n');
  const entries = [
    { path: '.', type: 'directory', mode: 0o555 },
    { path: 'node_modules', type: 'directory', mode: 0o555 },
    { path: 'node_modules/pkg', type: 'directory', mode: 0o555 },
    { path: 'node_modules/pkg/file.js', type: 'file', mode: 0o444, sha256: H(payload) },
  ];
  const documents = {
    'acquisition-record.json': { canonicalSourceSnapshotSha256: snapshot },
    'bundle.tree-manifest.json': { entries, schemaVersion: 'independent-fixture/v1' },
    'descriptor.json': {}, 'install-plan.json': {},
  };
  const index = { artifactId, canonicalSourceSnapshotSha256: snapshot, sourceRevision }; const indexBytes = canonical(index); const indexHash = H(indexBytes);
  documents['publication-index.json'] = index; documents.COMMIT = { publicationIndexSha256: indexHash };
  const publicationName = `${artifactId}-${indexHash.slice(7, 39)}`; const publication = join(parent, publicationName); const bundle = join(publication, 'bundle');
  await mkdir(join(bundle, 'node_modules/pkg'), { recursive: true, mode: 0o755 }); await writeFile(join(bundle, 'node_modules/pkg/file.js'), payload, { mode: 0o444 });
  for (const directory of [join(bundle, 'node_modules/pkg'), join(bundle, 'node_modules'), bundle]) await chmod(directory, 0o555);
  for (const [name, value] of Object.entries(documents)) { await writeFile(join(publication, name), canonical(value), { mode: 0o400 }); await chmod(join(publication, name), 0o400); }
  await chmod(publication, 0o700);
  return { root, parent, publication, publicationName, payload };
}

test('stdlib scanner independently enumerates exact publication and returns canonical byte/mode/size plus inode evidence', async (t) => {
  const f = await fixture(); t.after(() => cleanup(f.root));
  const result = await scanProviderBundlePublicationStandalone({ publicationParent: f.parent, publicationName: f.publicationName });
  assert.equal(result.report.status, 'PUBLICATION_VALID'); assert.equal(result.report.provider, 'vercel');
  assert.deepEqual(result.report.counts, { packageCount: 1, nodeCount: 4, payloadBytes: f.payload.length });
  assert.equal(result.contentReport.tree.find((x) => x.path.endsWith('file.js')).size, f.payload.length);
  assert.equal(result.regularFileIdentities.length, 7); assert.equal(new Set(result.regularFileIdentities).size, 7);
});

test('stdlib scanner rejects an eighth publication member and hardlinked regular files', async (t) => {
  const extra = await fixture(); t.after(() => cleanup(extra.root));
  await writeFile(join(extra.publication, 'EXTRA'), 'x');
  await assert.rejects(scanProviderBundlePublicationStandalone({ publicationParent: extra.parent, publicationName: extra.publicationName }), { code: 'STANDALONE_SCAN_FAILED' });

  const linked = await fixture(); t.after(() => cleanup(linked.root));
  await chmod(join(linked.publication, 'bundle'), 0o755); await link(join(linked.publication, 'bundle/node_modules/pkg/file.js'), join(linked.publication, 'bundle/alias.js')); await chmod(join(linked.publication, 'bundle'), 0o555);
  await assert.rejects(scanProviderBundlePublicationStandalone({ publicationParent: linked.parent, publicationName: linked.publicationName }), { code: 'STANDALONE_SCAN_FAILED' });
});
