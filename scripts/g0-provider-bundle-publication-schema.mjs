import { createHash } from 'node:crypto';
import { generateProviderBundleArtifacts } from './g0-provider-bundle-artifact-core.mjs';
import {
  canonicalProviderToolJson, getProviderToolArtifactPolicy, validateProviderToolDescriptor,
  validateProviderToolTreeManifest,
} from './g0-provider-tool-bundle.mjs';

export const CANONICAL_SOURCE_SNAPSHOT_SCHEMA = 'wordle-royale-g0-canonical-source-snapshot/v1';
export const ACQUISITION_RECORD_SCHEMA = 'wordle-royale-g0-acquisition-record/v1';
export const INERT_INSTALL_PLAN_SCHEMA = 'wordle-royale-g0-inert-install-plan/v1';
export const LOCAL_PUBLICATION_INDEX_SCHEMA = 'wordle-royale-g0-local-publication-index/v1';
export const LOCAL_PUBLICATION_COMMIT_SCHEMA = 'wordle-royale-g0-local-publication-commit/v1';
export const MAX_PUBLICATION_JSON_BYTES = 256 * 1024;
export const MAX_SOURCE_SNAPSHOT_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_SNAPSHOT_ENTRIES = 20_000;

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const PROVIDERS = Object.freeze(['vercel', 'railway', 'supabase']);
const INPUTS = Object.freeze({
  lockfile: Object.freeze({ path: 'tools/g0-provider-acquisition/v1/package-lock.json', sha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90' }),
  packageJson: Object.freeze({ path: 'tools/g0-provider-acquisition/v1/package.json', sha256: 'sha256:58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde' }),
});
const TOOLCHAIN = Object.freeze({
  node: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', sha256: 'sha256:5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926', version: 'v26.3.0' }),
  npm: Object.freeze({ path: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', realpath: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', sha256: 'sha256:8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7', version: '11.16.0' }),
});
const TARGET = Object.freeze({ cpu: 'x64', libc: 'glibc', os: 'linux' });

const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, code) => {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(code);
};
const same = (actual, expected, code) => { if (actual !== expected) fail(code); };
const digest = (value, code) => { if (typeof value !== 'string' || !SHA256.test(value)) fail(code); return value; };
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonicalBytes(value) { return Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8'); }
function immutableCompilation(document, bytes) {
  const held = Buffer.from(bytes); const result = { document, sha256: sha256(held) };
  Object.defineProperty(result, 'bytes', { enumerable: true, get: () => Buffer.from(held) });
  return deepFreeze(result);
}
function compile(document, validator, cap = MAX_PUBLICATION_JSON_BYTES) {
  validator(document); const bytes = canonicalBytes(document); if (bytes.length > cap) fail('PUBLICATION_DOCUMENT_SIZE_INVALID');
  deepFreeze(document); return immutableCompilation(document, bytes);
}
function wireBytes(input, cap) {
  if (!(Buffer.isBuffer(input) || input instanceof Uint8Array)) fail('PUBLICATION_WIRE_INVALID');
  const bytes = Buffer.from(input); if (bytes.length < 3 || bytes.length > cap) fail('PUBLICATION_DOCUMENT_SIZE_INVALID');
  const text = bytes.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(bytes)) fail('PUBLICATION_UTF8_INVALID');
  return { bytes, text };
}
function parseWire(input, validator, cap = MAX_PUBLICATION_JSON_BYTES) {
  const { bytes, text } = wireBytes(input, cap); let value;
  try { value = JSON.parse(text); } catch { fail('PUBLICATION_JSON_INVALID'); }
  validator(value); if (!canonicalBytes(value).equals(bytes)) fail('PUBLICATION_NON_CANONICAL');
  return deepFreeze(value);
}
function relativePath(value, code = 'PUBLICATION_PATH_INVALID') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || Buffer.byteLength(value) > 1024
      || value.startsWith('/') || value.includes('\\') || value.includes('\0')) fail(code);
  const components = value.split('/');
  if (components.some((part) => part === '' || part === '.' || part === '..' || Buffer.byteLength(part) > 255)) fail(code);
  return value;
}
function sortedUnique(values, pathOf, code) {
  const folded = new Set(); let previous;
  for (const value of values) {
    const path = pathOf(value); relativePath(path, code);
    if (previous !== undefined && rawCompare(previous, path) >= 0) fail(code);
    const key = path.toLowerCase(); if (folded.has(key)) fail(code); folded.add(key); previous = path;
  }
}
function providerPolicy(provider) {
  if (!PROVIDERS.includes(provider)) fail('PUBLICATION_PROVIDER_UNSUPPORTED');
  const policy = getProviderToolArtifactPolicy(provider);
  return { policy, artifactId: `${provider}-${policy.version}`, metadataRoot: `/opt/wordle-royale/g0-provider-tools/metadata/${provider}-${policy.version}` };
}

export function validateCanonicalSourceSnapshot(snapshot) {
  exact(snapshot, ['entries', 'packagePaths', 'schemaVersion', 'target'], 'SOURCE_SNAPSHOT_INVALID');
  same(snapshot.schemaVersion, CANONICAL_SOURCE_SNAPSHOT_SCHEMA, 'SOURCE_SNAPSHOT_INVALID');
  exact(snapshot.target, ['cpu', 'libc', 'os'], 'SOURCE_SNAPSHOT_INVALID');
  for (const key of Object.keys(TARGET)) same(snapshot.target[key], TARGET[key], 'SOURCE_SNAPSHOT_TARGET_INVALID');
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.packagePaths) || snapshot.entries.length < 1 || snapshot.entries.length > MAX_SOURCE_SNAPSHOT_ENTRIES || snapshot.packagePaths.length < 1) fail('SOURCE_SNAPSHOT_LIMIT');
  sortedUnique(snapshot.packagePaths, (x) => x, 'SOURCE_SNAPSHOT_PACKAGE_PATH_INVALID');
  const packageFolded = new Set(snapshot.packagePaths.map((x) => x.toLowerCase()));
  for (const path of snapshot.packagePaths) {
    if (path.split('/').includes('.bin') || path === 'package.json' || path === 'package-lock.json' || path === 'node_modules/.package-lock.json') fail('SOURCE_SNAPSHOT_PACKAGE_PATH_INVALID');
  }
  sortedUnique(snapshot.entries, (x) => plain(x) ? x.path : fail('SOURCE_SNAPSHOT_ENTRY_INVALID'), 'SOURCE_SNAPSHOT_PATH_INVALID');
  const byPath = new Map(); const native = new Set(PROVIDERS.flatMap((provider) => { const p = getProviderToolArtifactPolicy(provider); return p.native ? [p.native.path] : []; }));
  for (const entry of snapshot.entries) {
    if (!plain(entry) || !['directory', 'file'].includes(entry.type)) fail('SOURCE_SNAPSHOT_ENTRY_INVALID');
    exact(entry, entry.type === 'file' ? ['mode', 'path', 'sha256', 'type'] : ['mode', 'path', 'type'], 'SOURCE_SNAPSHOT_ENTRY_INVALID');
    if (entry.path.split('/').includes('.bin') || ['package.json', 'package-lock.json', 'node_modules/.package-lock.json'].includes(entry.path)) fail('SOURCE_SNAPSHOT_EXCLUDED_PATH');
    if (entry.type === 'directory') { if (entry.mode !== 0o555) fail('SOURCE_SNAPSHOT_MODE_INVALID'); }
    else { digest(entry.sha256, 'SOURCE_SNAPSHOT_ENTRY_INVALID'); if (entry.mode !== (native.has(entry.path) ? 0o555 : 0o444)) fail('SOURCE_SNAPSHOT_MODE_INVALID'); }
    byPath.set(entry.path, entry);
  }
  for (const packagePath of snapshot.packagePaths) if (byPath.get(packagePath)?.type !== 'directory') fail('SOURCE_SNAPSHOT_PACKAGE_ROOT_MISSING');
  for (const entry of snapshot.entries) {
    const owners = snapshot.packagePaths.filter((root) => entry.path === root || entry.path.startsWith(`${root}/`));
    if (owners.length === 0) fail('SOURCE_SNAPSHOT_UNOWNED_PATH');
    if (!packageFolded.has(entry.path.toLowerCase())) {
      const parent = entry.path.slice(0, entry.path.lastIndexOf('/'));
      if (!byPath.has(parent) || byPath.get(parent).type !== 'directory') fail('SOURCE_SNAPSHOT_PARENT_MISSING');
    }
  }
  if (canonicalBytes(snapshot).length > MAX_SOURCE_SNAPSHOT_BYTES) fail('SOURCE_SNAPSHOT_SIZE_LIMIT');
  return snapshot;
}
export function canonicalSourceSnapshotBytes(snapshot) {
  validateCanonicalSourceSnapshot(snapshot); return canonicalBytes(snapshot);
}
export function hashCanonicalSourceSnapshot(snapshot) { return sha256(canonicalSourceSnapshotBytes(snapshot)); }
export function compileCanonicalSourceSnapshot(snapshot) { return compile(structuredClone(snapshot), validateCanonicalSourceSnapshot, MAX_SOURCE_SNAPSHOT_BYTES); }
export function parseCanonicalSourceSnapshot(bytes) { return parseWire(bytes, validateCanonicalSourceSnapshot, MAX_SOURCE_SNAPSHOT_BYTES); }

function acquisitionDocument(canonicalSourceSnapshotSha256) {
  return {
    acquisitionInputs: { lockfile: { ...INPUTS.lockfile }, packageJson: { ...INPUTS.packageJson } },
    canonicalSourceSnapshotSha256,
    networkPolicy: { allowedDnsOnly: true, allowedRegistryOrigin: 'https://registry.npmjs.org/', ambientCredentialsAllowed: false, ambientProxyAllowed: false, registryTlsOnly: true },
    npmPolicy: { audit: false, fund: false, ignoreScripts: true, installOperation: 'ci' },
    schemaVersion: ACQUISITION_RECORD_SCHEMA, target: { ...TARGET },
    toolchain: { node: { ...TOOLCHAIN.node }, npm: { ...TOOLCHAIN.npm } },
  };
}
function validateAcquisitionRecord(value) {
  digest(value?.canonicalSourceSnapshotSha256, 'ACQUISITION_RECORD_INVALID');
  const expected = acquisitionDocument(value.canonicalSourceSnapshotSha256);
  if (canonicalProviderToolJson(value) !== canonicalProviderToolJson(expected)) fail('ACQUISITION_RECORD_INVALID'); return value;
}
export function compileAcquisitionRecord(input) {
  exact(input, ['canonicalSourceSnapshotSha256'], 'ACQUISITION_INPUT_INVALID');
  digest(input.canonicalSourceSnapshotSha256, 'ACQUISITION_INPUT_INVALID'); return compile(acquisitionDocument(input.canonicalSourceSnapshotSha256), validateAcquisitionRecord);
}
export function parseAcquisitionRecord(bytes) { return parseWire(bytes, validateAcquisitionRecord); }

function installPlanDocument(provider) {
  const { policy, artifactId, metadataRoot } = providerPolicy(provider);
  return {
    artifactId,
    destinations: { acquisitionRecord: `${metadataRoot}/acquisition-record.json`, bundleRoot: policy.finalRoot, commit: `${metadataRoot}/COMMIT`, descriptor: `${metadataRoot}/descriptor.json`, installPlan: `${metadataRoot}/install-plan.json`, publicationIndex: `${metadataRoot}/publication-index.json`, treeManifest: `${policy.finalRoot}.tree-manifest.json` },
    privilegedExecutionAuthorized: false,
    productionValidation: { descriptorSource: 'descriptor.json', expectedArtifactId: artifactId, validatorExport: 'validateProviderToolBundleForExecution', validatorModule: 'scripts/g0-provider-tool-bundle.mjs' },
    publicationPolicy: { atomicNoReplaceRequired: true, copyRegularFilesRequired: true, hardlinksForbidden: true, safeRootOwnedAncestryRequired: true, separateHumanApprovalRequired: true },
    requiredMetadata: { directoryMode: 0o555, fileMode: 0o444, gid: 0, uid: 0 },
    schemaVersion: INERT_INSTALL_PLAN_SCHEMA,
    sources: { acquisitionRecord: 'acquisition-record.json', bundleRoot: 'bundle', commit: 'COMMIT', descriptor: 'descriptor.json', installPlan: 'install-plan.json', publicationIndex: 'publication-index.json', treeManifest: 'bundle.tree-manifest.json' },
  };
}
const FORBIDDEN_KEY = /^(?:command|commands|argv|args|sudo|shell|interpreter|delete|deletion|wildcard|session|auth|authentication|credential|credentials|token|tokens|environment|env|approvalIdentity)$/iu;
const FORBIDDEN_TEXT = /(?:\b(?:command|commands|argv|sudo|shell|interpreter|session|auth|authentication|credential|credentials|token|tokens|environment)\b|provider[ _-]?(?:invocation|executable))/iu;
function rejectForbidden(value, path = '') {
  if (Array.isArray(value)) return value.forEach((x, i) => rejectForbidden(x, `${path}[${i}]`));
  if (plain(value)) for (const [key, child] of Object.entries(value)) { if (FORBIDDEN_KEY.test(key)) fail('INSTALL_PLAN_FORBIDDEN_CONTENT'); rejectForbidden(child, `${path}.${key}`); }
  else if (typeof value === 'string' && FORBIDDEN_TEXT.test(value)) fail('INSTALL_PLAN_FORBIDDEN_CONTENT');
}
function validateInstallPlan(value) {
  rejectForbidden(value); if (!plain(value) || typeof value.artifactId !== 'string') fail('INSTALL_PLAN_INVALID');
  const provider = PROVIDERS.find((name) => value.artifactId === `${name}-${getProviderToolArtifactPolicy(name).version}`);
  if (!provider || canonicalProviderToolJson(value) !== canonicalProviderToolJson(installPlanDocument(provider))) fail('INSTALL_PLAN_INVALID'); return value;
}
export function compileInertInstallPlan(input) {
  exact(input, ['provider'], 'INSTALL_PLAN_INPUT_INVALID'); return compile(installPlanDocument(input.provider), validateInstallPlan);
}
export function parseInertInstallPlan(bytes) { return parseWire(bytes, validateInstallPlan); }

function documentOf(value, code) { const document = value?.document ?? value; if (!plain(document)) fail(code); return document; }
function validatePublicationIndex(value) {
  exact(value, ['artifactId', 'canonicalSourceSnapshotSha256', 'members', 'schemaVersion', 'sourceRevision'], 'PUBLICATION_INDEX_INVALID');
  same(value.schemaVersion, LOCAL_PUBLICATION_INDEX_SCHEMA, 'PUBLICATION_INDEX_INVALID'); digest(value.canonicalSourceSnapshotSha256, 'PUBLICATION_INDEX_INVALID'); if (!REVISION.test(value.sourceRevision)) fail('PUBLICATION_INDEX_INVALID');
  exact(value.members, ['acquisitionRecord', 'bundle', 'descriptor', 'installPlan', 'treeManifest'], 'PUBLICATION_INDEX_INVALID');
  const files = { acquisitionRecord: 'acquisition-record.json', descriptor: 'descriptor.json', installPlan: 'install-plan.json', treeManifest: 'bundle.tree-manifest.json' };
  for (const [key, path] of Object.entries(files)) { const member = value.members[key]; exact(member, ['mode', 'path', 'sha256'], 'PUBLICATION_INDEX_INVALID'); if (member.mode !== 0o400 || member.path !== path) fail('PUBLICATION_INDEX_INVALID'); digest(member.sha256, 'PUBLICATION_INDEX_INVALID'); }
  exact(value.members.bundle, ['path', 'treeManifestSha256'], 'PUBLICATION_INDEX_INVALID'); if (value.members.bundle.path !== 'bundle') fail('PUBLICATION_INDEX_INVALID'); digest(value.members.bundle.treeManifestSha256, 'PUBLICATION_INDEX_INVALID');
  if (value.members.bundle.treeManifestSha256 !== value.members.treeManifest.sha256) fail('PUBLICATION_INDEX_INVALID');
  const provider = PROVIDERS.find((name) => value.artifactId === `${name}-${getProviderToolArtifactPolicy(name).version}`); if (!provider) fail('PUBLICATION_INDEX_INVALID'); return value;
}
export function compilePublicationIndex(input) {
  exact(input, ['provider', 'manifest', 'descriptor', 'acquisitionRecord', 'installPlan', 'canonicalSourceSnapshotSha256', 'sourceRevision'], 'PUBLICATION_INDEX_INPUT_INVALID');
  const { artifactId } = providerPolicy(input.provider); digest(input.canonicalSourceSnapshotSha256, 'PUBLICATION_INDEX_INPUT_INVALID'); if (!REVISION.test(input.sourceRevision)) fail('PUBLICATION_INDEX_INPUT_INVALID');
  const manifest = documentOf(input.manifest, 'PUBLICATION_INDEX_INPUT_INVALID'); const descriptor = documentOf(input.descriptor, 'PUBLICATION_INDEX_INPUT_INVALID');
  const acquisition = documentOf(input.acquisitionRecord, 'PUBLICATION_INDEX_INPUT_INVALID'); const plan = documentOf(input.installPlan, 'PUBLICATION_INDEX_INPUT_INVALID');
  validateProviderToolTreeManifest(manifest, input.provider); validateProviderToolDescriptor(descriptor, input.provider); validateAcquisitionRecord(acquisition); validateInstallPlan(plan);
  if (descriptor.bundleRoot !== getProviderToolArtifactPolicy(input.provider).finalRoot || descriptor.bundleRealpath !== descriptor.bundleRoot || plan.artifactId !== artifactId || acquisition.canonicalSourceSnapshotSha256 !== input.canonicalSourceSnapshotSha256) fail('PUBLICATION_INDEX_BINDING_MISMATCH');
  const manifestBytes = canonicalBytes(manifest); const manifestHash = sha256(manifestBytes); if (descriptor.treeManifestSha256 !== manifestHash) fail('PUBLICATION_INDEX_BINDING_MISMATCH');
  const value = { artifactId, canonicalSourceSnapshotSha256: input.canonicalSourceSnapshotSha256, members: {
    acquisitionRecord: { mode: 0o400, path: 'acquisition-record.json', sha256: sha256(canonicalBytes(acquisition)) },
    bundle: { path: 'bundle', treeManifestSha256: manifestHash },
    descriptor: { mode: 0o400, path: 'descriptor.json', sha256: sha256(canonicalBytes(descriptor)) },
    installPlan: { mode: 0o400, path: 'install-plan.json', sha256: sha256(canonicalBytes(plan)) },
    treeManifest: { mode: 0o400, path: 'bundle.tree-manifest.json', sha256: manifestHash },
  }, schemaVersion: LOCAL_PUBLICATION_INDEX_SCHEMA, sourceRevision: input.sourceRevision };
  return compile(value, validatePublicationIndex);
}
export function parsePublicationIndex(bytes) { return parseWire(bytes, validatePublicationIndex); }
export function derivePublicationId(index) {
  const document = documentOf(index, 'PUBLICATION_INDEX_INVALID'); validatePublicationIndex(document); const bytes = canonicalBytes(document);
  return `${document.artifactId}-${sha256(bytes).slice(7, 39)}`;
}
function validateCommit(value) {
  exact(value, ['publicationIndexSha256', 'schemaVersion'], 'PUBLICATION_COMMIT_INVALID'); same(value.schemaVersion, LOCAL_PUBLICATION_COMMIT_SCHEMA, 'PUBLICATION_COMMIT_INVALID'); digest(value.publicationIndexSha256, 'PUBLICATION_COMMIT_INVALID'); return value;
}
export function compilePublicationCommit(input) {
  exact(input, ['publicationIndex'], 'PUBLICATION_COMMIT_INPUT_INVALID');
  const index = documentOf(input.publicationIndex, 'PUBLICATION_COMMIT_INPUT_INVALID'); validatePublicationIndex(index);
  return compile({ publicationIndexSha256: sha256(canonicalBytes(index)), schemaVersion: LOCAL_PUBLICATION_COMMIT_SCHEMA }, validateCommit);
}
export function parsePublicationCommit(bytes) { return parseWire(bytes, validateCommit); }

// Explicit aliases keep the vocabulary of the addendum available to callers.
export const compileInstallPlan = compileInertInstallPlan;
export const compileCommit = compilePublicationCommit;
export const parseCommit = parsePublicationCommit;
export const publicationIdFromIndex = derivePublicationId;
export { generateProviderBundleArtifacts };
