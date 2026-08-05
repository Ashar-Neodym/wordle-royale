import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACQUISITION_DECLARATION, parseBoundedStrictJson, resolveProviderLockClosure,
  satisfiesSemver, validateAcquisitionDeclaration, validateLockfileV3Object,
} from './g0-provider-bundle-assembler-core.mjs';

const DIRECT = { '@railway/cli': '5.30.1', supabase: '2.110.0', vercel: '58.4.4' };
const rec = (version, extra = {}) => ({ version, resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`, integrity: 'sha512-YQ==', ...extra });
function fixture(extra = {}) {
  const packages = {
    '': { name: 'wordle-g0-provider-tools', version: '1.0.0', dependencies: { ...DIRECT } },
    'node_modules/@railway/cli': rec('5.30.1'),
    'node_modules/supabase': rec('2.110.0'),
    'node_modules/vercel': rec('58.4.4'),
    ...extra,
  };
  const lock = { name: 'wordle-g0-provider-tools', version: '1.0.0', lockfileVersion: 3, requires: true, packages };
  const physicalLayout = Object.entries(packages).filter(([path, record]) => path && record.present !== false).map(([path, record]) => { const parts = path.split('/'); const at = parts.lastIndexOf('node_modules'); const inferred = parts[at + 1].startsWith('@') ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1]; return { path, name: record.name ?? inferred, version: record.version }; });
  for (const record of Object.values(packages)) delete record.present;
  return { lock, physicalLayout };
}
const code = (wanted, fn) => assert.throws(fn, (error) => error?.code === wanted, `expected ${wanted}`);

function resolve(f, provider = 'vercel') { return resolveProviderLockClosure({ provider, ...f }); }

test('closed declaration contains exact reviewed acquisition and unchanged runtime pins', () => {
  assert.equal(validateAcquisitionDeclaration(structuredClone(ACQUISITION_DECLARATION)).acquisitionNode.version, 'v26.3.0');
  assert.equal(ACQUISITION_DECLARATION.acquisitionNpm.version, '11.16.0');
  assert.equal(ACQUISITION_DECLARATION.productionRuntime.version, 'v18.19.1');
  const changed = structuredClone(ACQUISITION_DECLARATION); changed.target.cpu = 'arm64';
  code('DECLARATION_POLICY_MISMATCH', () => validateAcquisitionDeclaration(changed));
});

test('bounded strict JSON rejects duplicate keys, trailing data, depth, strings, count, bytes and bad UTF-8', () => {
  code('JSON_DUPLICATE_KEY', () => parseBoundedStrictJson(Buffer.from('{"a":1,"a":2}')));
  code('JSON_TRAILING_DATA', () => parseBoundedStrictJson(Buffer.from('{} x')));
  code('JSON_DEPTH', () => parseBoundedStrictJson(Buffer.from('[[[0]]]'), { maxDepth: 1 }));
  code('JSON_STRING', () => parseBoundedStrictJson(Buffer.from('"abcd"'), { maxStringBytes: 3 }));
  code('JSON_COUNT', () => parseBoundedStrictJson(Buffer.from('[1,2]'), { maxValues: 2 }));
  code('JSON_SIZE', () => parseBoundedStrictJson(Buffer.from('{}'), { maxBytes: 1 }));
  code('JSON_ENCODING', () => parseBoundedStrictJson(Uint8Array.from([0xff])));
  assert.deepEqual([...parseBoundedStrictJson(Buffer.from('{"a":[true,null]}')).a], [true, null]);
});

test('lockfile v3 schema rejects source/link/integrity/critical-field and malformed paths', () => {
  const mutations = [
    ['LOCK_POLICY_MISMATCH', (f) => { f.lock.lockfileVersion = 2; }],
    ['LOCK_LINK_FORBIDDEN', (f) => { f.lock.packages['node_modules/vercel'].link = true; }],
    ['LOCK_INTEGRITY_MISSING', (f) => { delete f.lock.packages['node_modules/vercel'].integrity; }],
    ['LOCK_SOURCE_FORBIDDEN', (f) => { f.lock.packages['node_modules/vercel'].resolved = 'file:../vercel'; }],
    ['LOCK_FIELD_UNSUPPORTED', (f) => { f.lock.packages['node_modules/vercel'].workspace = true; }],
    ['LOCK_PATH_INVALID', (f) => { f.lock.packages['node_modules/@bad'] = rec('1.0.0'); }],
    ['LOCK_PATH_COLLISION', (f) => { f.lock.packages['node_modules/VERCEL'] = rec('58.4.4'); }],
  ];
  for (const [wanted, mutate] of mutations) { const f = fixture(); mutate(f); code(wanted, () => validateLockfileV3Object(f.lock)); }
});

test('hoisted dependencies resolve upward and output is raw-byte deterministic', () => {
  const f = fixture({
    'node_modules/vercel': rec('58.4.4', { dependencies: { beta: '^1.0.0', alpha: '^1.0.0' } }),
    'node_modules/alpha': rec('1.1.0'), 'node_modules/beta': rec('1.2.0'),
  });
  const first = resolve(f);
  const shuffled = { lock: { ...f.lock, packages: Object.fromEntries(Object.entries(f.lock.packages).reverse()) }, physicalLayout: [...f.physicalLayout].reverse() };
  assert.deepEqual(resolve(shuffled), first);
  assert.deepEqual(first.paths, ['node_modules/alpha', 'node_modules/beta', 'node_modules/vercel']);
});

test('nested lookup keeps two exact physical versions distinct', () => {
  const f = fixture({
    'node_modules/vercel': rec('58.4.4', { dependencies: { one: '1.0.0', two: '1.0.0' } }),
    'node_modules/one': rec('1.0.0', { dependencies: { shared: '^1.0.0' } }),
    'node_modules/two': rec('1.0.0', { dependencies: { shared: '^2.0.0' } }),
    'node_modules/shared': rec('2.2.0'),
    'node_modules/one/node_modules/shared': rec('1.5.0'),
  });
  assert.deepEqual(resolve(f).paths, ['node_modules/one', 'node_modules/one/node_modules/shared', 'node_modules/shared', 'node_modules/two', 'node_modules/vercel']);
});

test('compatible optional is required; incompatible optional is excluded with reasons', () => {
  const f = fixture({
    'node_modules/vercel': rec('58.4.4', { optionalDependencies: { linuxish: '1.0.0', darwinish: '1.0.0' } }),
    'node_modules/linuxish': rec('1.0.0', { os: ['linux'] }),
    'node_modules/darwinish': rec('1.0.0', { optional: true, os: ['darwin'], present: false }),
  });
  const result = resolve(f);
  assert(result.paths.includes('node_modules/linuxish'));
  assert.deepEqual(result.excludedOptional, [{ from: 'node_modules/vercel', name: 'darwinish', path: 'node_modules/darwinish', reason: 'platform-incompatible', exclusionReasons: ['os:linux'] }]);
  const missing = fixture({ 'node_modules/vercel': rec('58.4.4', { optionalDependencies: { linuxish: '1.0.0' } }), 'node_modules/linuxish': rec('1.0.0', { os: ['linux'], present: false }) });
  code('COMPATIBLE_OPTIONAL_MISSING', () => resolve(missing));
});

test('required and present optional peers enter closure; absent optional peer is recorded', () => {
  const f = fixture({
    'node_modules/vercel': rec('58.4.4', { peerDependencies: { 'required-peer': '^2.0.0', 'optional-peer': '^1.0.0', 'absent-peer': '^3.0.0' }, peerDependenciesMeta: { 'optional-peer': { optional: true }, 'absent-peer': { optional: true } } }),
    'node_modules/required-peer': rec('2.4.0'), 'node_modules/optional-peer': rec('1.1.0'),
  });
  const result = resolve(f);
  assert(result.paths.includes('node_modules/required-peer')); assert(result.paths.includes('node_modules/optional-peer'));
  assert.equal(result.excludedOptional[0].reason, 'absent-optional-peer');
  const missing = fixture({ 'node_modules/vercel': rec('58.4.4', { peerDependencies: { 'required-peer': '^2.0.0' } }) });
  code('DEPENDENCY_UNRESOLVED', () => resolve(missing));
});

test('missing, extraneous, package-json drift, bad range and required platform fail closed', () => {
  const missing = fixture({ 'node_modules/vercel': rec('58.4.4', { dependencies: { needed: '1.0.0' } }), 'node_modules/needed': rec('1.0.0', { present: false }) });
  code('LAYOUT_MISSING', () => resolve(missing));
  const extra = fixture({ 'node_modules/unreachable': rec('1.0.0') }); code('LAYOUT_EXTRANEOUS', () => resolve(extra));
  const drift = fixture(); drift.physicalLayout.find((x) => x.path === 'node_modules/vercel').version = '58.4.3'; code('LAYOUT_PACKAGE_JSON_MISMATCH', () => resolve(drift));
  const range = fixture({ 'node_modules/vercel': rec('58.4.4', { dependencies: { child: '^2.0.0' } }), 'node_modules/child': rec('1.0.0') }); code('DEPENDENCY_RANGE_MISMATCH', () => resolve(range));
  const platform = fixture({ 'node_modules/vercel': rec('58.4.4', { dependencies: { darwin: '1.0.0' } }), 'node_modules/darwin': rec('1.0.0', { os: ['darwin'], present: false }) }); code('REQUIRED_PLATFORM_INCOMPATIBLE', () => resolve(platform));
});

test('layout rejects case collisions and malformed scoped package-json names', () => {
  const collision = fixture(); collision.physicalLayout.push({ path: 'node_modules/VERCEL', name: 'vercel', version: '58.4.4' }); code('LAYOUT_PATH_COLLISION', () => resolve(collision));
  const scoped = fixture(); scoped.physicalLayout.find((x) => x.path === 'node_modules/@railway/cli').name = '@railway'; code('PACKAGE_NAME_INVALID', () => resolve(scoped, 'railway'));
});

test('semver covers actual npm-lock forms and rejects unsupported expressions', () => {
  for (const [v, r] of [['1.8.0','^1.7.1 || ^2.0.0-alpha.3'],['2.5.0','>= 2.1.2 < 3'],['5.26.9','~5.26.4'],['8.3.0','^8'],['6.3.0','npm:path-to-regexp@6.3.0'],['1.2.9','1.2.x']]) assert.equal(satisfiesSemver(v,r), true, `${v} ${r}`);
  assert.equal(satisfiesSemver('3.0.0','<3'), false);
  assert.equal(satisfiesSemver('2.0.0-alpha.2','^2.0.0'), false);
  code('SEMVER_RANGE_UNSUPPORTED', () => satisfiesSemver('1.0.0','latest'));
  code('SEMVER_RANGE_UNSUPPORTED', () => satisfiesSemver('1.0.0','1.0.0 || latest'));
});

test('core has no filesystem/network/subprocess/process-env/provider CLI imports', async () => {
  const source = await readFile(new URL('./g0-provider-bundle-assembler-core.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|net|http|https|dns|tls|child_process)|process\.(?:env|getenv)|g0-(?:vercel|railway|supabase)-readonly-adapter/u);
  assert.match(source, /node:crypto/u);
});
