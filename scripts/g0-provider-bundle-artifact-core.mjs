import { createHash } from 'node:crypto';
import { generateProviderBundleProfile } from './g0-provider-bundle-profile.mjs';
import {
  PROVIDER_TOOL_SCHEMA, PROVIDER_TOOL_TREE_MANIFEST_SCHEMA, canonicalProviderToolJson,
  getProviderToolArtifactPolicy, validateProviderToolDescriptor, validateProviderToolTreeManifest,
} from './g0-provider-tool-bundle.mjs';

export const PROVIDER_BUNDLE_COPY_SCHEMA = 'wordle-g0-bundle-copy/v2';

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys, code) => {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(code);
};
const digest = (value, code = 'ARTIFACT_COPY_RESULT_INVALID') => {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code);
};
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const canonicalBytes = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function validatePathBounds(path) {
  if (Buffer.from(path, 'utf8').toString('utf8') !== path) fail('ARTIFACT_PATH_INVALID');
  if (Buffer.byteLength(path, 'utf8') > 1024) fail('ARTIFACT_PATH_LIMIT');
  if (path !== '.' && path.split('/').some((component) => Buffer.byteLength(component, 'utf8') > 255)) fail('ARTIFACT_COMPONENT_LIMIT');
}

function requiredEntry(byPath, path, type, mode, wantedHash, code) {
  const entry = byPath.get(path);
  if (!entry || entry.type !== type || entry.mode !== mode || (wantedHash !== undefined && entry.sha256 !== wantedHash)) fail(code);
  return entry;
}

function immutableResult(fields, manifestBytes, descriptorBytes) {
  // Buffers cannot be frozen by JavaScript. Keep their canonical bytes private
  // and return a fresh copy from each read, so a consumer cannot mutate the
  // artifact or alter a later read. Every ordinary object/array is deep-frozen.
  const result = { ...fields };
  Object.defineProperties(result, {
    manifestBytes: { enumerable: true, get: () => Buffer.from(manifestBytes) },
    descriptorBytes: { enumerable: true, get: () => Buffer.from(descriptorBytes) },
  });
  return deepFreeze(result);
}

// This is a pure copier-report compiler. bundleTreeSha256 is deliberately the
// digest of the canonical LF-terminated tree-manifest bytes (and therefore
// equals manifestSha256); source/staging identities never enter either artifact.
export function generateProviderBundleArtifacts(input) {
  if (arguments.length !== 1) fail('ARTIFACT_INPUT_INVALID');
  exact(input, ['provider', 'copierResult'], 'ARTIFACT_INPUT_INVALID');
  const { provider, copierResult } = input;
  if (typeof provider !== 'string') fail('ARTIFACT_INPUT_INVALID');
  const policy = getProviderToolArtifactPolicy(provider);
  const profile = generateProviderBundleProfile(provider);

  exact(copierResult, ['schemaVersion', 'packageCount', 'nodeCount', 'payloadBytes', 'entries', 'sourceSnapshotSha256'], 'ARTIFACT_COPY_RESULT_INVALID');
  if (copierResult.schemaVersion !== PROVIDER_BUNDLE_COPY_SCHEMA
      || !Number.isSafeInteger(copierResult.packageCount) || copierResult.packageCount < 1
      || !Number.isSafeInteger(copierResult.nodeCount) || copierResult.nodeCount < 2
      || !Number.isSafeInteger(copierResult.payloadBytes) || copierResult.payloadBytes < 0
      || !Array.isArray(copierResult.entries) || copierResult.nodeCount !== copierResult.entries.length) fail('ARTIFACT_COPY_RESULT_INVALID');
  digest(copierResult.sourceSnapshotSha256);
  if (copierResult.packageCount > policy.limits.maxPackages) fail('ARTIFACT_PACKAGE_LIMIT');
  if (copierResult.nodeCount > policy.limits.maxNodes) fail('ARTIFACT_NODE_LIMIT');
  if (copierResult.payloadBytes > policy.limits.maxPayloadBytes) fail('ARTIFACT_PAYLOAD_LIMIT');

  let previous;
  const entries = copierResult.entries.map((source) => {
    if (!plain(source) || (source.type !== 'directory' && source.type !== 'file')) fail('ARTIFACT_ENTRY_INVALID');
    exact(source, source.type === 'file' ? ['path', 'type', 'mode', 'sha256'] : ['path', 'type', 'mode'], 'ARTIFACT_ENTRY_INVALID');
    if (typeof source.path !== 'string') fail('ARTIFACT_ENTRY_INVALID');
    validatePathBounds(source.path);
    if (previous !== undefined && rawCompare(previous, source.path) >= 0) fail('ARTIFACT_ENTRY_ORDER_INVALID');
    previous = source.path;
    const wantedMode = source.type === 'directory' ? 0o555 : policy.native?.path === source.path ? 0o555 : 0o444;
    if (source.mode !== wantedMode) fail('ARTIFACT_MODE_INVALID');
    if (source.type === 'file') digest(source.sha256, 'ARTIFACT_ENTRY_INVALID');
    return source.type === 'file'
      ? { path: source.path, type: source.type, mode: source.mode, sha256: source.sha256 }
      : { path: source.path, type: source.type, mode: source.mode };
  });

  const manifest = { schemaVersion: PROVIDER_TOOL_TREE_MANIFEST_SCHEMA, entries };
  validateProviderToolTreeManifest(manifest, provider);
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  requiredEntry(byPath, 'package-lock.json', 'file', 0o444, policy.lockfileSha256, 'ARTIFACT_LOCKFILE_PIN_MISMATCH');
  requiredEntry(byPath, profile.relativePath, 'file', 0o444, profile.sha256, 'ARTIFACT_PROFILE_PIN_MISMATCH');
  requiredEntry(byPath, policy.entrypoint, 'file', 0o444, policy.entrypointSha256, 'ARTIFACT_ENTRYPOINT_PIN_MISMATCH');
  const packageJsonPath = `node_modules/${policy.package}/package.json`;
  const packageJson = requiredEntry(byPath, packageJsonPath, 'file', 0o444, undefined, 'ARTIFACT_PACKAGE_JSON_MISSING');

  let nativeBinary = null;
  if (policy.native) {
    const native = requiredEntry(byPath, policy.native.path, 'file', 0o555, policy.native.sha256, 'ARTIFACT_NATIVE_PIN_MISMATCH');
    const nativePackageJsonPath = `node_modules/${policy.native.package}/package.json`;
    const nativePackageJson = requiredEntry(byPath, nativePackageJsonPath, 'file', 0o444, undefined, 'ARTIFACT_NATIVE_PACKAGE_JSON_MISSING');
    nativeBinary = {
      package: policy.native.package, version: policy.native.version, path: native.path,
      sha256: native.sha256, packageJsonSha256: nativePackageJson.sha256,
    };
  }

  const manifestBytes = canonicalBytes(manifest);
  if (manifestBytes.length > policy.limits.maxManifestBytes) fail('ARTIFACT_MANIFEST_LIMIT');
  const manifestSha256 = sha256(manifestBytes);
  const descriptor = {
    schemaVersion: PROVIDER_TOOL_SCHEMA, distribution: policy.distribution,
    package: policy.package, version: policy.version,
    bundleRoot: policy.finalRoot, bundleRealpath: policy.finalRoot,
    entrypoint: policy.entrypoint, entrypointSha256: policy.entrypointSha256,
    packageJsonSha256: packageJson.sha256, lockfileSha256: policy.lockfileSha256,
    treeManifestSha256: manifestSha256,
    runtime: { path: policy.runtime.path, realpath: policy.runtime.path, version: policy.runtime.version, sha256: policy.runtime.sha256 },
    sessionMode: policy.sessionMode, invocationProfile: profile.invocationProfile,
    invocationProfileSha256: profile.sha256, nativeBinary,
  };
  validateProviderToolDescriptor(descriptor, provider);
  const descriptorBytes = canonicalBytes(descriptor);
  const descriptorSha256 = sha256(descriptorBytes);
  deepFreeze(manifest);
  deepFreeze(descriptor);
  return immutableResult({
    provider, finalRoot: policy.finalRoot, manifest, manifestSha256,
    descriptor, descriptorSha256, bundleTreeSha256: manifestSha256,
  }, manifestBytes, descriptorBytes);
}
