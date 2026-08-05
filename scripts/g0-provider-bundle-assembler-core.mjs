import { createHash } from 'node:crypto';

// AN-1 is deliberately pure: callers provide bytes and an abstract physical
// package layout. Filesystem acquisition and materialisation belong to later cards.
export const ACQUISITION_DECLARATION_SCHEMA = 'wordle-royale-g0-acquisition/v1';
export const LOCK_MAX_BYTES = 256 * 1024;
export const JSON_LIMITS = Object.freeze({ depth: 32, strings: 64 * 1024, values: 60_000 });
export const PROVIDER_LIMITS = Object.freeze({
  vercel: Object.freeze({ package: 'vercel', version: '58.4.4', maxPackages: 400, maxNodes: 8_500, maxPayloadBytes: 192 * 1024 * 1024, maxManifestBytes: 1_310_720 }),
  railway: Object.freeze({ package: '@railway/cli', version: '5.30.1', maxPackages: 24, maxNodes: 320, maxPayloadBytes: 32 * 1024 * 1024, maxManifestBytes: 49_152 }),
  supabase: Object.freeze({ package: 'supabase', version: '2.110.0', maxPackages: 24, maxNodes: 900, maxPayloadBytes: 224 * 1024 * 1024, maxManifestBytes: 147_456 }),
});
export const ACQUISITION_DECLARATION = deepFreeze({
  schemaVersion: ACQUISITION_DECLARATION_SCHEMA,
  rootPackageJsonSha256: 'sha256:58fffb1ef8b6b6ff51cba0d9f752ea29dac6830cfaed4c763c7a3bd0f2d9dcde',
  lockfileSha256: 'sha256:bc4cfd9d815ad6615ffce0a0fc877f25f199bf48ce4d11fa2cbec3bc85d93b90',
  dependencies: { '@railway/cli': '5.30.1', supabase: '2.110.0', vercel: '58.4.4' },
  target: { os: 'linux', cpu: 'x64', libc: 'glibc' },
  acquisitionNode: { path: '/home/ashar/.nvm/versions/node/v26.3.0/bin/node', version: 'v26.3.0', sha256: 'sha256:5325ac9da58541494afcc136f0880279a2a853609bf4dae7755e04fb682b6926' },
  acquisitionNpm: { path: '/home/ashar/.nvm/versions/node/v26.3.0/lib/node_modules/npm/bin/npm-cli.js', version: '11.16.0', sha256: 'sha256:8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7' },
  productionRuntime: { path: '/usr/bin/node', version: 'v18.19.1', sha256: 'sha256:f3f93db342d5ac5bb61656d0599a603a73779e98befd9342171e550002725f4d' },
  providerLimits: PROVIDER_LIMITS,
});

export class AcquisitionError extends Error { constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; this.detail = detail; } }
const fail = (code, detail) => { throw new AcquisitionError(code, detail); };
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const rawCompare = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sorted = (xs) => [...xs].sort(rawCompare);
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function exact(value, fields, code = 'DECLARATION_INVALID') { if (!plain(value) || sorted(Object.keys(value)).join('\0') !== sorted(fields).join('\0')) fail(code); }
function same(a, b) { if (a === b) return true; if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i])); if (plain(a) && plain(b)) { const ak = sorted(Object.keys(a)), bk = sorted(Object.keys(b)); return ak.length === bk.length && ak.every((k, i) => k === bk[i] && same(a[k], b[k])); } return false; }

export function validateAcquisitionDeclaration(value) { if (!same(value, ACQUISITION_DECLARATION)) fail('DECLARATION_POLICY_MISMATCH'); return value; }

// Recursive descent is used instead of JSON.parse plus a post-walk so all
// duplicate/depth/string/value bounds are enforced while input is consumed.
export function parseBoundedStrictJson(bytes, { maxBytes = LOCK_MAX_BYTES, maxDepth = JSON_LIMITS.depth, maxStringBytes = JSON_LIMITS.strings, maxValues = JSON_LIMITS.values } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > maxBytes) fail('JSON_SIZE');
  let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('JSON_ENCODING'); }
  let i = 0, count = 0;
  const ws = () => { while (i < s.length && /[\x20\x09\x0a\x0d]/u.test(s[i])) i += 1; };
  const value = (depth) => {
    if (++count > maxValues) fail('JSON_COUNT'); if (depth > maxDepth) fail('JSON_DEPTH'); ws();
    const c = s[i];
    if (c === '"') return string();
    if (c === '{') return object(depth + 1);
    if (c === '[') return array(depth + 1);
    for (const [word, result] of [['true', true], ['false', false], ['null', null]]) if (s.startsWith(word, i)) { i += word.length; return result; }
    const match = s.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) fail('JSON_SYNTAX'); i += match[0].length; const n = Number(match[0]); if (!Number.isFinite(n)) fail('JSON_NUMBER'); return n;
  };
  const string = () => {
    const start = i; i += 1; let escaped = false;
    while (i < s.length) { const code = s.charCodeAt(i); if (!escaped && code === 0x22) { i += 1; let out; try { out = JSON.parse(s.slice(start, i)); } catch { fail('JSON_SYNTAX'); } if (Buffer.byteLength(out, 'utf8') > maxStringBytes) fail('JSON_STRING'); return out; } if (!escaped && code < 0x20) fail('JSON_SYNTAX'); if (!escaped && code === 0x5c) escaped = true; else escaped = false; i += 1; }
    fail('JSON_SYNTAX');
  };
  const object = (depth) => { i += 1; const out = Object.create(null), keys = new Set(); ws(); if (s[i] === '}') { i += 1; return out; } while (true) { ws(); if (s[i] !== '"') fail('JSON_SYNTAX'); const key = string(); if (keys.has(key)) fail('JSON_DUPLICATE_KEY', key); keys.add(key); ws(); if (s[i++] !== ':') fail('JSON_SYNTAX'); out[key] = value(depth); ws(); if (s[i] === '}') { i += 1; return out; } if (s[i++] !== ',') fail('JSON_SYNTAX'); } };
  const array = (depth) => { i += 1; const out = []; ws(); if (s[i] === ']') { i += 1; return out; } while (true) { out.push(value(depth)); ws(); if (s[i] === ']') { i += 1; return out; } if (s[i++] !== ',') fail('JSON_SYNTAX'); } };
  const result = value(0); ws(); if (i !== s.length) fail('JSON_TRAILING_DATA'); return result;
}

const PACKAGE_RECORD_FIELDS = new Set(['name','version','resolved','integrity','dev','optional','devOptional','peer','hasInstallScript','license','deprecated','engines','bin','dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta','os','cpu','libc','funding','bundled','inBundle']);
const ROOT_RECORD_FIELDS = new Set(['name','version','license','dependencies','optionalDependencies','devDependencies','engines']);
function packageName(name) { if (typeof name !== 'string' || Buffer.byteLength(name) > 255 || name.includes('\\') || name.includes('\0') || name === '.' || name === '..') fail('PACKAGE_NAME_INVALID', name); if (name.startsWith('@')) { const p = name.split('/'); if (p.length !== 2 || !/^@[a-z0-9][a-z0-9._-]*$/u.test(p[0]) || !/^[a-z0-9][a-z0-9._-]*$/u.test(p[1])) fail('PACKAGE_NAME_INVALID', name); } else if (!/^[a-z0-9][a-z0-9._-]*$/u.test(name)) fail('PACKAGE_NAME_INVALID', name); return name; }
function parseLockPath(path) {
  if (path === '') return { name: null };
  if (typeof path !== 'string' || path.startsWith('/') || path.includes('\\') || path.includes('\0') || Buffer.byteLength(path) > 1024 || path.split('/').some((x) => !x || x === '.' || x === '..' || Buffer.byteLength(x) > 255)) fail('LOCK_PATH_INVALID', path);
  const parts = path.split('/'); let i = 0, last;
  while (i < parts.length) { if (parts[i++] !== 'node_modules') fail('LOCK_PATH_INVALID', path); if (parts[i]?.startsWith('@')) { if (i + 1 >= parts.length) fail('LOCK_PATH_INVALID', path); last = `${parts[i++]}/${parts[i++]}`; } else { if (i >= parts.length) fail('LOCK_PATH_INVALID', path); last = parts[i++]; } packageName(last); }
  return { name: last };
}
function stringMap(value, code) { if (!plain(value)) fail(code); for (const [k, v] of Object.entries(value)) { packageName(k); if (typeof v !== 'string' || v.length === 0 || Buffer.byteLength(v) > 1024) fail(code); } }
function platformList(v, code) { if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string' || !/^(?:!|)[a-z0-9][a-z0-9._-]*$/u.test(x))) fail(code); }
function validateRecord(path, record) {
  if (!plain(record)) fail('LOCK_RECORD_INVALID', path); const root = path === ''; const allowed = root ? ROOT_RECORD_FIELDS : PACKAGE_RECORD_FIELDS;
  for (const key of Object.keys(record)) if (!allowed.has(key)) fail(key === 'link' ? 'LOCK_LINK_FORBIDDEN' : 'LOCK_FIELD_UNSUPPORTED', `${path}:${key}`);
  if (root) { if (typeof record.name !== 'string' || typeof record.version !== 'string') fail('LOCK_ROOT_INVALID'); }
  else {
    if (typeof record.version !== 'string' || !parseVersion(record.version)) fail('LOCK_VERSION_INVALID', path);
    if (record.name !== undefined) packageName(record.name);
    if (typeof record.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(record.integrity)) fail('LOCK_INTEGRITY_MISSING', path);
    if (typeof record.resolved !== 'string' || !/^https:\/\//u.test(record.resolved) || /^(?:file|git|github|workspace|link):/u.test(record.resolved)) fail('LOCK_SOURCE_FORBIDDEN', path);
  }
  for (const key of ['dependencies','optionalDependencies','peerDependencies']) if (own(record, key)) stringMap(record[key], 'LOCK_DEPENDENCIES_INVALID');
  if (own(record, 'peerDependenciesMeta')) { if (!plain(record.peerDependenciesMeta)) fail('LOCK_PEER_META_INVALID'); for (const [name, meta] of Object.entries(record.peerDependenciesMeta)) { packageName(name); exact(meta, ['optional'], 'LOCK_PEER_META_INVALID'); if (meta.optional !== true) fail('LOCK_PEER_META_INVALID'); } }
  for (const key of ['os','cpu','libc']) if (own(record, key)) platformList(record[key], 'LOCK_PLATFORM_INVALID');
  for (const key of ['optional','dev','devOptional','peer','hasInstallScript','bundled','inBundle']) if (own(record, key) && typeof record[key] !== 'boolean') fail('LOCK_RECORD_INVALID', `${path}:${key}`);
}

export function parseAndValidateLockfile(lockfileBytes, rootPackageBytes, declaration = ACQUISITION_DECLARATION) {
  validateAcquisitionDeclaration(declaration);
  if (!(rootPackageBytes instanceof Uint8Array) || sha256(rootPackageBytes) !== declaration.rootPackageJsonSha256) fail('ROOT_PACKAGE_HASH_MISMATCH');
  if (!(lockfileBytes instanceof Uint8Array) || sha256(lockfileBytes) !== declaration.lockfileSha256) fail('LOCKFILE_HASH_MISMATCH');
  const rootPackage = parseBoundedStrictJson(rootPackageBytes, { maxBytes: 16 * 1024, maxValues: 1_000 });
  exact(rootPackage, ['name','private','version','description','dependencies'], 'ROOT_PACKAGE_INVALID');
  if (rootPackage.name !== 'wordle-g0-provider-tools' || rootPackage.private !== true || rootPackage.version !== '1.0.0' || typeof rootPackage.description !== 'string' || !same(rootPackage.dependencies, declaration.dependencies)) fail('ROOT_PACKAGE_POLICY_MISMATCH');
  const lock = parseBoundedStrictJson(lockfileBytes);
  validateLockfileV3Object(lock, { name: rootPackage.name, version: rootPackage.version, dependencies: declaration.dependencies });
  return { lock, rootPackage };
}

export function validateLockfileV3Object(lock, expected = { name: 'wordle-g0-provider-tools', version: '1.0.0', dependencies: ACQUISITION_DECLARATION.dependencies }) {
  exact(lock, ['name','version','lockfileVersion','requires','packages'], 'LOCK_ROOT_SHAPE_INVALID');
  exact(expected, ['name','version','dependencies'], 'LOCK_EXPECTATION_INVALID');
  if (lock.lockfileVersion !== 3 || lock.requires !== true || lock.name !== expected.name || lock.version !== expected.version || !plain(lock.packages) || !own(lock.packages, '')) fail('LOCK_POLICY_MISMATCH');
  const folded = new Set();
  for (const path of Object.keys(lock.packages)) { const f = path.toLowerCase(); if (folded.has(f)) fail('LOCK_PATH_COLLISION', path); folded.add(f); parseLockPath(path); validateRecord(path, lock.packages[path]); }
  if (!same(lock.packages[''].dependencies, expected.dependencies)) fail('LOCK_DIRECT_DEPENDENCIES_MISMATCH');
  return lock;
}

function platformDimension(list, actual) { if (!list) return true; const positives = list.filter((x) => !x.startsWith('!')); if (list.includes(`!${actual}`)) return false; return positives.length === 0 || positives.includes(actual); }
export function packageCompatibility(record, target = ACQUISITION_DECLARATION.target) {
  const dimensions = [['os', target.os], ['cpu', target.cpu], ['libc', target.libc]]; const reasons = [];
  for (const [key, actual] of dimensions) if (!platformDimension(record[key], actual)) reasons.push(`${key}:${actual}`);
  return { compatible: reasons.length === 0, reasons };
}

function parseVersion(text) { const m = typeof text === 'string' && text.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u); if (!m) return null; return { major:+m[1], minor:+m[2], patch:+m[3], pre:m[4]?.split('.') ?? [] }; }
function cmp(a,b) { for (const k of ['major','minor','patch']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1; if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0; for (let i=0;i<Math.max(a.pre.length,b.pre.length);i+=1) { if (a.pre[i] === undefined) return -1; if (b.pre[i] === undefined) return 1; if (a.pre[i] === b.pre[i]) continue; const an=/^\d+$/u.test(a.pre[i]), bn=/^\d+$/u.test(b.pre[i]); if (an && bn) return +a.pre[i] < +b.pre[i] ? -1 : 1; if (an !== bn) return an ? -1 : 1; return a.pre[i] < b.pre[i] ? -1 : 1; } return 0; }
function boundsFor(token) {
  if (token === '*' || /^x$/iu.test(token)) return [];
  const opm = token.match(/^(<=|>=|<|>|=)?\s*(.*)$/u), op = opm[1] || '', raw = opm[2];
  const partial = raw.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?$/u);
  if (partial && (!partial[2] || !partial[3] || /[xX*]/u.test(raw))) { const M=+partial[1], hasMinor=partial[2] && !/[xX*]/u.test(partial[2]), m=hasMinor?+partial[2]:0; const floor={major:M,minor:m,patch:0,pre:[]}, upper=hasMinor?{major:M,minor:m+1,patch:0,pre:[]}:{major:M+1,minor:0,patch:0,pre:[]}; if(op) { if(op==='>='||op==='<') return [[op,floor]]; if(op==='>') return [['>=',upper]]; if(op==='<=') return [['<',upper]]; if(op==='=') return [['>=',floor],['<',upper]]; } return [['>=',floor],['<',upper]]; }
  const prefix = raw[0]; if ((prefix === '^' || prefix === '~') && !op) { const body=raw.slice(1), pm=body.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u); if(!pm) fail('SEMVER_RANGE_UNSUPPORTED',token); const v={major:+pm[1],minor:+(pm[2]??0),patch:+(pm[3]??0),pre:pm[4]?.split('.')??[]}; let upper; if(prefix==='~') upper=pm[2]===undefined?{major:v.major+1,minor:0,patch:0,pre:[]}:{major:v.major,minor:v.minor+1,patch:0,pre:[]}; else if(v.major>0) upper={major:v.major+1,minor:0,patch:0,pre:[]}; else if(v.minor>0) upper={major:0,minor:v.minor+1,patch:0,pre:[]}; else upper={major:0,minor:0,patch:v.patch+1,pre:[]}; return [['>=',v],['<',upper]]; }
  const v=parseVersion(raw); if (!v) fail('SEMVER_RANGE_UNSUPPORTED', token); return [[op || '=',v]];
}
function testComparator(v,[op,w]) { const c=cmp(v,w); return op==='='?c===0:op==='>'?c>0:op==='>='?c>=0:op==='<'?c<0:op==='<='?c<=0:false; }
export function satisfiesSemver(version, expression) {
  const v=parseVersion(version); if (!v || typeof expression !== 'string' || expression.length > 1024) fail('SEMVER_RANGE_UNSUPPORTED', String(expression));
  let range=expression; const alias=range.match(/^npm:((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(.+)$/u); if (alias) range=alias[2];
  const alternatives=range.split(/\s*\|\|\s*/u).map((part) => {
    part=part.trim(); if (!part) fail('SEMVER_RANGE_UNSUPPORTED', expression);
    const hyphen=part.match(/^(\S+)\s+-\s+(\S+)$/u); let cs;
    if (hyphen) { const lo=parseVersion(hyphen[1]), hi=parseVersion(hyphen[2]); if (!lo||!hi) fail('SEMVER_RANGE_UNSUPPORTED', expression); cs=[['>=',lo],['<=',hi]]; }
    else { const tokens=part.replace(/(>=|<=|>|<|=)\s+/gu,'$1').split(/\s+/u); cs=tokens.flatMap(boundsFor); }
    return cs;
  });
  return alternatives.some((cs) => {
    const preAllowed=!v.pre.length || cs.some(([,w]) => w.pre.length && w.major===v.major && w.minor===v.minor && w.patch===v.patch);
    return preAllowed && cs.every((c) => testComparator(v,c));
  });
}

function expectedName(path, record) { return record.name ?? parseLockPath(path).name; }
function parentPackage(path) { const marker='/node_modules/'; const at=path.lastIndexOf(marker); return at < 0 ? '' : path.slice(0,at); }
export function resolveNodePackagePath(fromPath, name, packages) { packageName(name); let current=fromPath; while (true) { const candidate=current ? `${current}/node_modules/${name}` : `node_modules/${name}`; if (own(packages,candidate)) return candidate; if (!current) return null; current=parentPackage(current); } }
function validateLayout(layout, packages) {
  if (!Array.isArray(layout) || layout.length > JSON_LIMITS.values) fail('LAYOUT_INVALID'); const map=new Map(), folded=new Set();
  for (const item of layout) { exact(item,['path','name','version'],'LAYOUT_INVALID'); const f=typeof item.path==='string'?item.path.toLowerCase():''; if (map.has(item.path) || folded.has(f)) fail('LAYOUT_PATH_COLLISION',item.path); folded.add(f); parseLockPath(item.path); if (item.path === '' || typeof item.version !== 'string') fail('LAYOUT_INVALID'); packageName(item.name); const lock=packages[item.path]; if (!lock) fail('LAYOUT_EXTRANEOUS',item.path); if (expectedName(item.path,lock)!==item.name || lock.version!==item.version) fail('LAYOUT_PACKAGE_JSON_MISMATCH',item.path); map.set(item.path,item); }
  return map;
}
function edgeRange(range) { const alias=range.match(/^npm:((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)@(.+)$/u); return alias ? { packageName:alias[1], range:alias[2] } : { packageName:null, range }; }
function computeClosure({ starts, packages, layout, target, maxPackages, allowMissingOptional }) {
  const selected=new Set(), excluded=[], queue=sorted(starts); let steps=0; const cap=Math.min(Object.keys(packages).length+1,maxPackages+1);
  while(queue.length) { if (++steps > JSON_LIMITS.values) fail('RESOLVER_FIXED_POINT_LIMIT'); const path=queue.shift(); if(selected.has(path)) continue; const rec=packages[path]; if(!rec) fail('DEPENDENCY_UNRESOLVED',path); const compatibility=packageCompatibility(rec,target); if(!compatibility.compatible) fail('REQUIRED_PLATFORM_INCOMPATIBLE',path); if(!layout.has(path)) fail('LAYOUT_MISSING',path); selected.add(path); if(selected.size>maxPackages) fail('PROVIDER_PACKAGE_LIMIT');
    const edges=[]; for(const type of ['dependencies','optionalDependencies','peerDependencies']) for(const name of sorted(Object.keys(rec[type]||{}))) edges.push({type,name,range:rec[type][name]});
    for(const edge of edges) { const optionalPeer=edge.type==='peerDependencies'&&rec.peerDependenciesMeta?.[edge.name]?.optional===true; const optional=edge.type==='optionalDependencies'||optionalPeer; const resolved=resolveNodePackagePath(path,edge.name,packages); if(!resolved) { if(optionalPeer&&allowMissingOptional){ excluded.push({from:path,name:edge.name,reason:'absent-optional-peer'}); continue; } fail('DEPENDENCY_UNRESOLVED',`${path}:${edge.name}`); }
      const child=packages[resolved], compatibility2=packageCompatibility(child,target); if(!compatibility2.compatible) { if(optional){ excluded.push({from:path,name:edge.name,path:resolved,reason:'platform-incompatible',exclusionReasons:compatibility2.reasons}); continue; } fail('REQUIRED_PLATFORM_INCOMPATIBLE',resolved); }
      if(!layout.has(resolved)) { if(optional&&allowMissingOptional) fail('COMPATIBLE_OPTIONAL_MISSING',resolved); fail('LAYOUT_MISSING',resolved); }
      const er=edgeRange(edge.range), actualName=expectedName(resolved,child); if(er.packageName!==null&&er.packageName!==actualName) fail('DEPENDENCY_ALIAS_MISMATCH',`${path}:${edge.name}`); if(!satisfiesSemver(child.version,er.range)) fail('DEPENDENCY_RANGE_MISMATCH',`${path}:${edge.name}`); if(!selected.has(resolved)) { queue.push(resolved); queue.sort(rawCompare); }
    }
  }
  return { paths:sorted(selected), excluded:excluded.sort((a,b)=>rawCompare(`${a.from}\0${a.name}`,`${b.from}\0${b.name}`)) };
}

export function resolveProviderLockClosure({ provider, lock, physicalLayout, declaration = ACQUISITION_DECLARATION } = {}) {
  validateAcquisitionDeclaration(declaration); const policy=declaration.providerLimits[provider]; if(!policy) fail('PROVIDER_UNSUPPORTED'); validateLockfileV3Object(lock);
  const layout=validateLayout(physicalLayout,lock.packages); const root=lock.packages['']; const direct=resolveNodePackagePath('',policy.package,lock.packages); if(!direct) fail('DIRECT_DEPENDENCY_MISSING',policy.package); if(root.dependencies?.[policy.package]!==policy.version||lock.packages[direct].version!==policy.version) fail('DIRECT_DEPENDENCY_MISMATCH');
  // First model the entire root install. This is what makes an unrelated physical
  // package detectable as extraneous while provider output remains independent.
  const allStarts=sorted(Object.keys(root.dependencies||{})).map((name)=>{ const p=resolveNodePackagePath('',name,lock.packages); if(!p) fail('DEPENDENCY_UNRESOLVED',name); return p; });
  const install=computeClosure({starts:allStarts,packages:lock.packages,layout,target:declaration.target,maxPackages:Object.keys(lock.packages).length,allowMissingOptional:true});
  const expected=new Set(install.paths); for(const p of layout.keys()) if(!expected.has(p)) fail('LAYOUT_EXTRANEOUS',p);
  const closure=computeClosure({starts:[direct],packages:lock.packages,layout,target:declaration.target,maxPackages:policy.maxPackages,allowMissingOptional:true});
  return deepFreeze({provider,directPath:direct,paths:closure.paths,excludedOptional:closure.excluded,target:{...declaration.target},packageCount:closure.paths.length});
}
