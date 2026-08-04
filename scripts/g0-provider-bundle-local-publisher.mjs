import { constants, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, open, readdir, realpath, rename, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { assembleProviderBundleStagingProduction } from './g0-provider-bundle-staging-assembler-core.mjs';
import { validateStagedProviderBundle } from './g0-provider-bundle-staging-validator.mjs';
import { scanCanonicalProviderBundleSourceSnapshot } from './g0-provider-bundle-source-snapshot.mjs';
import { validateProviderBundlePublication } from './g0-provider-bundle-publication-validator.mjs';
import {
  compileAcquisitionRecord, compileInertInstallPlan, compilePublicationCommit,
  compilePublicationIndex, derivePublicationId,
} from './g0-provider-bundle-publication-schema.mjs';
import { canonicalProviderToolJson } from './g0-provider-tool-bundle.mjs';

const HELPER_PATH = new URL('./g0-bundle-publication-helper.py', import.meta.url).pathname;
export const PUBLICATION_HELPER_SHA256 = 'sha256:9042dbf6697ea17bf8d60ec0574424e6b05cd13614ad5131f738973834e06894';
const PYTHON_PATH = '/usr/bin/python3';
const PYTHON_REALPATH = '/usr/bin/python3.12';
const PYTHON_SHA256 = 'sha256:1643dacd9feaedc58f3cc581e4d22577dfe25c09b10282936186ccf0f2e61118';
const PYTHON_VERSION = 'Python 3.12.3';
const HELPER_SCHEMA = 'wordle-royale-g0-bundle-publication-helper/v1';
const PROVIDERS = new Set(['vercel', 'railway', 'supabase']);
const ENVIRONMENT = Object.freeze({ LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', PATH: '/usr/bin:/bin', TZ: 'UTC' });
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_CREATE_FLAGS = constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_RDWR;
const MAX_OUTPUT = 64 * 1024;
const fail = (code, detail) => { const error = new Error(code); error.code = code; if (detail !== undefined) error.detail = detail; throw error; };
const anchor = (handle) => `/proc/self/fd/${handle.fd}`;
const childAt = (handle, name) => `${anchor(handle)}/${name}`;
const modeOf = (st) => Number(st.mode) & 0o7777;
const nodeIdentity = (st) => `${st.dev}:${st.ino}`;
const fullIdentity = (st) => [st.dev, st.ino, st.mode, st.nlink, st.uid, st.gid, st.size, st.ctimeNs, st.mtimeNs].map(String).join(':');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const canonical = (value) => Buffer.from(`${canonicalProviderToolJson(value)}\n`, 'utf8');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function normalizedAbsolute(value) {
  return typeof value === 'string' && isAbsolute(value) && value !== '/' && resolve(value) === value && !value.includes('\0');
}
async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((yes, no) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 })
    .on('data', (chunk) => hash.update(chunk)).on('error', no).on('end', yes));
  return `sha256:${hash.digest('hex')}`;
}
async function readHandle(handle, size) {
  const bytes = Buffer.alloc(size); let offset = 0;
  while (offset < size) { const { bytesRead } = await handle.read(bytes, offset, size - offset, offset); if (!bytesRead) fail('PUBLICATION_FILE_CHANGED'); offset += bytesRead; }
  return bytes;
}
async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) { const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset); if (!bytesWritten) fail('PUBLICATION_WRITE_FAILED'); offset += bytesWritten; }
}
async function invokeHook(hooks, point, context = {}) {
  if (hooks === undefined) return;
  const hook = typeof hooks === 'function' ? hooks : hooks?.[point];
  if (hook === undefined) return;
  if (typeof hook !== 'function') fail('PUBLISHER_TEST_HOOK_INVALID');
  await hook(deepFreeze({ point, ...context }));
}
async function verifyParent(path, uid) {
  const parentDirectoryPath = dirname(path); const parentName = basename(path);
  let parentDirectory;
  try { parentDirectory = await open(parentDirectoryPath, DIR_FLAGS); } catch { fail('PUBLICATION_PARENT_UNSAFE'); }
  let parent;
  try {
    const parentDirectoryStat = await parentDirectory.stat({ bigint: true });
    const named = await lstat(childAt(parentDirectory, parentName), { bigint: true }).catch(() => fail('PUBLICATION_PARENT_UNSAFE'));
    if (!named.isDirectory() || named.isSymbolicLink() || named.uid !== uid || named.nlink < 1n || modeOf(named) !== 0o700
        || await realpath(path).catch(() => '') !== path) fail('PUBLICATION_PARENT_UNSAFE');
    parent = await open(childAt(parentDirectory, parentName), DIR_FLAGS).catch(() => fail('PUBLICATION_PARENT_UNSAFE'));
    const held = await parent.stat({ bigint: true });
    if (fullIdentity(named) !== fullIdentity(held)) fail('PUBLICATION_PARENT_UNSAFE');
    return { path, name: parentName, directory: parentDirectory, directoryIdentity: fullIdentity(parentDirectoryStat), handle: parent, stat: held, identity: nodeIdentity(held), uid };
  } catch (error) { await Promise.allSettled([parent?.close(), parentDirectory.close()]); throw error; }
}
async function assertParentHeld(parent) {
  const held = await parent.handle.stat({ bigint: true }).catch(() => fail('PUBLICATION_PARENT_CHANGED'));
  const directory = await parent.directory.stat({ bigint: true }).catch(() => fail('PUBLICATION_PARENT_CHANGED'));
  const named = await lstat(childAt(parent.directory, parent.name), { bigint: true }).catch(() => fail('PUBLICATION_PARENT_CHANGED'));
  if (nodeIdentity(held) !== parent.identity || nodeIdentity(named) !== parent.identity
      || !held.isDirectory() || !named.isDirectory() || held.uid !== parent.uid || named.uid !== parent.uid
      || modeOf(held) !== 0o700 || modeOf(named) !== 0o700
      || fullIdentity(directory) !== parent.directoryIdentity || await realpath(parent.path).catch(() => '') !== parent.path) fail('PUBLICATION_PARENT_CHANGED');
}
async function openHeldDirectory(parent, name, mode, uid, dev) {
  const named = await lstat(childAt(parent, name), { bigint: true }).catch(() => fail('PUBLICATION_DIRECTORY_CHANGED'));
  if (!named.isDirectory() || named.isSymbolicLink() || named.uid !== uid || named.dev !== dev || modeOf(named) !== mode) fail('PUBLICATION_DIRECTORY_POLICY');
  const handle = await open(childAt(parent, name), DIR_FLAGS).catch(() => fail('PUBLICATION_DIRECTORY_CHANGED'));
  const held = await handle.stat({ bigint: true });
  if (fullIdentity(named) !== fullIdentity(held)) { await handle.close(); fail('PUBLICATION_DIRECTORY_CHANGED'); }
  return { handle, stat: held, identity: nodeIdentity(held), uid, dev, mode };
}
async function assertHeldNamed(parent, name, item, code) {
  const held = await item.handle.stat({ bigint: true }).catch(() => fail(code));
  const named = await lstat(childAt(parent, name), { bigint: true }).catch(() => fail(code));
  if (nodeIdentity(held) !== item.identity || nodeIdentity(named) !== item.identity
      || !held.isDirectory() || !named.isDirectory() || held.uid !== item.uid || named.uid !== item.uid
      || held.dev !== item.dev || named.dev !== item.dev || modeOf(held) !== item.mode || modeOf(named) !== item.mode) fail(code);
}
async function createSidecar(container, name, bytes, uid, dev) {
  let handle;
  try {
    handle = await open(childAt(container.handle, name), FILE_CREATE_FLAGS, 0o600);
    await writeAll(handle, bytes); await handle.datasync(); await handle.chmod(0o400); await handle.sync();
    const st = await handle.stat({ bigint: true });
    if (!st.isFile() || st.uid !== uid || st.dev !== dev || st.nlink !== 1n || modeOf(st) !== 0o400 || st.size !== BigInt(bytes.length)) fail('PUBLICATION_SIDECAR_POLICY');
    const reread = await readHandle(handle, bytes.length);
    if (!reread.equals(bytes) || sha256(reread) !== sha256(bytes)) fail('PUBLICATION_SIDECAR_CHANGED');
    const named = await lstat(childAt(container.handle, name), { bigint: true });
    if (fullIdentity(named) !== fullIdentity(st)) fail('PUBLICATION_SIDECAR_CHANGED');
    return Object.freeze({ name, sha256: sha256(bytes), identity: fullIdentity(st) });
  } finally { await handle?.close(); }
}
async function syncTree(opened, uid, dev) {
  const names = (await readdir(anchor(opened), { encoding: 'buffer' })).sort(Buffer.compare);
  for (const raw of names) {
    const name = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if (!Buffer.from(name).equals(raw) || !name || name === '.' || name === '..' || name.includes('/')) fail('PUBLICATION_PATH_INVALID');
    const st = await lstat(childAt(opened, name), { bigint: true });
    if (st.isSymbolicLink() || st.uid !== uid || st.dev !== dev) fail('PUBLICATION_BUNDLE_POLICY');
    if (st.isDirectory()) {
      const child = await open(childAt(opened, name), DIR_FLAGS); try { await syncTree(child, uid, dev); } finally { await child.close(); }
    } else if (st.isFile() && st.nlink === 1n) {
      const file = await open(childAt(opened, name), constants.O_RDONLY | constants.O_NOFOLLOW); try { await file.datasync(); } finally { await file.close(); }
    } else fail('PUBLICATION_BUNDLE_POLICY');
  }
  await opened.sync();
}
async function verifyProgram() {
  const actual = await realpath(PYTHON_PATH).catch(() => fail('PUBLISHER_TOOLCHAIN_UNAVAILABLE'));
  if (actual !== PYTHON_REALPATH) fail('PUBLISHER_TOOLCHAIN_POLICY');
  const st = await stat(actual, { bigint: true });
  const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!st.isFile() || st.uid !== 0n || st.nlink !== 1n || modeOf(st) !== 0o755 || await hashHandle(handle) !== PYTHON_SHA256) fail('PUBLISHER_TOOLCHAIN_POLICY'); }
  finally { await handle.close(); }
}
async function openVerifiedHelper(uid) {
  const named = await lstat(HELPER_PATH, { bigint: true }).catch(() => fail('PUBLISHER_HELPER_UNAVAILABLE'));
  const handle = await open(HELPER_PATH, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => fail('PUBLISHER_HELPER_POLICY'));
  const held = await handle.stat({ bigint: true });
  if (!held.isFile() || fullIdentity(named) !== fullIdentity(held) || held.uid !== uid || held.nlink !== 1n || modeOf(held) !== 0o644
      || await hashHandle(handle) !== PUBLICATION_HELPER_SHA256) { await handle.close(); fail('PUBLISHER_HELPER_POLICY'); }
  return { path: HELPER_PATH, handle, stat: held, identity: fullIdentity(held) };
}
async function recheckHelper(helper) {
  let namedHandle;
  try {
    const held = await helper.handle.stat({ bigint: true }); const named = await lstat(helper.path, { bigint: true });
    namedHandle = await open(helper.path, constants.O_RDONLY | constants.O_NOFOLLOW); const reopened = await namedHandle.stat({ bigint: true });
    if (fullIdentity(held) !== helper.identity || fullIdentity(named) !== helper.identity || fullIdentity(reopened) !== helper.identity
        || await hashHandle(helper.handle) !== PUBLICATION_HELPER_SHA256 || await hashHandle(namedHandle) !== PUBLICATION_HELPER_SHA256) fail('PUBLISHER_HELPER_CHANGED');
  } catch (error) { if (error?.code === 'PUBLISHER_HELPER_CHANGED') throw error; fail('PUBLISHER_HELPER_CHANGED'); }
  finally { await namedHandle?.close(); }
}
function runChild(frameBytes, helperFd, parentFd) {
  return new Promise((done) => {
    const child = spawn(PYTHON_PATH, ['-I', '-S', '-B', '/proc/self/fd/3'], { env: ENVIRONMENT, shell: false, stdio: ['pipe', 'pipe', 'pipe', helperFd, parentFd] });
    const out = []; const err = []; let count = 0; let killed = false; const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, 30_000);
    child.stdout.on('data', (chunk) => { count += chunk.length; if (count > MAX_OUTPUT) { killed = true; child.kill('SIGKILL'); } else out.push(chunk); });
    child.stderr.on('data', (chunk) => { count += chunk.length; if (count > MAX_OUTPUT) { killed = true; child.kill('SIGKILL'); } else err.push(chunk); });
    child.on('error', () => { clearTimeout(timer); done({ error: true }); });
    child.on('close', (status, signal) => { clearTimeout(timer); done({ status, signal, killed, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }); });
    child.stdin.on('error', () => child.kill('SIGKILL')); child.stdin.end(frameBytes);
  });
}
function parseHelperResult(result, action) {
  if (result.error || result.killed || result.signal !== null || result.stderr?.length || !result.stdout?.length || result.stdout.length > MAX_OUTPUT) fail('PUBLISHER_HELPER_FAILED');
  let value; try { value = JSON.parse(result.stdout.toString('utf8')); } catch { fail('PUBLISHER_HELPER_PROTOCOL'); }
  if (!canonical(value).equals(result.stdout) || !exactKeys(value, ['status']) || typeof value.status !== 'string') fail('PUBLISHER_HELPER_PROTOCOL');
  const accepted = action === 'publish' ? new Set(['PUBLISHED', 'COLLISION']) : new Set(['CLEANED', 'CLEANUP_IDENTITY_LOST']);
  if (!accepted.has(value.status)) fail('PUBLISHER_HELPER_PROTOCOL');
  const wantedExit = ['PUBLISHED', 'CLEANED'].includes(value.status) ? 0 : value.status === 'CLEANUP_IDENTITY_LOST' ? 3 : 2;
  if (result.status !== wantedExit) fail('PUBLISHER_HELPER_PROTOCOL');
  return value.status;
}
async function productionHelperRunner({ frame, helper, parent }) {
  await verifyProgram(); await recheckHelper(helper);
  const result = await runChild(canonical(frame), helper.handle.fd, parent.handle.fd);
  await recheckHelper(helper); return parseHelperResult(result, frame.action);
}
const PRODUCTION_DEPS = Object.freeze({
  assembler: assembleProviderBundleStagingProduction,
  stagingValidator: validateStagedProviderBundle,
  sourceScanner: scanCanonicalProviderBundleSourceSnapshot,
  publicationValidator: validateProviderBundlePublication,
  helperRunner: productionHelperRunner,
  openHelper: openVerifiedHelper,
});
function frameBase(parent, scratch) {
  return { expectedParentDev: String(parent.stat.dev), expectedParentIno: String(parent.stat.ino), expectedScratchDev: String(scratch.stat.dev), expectedScratchIno: String(scratch.stat.ino), limits: { maxDepth: 128, maxFrameBytes: 64 * 1024, maxNodes: 20_000 }, schemaVersion: HELPER_SCHEMA, scratchName: scratch.name };
}
function reportEqual(a, b) { return canonical(a).equals(canonical(b)); }
function publicResult(status, publicationName, report) {
  return deepFreeze({ status, provider: report.provider, artifactId: report.artifactId, publicationName, report });
}

export function createLocalPublisherForTests(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail('PUBLISHER_TEST_DEPS_INVALID');
  const { hooks, ...deps } = overrides;
  return (input) => publish(input, Object.freeze({ ...PRODUCTION_DEPS, ...deps }), hooks, true);
}
export const createProviderBundleLocalPublisherForTests = createLocalPublisherForTests;
export async function publishProviderBundleLocally(input) {
  return publish(input, PRODUCTION_DEPS, undefined, false);
}

async function publish(input, deps, hooks, testing) {
  if (arguments.length < 2 || !exactKeys(input, ['provider', 'sourceRoot', 'publicationParent', 'sourceRevision'])) fail('PUBLISHER_INPUT_INVALID');
  const { provider, sourceRoot, publicationParent, sourceRevision } = input;
  if (!PROVIDERS.has(provider) || !normalizedAbsolute(sourceRoot) || !normalizedAbsolute(publicationParent) || !/^[a-f0-9]{40}$/u.test(sourceRevision)) fail('PUBLISHER_INPUT_INVALID');
  const uidNumber = process.getuid?.(); if (!Number.isInteger(uidNumber)) fail('PUBLISHER_UID_UNAVAILABLE'); const uid = BigInt(uidNumber);
  const parent = await verifyParent(publicationParent, uid);
  let scratch; let container; let helper; let published = false; let primaryError;
  try {
    helper = deps.openHelper === openVerifiedHelper ? await deps.openHelper(uid) : await deps.openHelper?.(uid);
    const scratchName = `.an4-tmp-${randomBytes(16).toString('hex')}`;
    await mkdir(childAt(parent.handle, scratchName), { mode: 0o700 });
    scratch = { name: scratchName, ...(await openHeldDirectory(parent.handle, scratchName, 0o700, uid, parent.stat.dev)) };
    await assertParentHeld(parent); await invokeHook(hooks, 'afterScratch', { scratchName }); await assertParentHeld(parent);
    const workName = '.bundle-work'; const workPath = `${publicationParent}/${scratchName}/${workName}`;
    const assemblyResult = await deps.assembler({ provider, sourceRoot, destinationRoot: workPath });
    const staging = await deps.stagingValidator({ provider, stagingRoot: workPath, assemblyResult });
    const snapshot = await deps.sourceScanner({ sourceRoot });
    const canonicalSourceSnapshotSha256 = snapshot.canonicalSourceSnapshotSha256;
    if (!/^sha256:[a-f0-9]{64}$/u.test(canonicalSourceSnapshotSha256)) fail('PUBLISHER_SOURCE_SNAPSHOT_INVALID');
    const acquisition = compileAcquisitionRecord({ canonicalSourceSnapshotSha256 });
    const plan = compileInertInstallPlan({ provider });
    const artifacts = staging.artifacts;
    if (!artifacts?.manifest || !artifacts?.descriptor || !Buffer.isBuffer(artifacts.manifestBytes) || !Buffer.isBuffer(artifacts.descriptorBytes)) fail('PUBLISHER_STAGING_RESULT_INVALID');
    const index = compilePublicationIndex({ provider, manifest: artifacts.manifest, descriptor: artifacts.descriptor, acquisitionRecord: acquisition, installPlan: plan, canonicalSourceSnapshotSha256, sourceRevision });
    const publicationName = derivePublicationId(index); const commit = compilePublicationCommit({ publicationIndex: index });
    const allBytes = [artifacts.manifestBytes, artifacts.descriptorBytes, acquisition.bytes, plan.bytes, index.bytes, commit.bytes];
    if (allBytes.some((bytes) => bytes.includes(Buffer.from(sourceRoot)))) fail('PUBLISHER_CANONICAL_PATH_LEAK');
    await mkdir(childAt(scratch.handle, publicationName), { mode: 0o700 });
    container = { name: publicationName, ...(await openHeldDirectory(scratch.handle, publicationName, 0o700, uid, parent.stat.dev)) };
    await invokeHook(hooks, 'afterContainer', { publicationName });
    await assertParentHeld(parent); await assertHeldNamed(parent.handle, scratchName, scratch, 'PUBLICATION_SCRATCH_CHANGED');
    const work = await openHeldDirectory(scratch.handle, workName, 0o555, uid, parent.stat.dev);
    try {
      await work.handle.chmod(0o700); work.mode = 0o700;
      await assertHeldNamed(scratch.handle, workName, work, 'PUBLICATION_BUNDLE_CHANGED');
      await rename(childAt(scratch.handle, workName), childAt(container.handle, 'bundle'));
      await work.handle.chmod(0o555); work.mode = 0o555; await work.handle.sync();
      await assertHeldNamed(container.handle, 'bundle', work, 'PUBLICATION_BUNDLE_CHANGED');
      await syncTree(work.handle, uid, parent.stat.dev);
    } finally { await work.handle.close(); }
    await container.handle.sync(); await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    await invokeHook(hooks, 'afterBundle', { publicationName });
    await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    const sidecars = [
      ['bundle.tree-manifest.json', artifacts.manifestBytes], ['descriptor.json', artifacts.descriptorBytes],
      ['acquisition-record.json', acquisition.bytes], ['install-plan.json', plan.bytes],
    ];
    for (const [name, bytes] of sidecars) {
      await createSidecar(container, name, bytes, uid, parent.stat.dev); await container.handle.sync();
      await invokeHook(hooks, 'afterSidecar', { name, publicationName });
      await invokeHook(hooks, `after${name === 'bundle.tree-manifest.json' ? 'Manifest' : name === 'descriptor.json' ? 'Descriptor' : name === 'acquisition-record.json' ? 'Acquisition' : 'Plan'}Sidecar`, { name, publicationName });
      await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    }
    await createSidecar(container, 'publication-index.json', index.bytes, uid, parent.stat.dev); await container.handle.sync();
    await invokeHook(hooks, 'afterIndex', { publicationName });
    await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    await createSidecar(container, 'COMMIT', commit.bytes, uid, parent.stat.dev); await container.handle.sync(); await scratch.handle.sync();
    await invokeHook(hooks, 'afterCommit', { publicationName });
    await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    await invokeHook(hooks, 'prevalidate', { publicationName });
    await assertParentHeld(parent); await assertHeldNamed(parent.handle, scratchName, scratch, 'PUBLICATION_SCRATCH_CHANGED');
    await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    const candidateReport = await deps.publicationValidator({ publicationParent: `${publicationParent}/${scratchName}`, publicationName });
    await invokeHook(hooks, 'prepublish', { publicationName, candidateReport });
    await assertParentHeld(parent); await assertHeldNamed(parent.handle, scratchName, scratch, 'PUBLICATION_SCRATCH_CHANGED');
    await assertHeldNamed(scratch.handle, publicationName, container, 'PUBLICATION_CONTAINER_CHANGED');
    const publishFrame = { action: 'publish', ...frameBase(parent, scratch), expectedContainerDev: String(container.stat.dev), expectedContainerIno: String(container.stat.ino), publicationName };
    const helperStatus = await deps.helperRunner({ frame: publishFrame, helper, parent, scratch, container, hooks });
    if (helperStatus === 'PUBLISHED') {
      published = true; await invokeHook(hooks, 'postrename', { publicationName });
      const finalReport = await deps.publicationValidator({ publicationParent, publicationName });
      if (!reportEqual(candidateReport, finalReport)) fail('PUBLICATION_FINAL_REPORT_MISMATCH');
      await invokeHook(hooks, 'postvalidate', { publicationName, finalReport });
      return publicResult('PUBLISHED', publicationName, finalReport);
    }
    if (helperStatus !== 'COLLISION') fail('PUBLISHER_HELPER_PROTOCOL');
    let finalReport;
    try { finalReport = await deps.publicationValidator({ publicationParent, publicationName }); }
    catch { fail('PUBLICATION_COLLISION_INVALID'); }
    if (!reportEqual(candidateReport, finalReport)) fail('PUBLICATION_COLLISION_DIFFERENT');
    return publicResult('ALREADY_PUBLISHED_IDENTICAL', publicationName, finalReport);
  } catch (error) { primaryError = error; throw error; }
  finally {
    if (scratch && !published) {
      let cleanupStatus;
      // Once a held namespace identity has been lost there is no authority to
      // reinterpret the replacement as publisher-owned cleanup material.
      const identityLost = new Set(['PUBLICATION_CONTAINER_CHANGED', 'PUBLICATION_SCRATCH_CHANGED', 'PUBLICATION_PARENT_CHANGED', 'PUBLICATION_DIRECTORY_CHANGED']);
      if (identityLost.has(primaryError?.code)) cleanupStatus = 'CLEANUP_IDENTITY_LOST';
      else {
        try {
          const cleanupFrame = { action: 'cleanup', ...frameBase(parent, scratch) };
          cleanupStatus = await deps.helperRunner({ frame: cleanupFrame, helper, parent, scratch, container, hooks });
        } catch { cleanupStatus = 'CLEANUP_IDENTITY_LOST'; }
      }
      if (cleanupStatus !== 'CLEANED' && !primaryError) fail('CLEANUP_IDENTITY_LOST');
      if (cleanupStatus !== 'CLEANED' && primaryError) primaryError.cleanupStatus = 'CLEANUP_IDENTITY_LOST';
    }
    await Promise.allSettled([container?.handle.close(), scratch?.handle.close(), helper?.handle?.close?.(), parent.handle.close(), parent.directory.close()]);
  }
}

export const publishLocalProviderBundle = publishProviderBundleLocally;
