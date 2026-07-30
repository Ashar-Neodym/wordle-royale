import { createHash } from 'node:crypto';
import { lstat, realpath, readFile, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const FULL_SHA = /^[0-9a-f]{40}$/u;
const EXPECTED_REPOSITORY = 'Ashar-Neodym/wordle-royale';
const EXPECTED_REMOTE = /^(?:git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)(?:Ashar-Neodym\/wordle-royale)(?:\.git)?$/u;
const MANIFEST_PATH = 'docs/wordle-royale-g0-provisioning-manifest.yaml';
const OWNER_MODE = 0o600;
const exactKeys = (object, keys, code) => fail(object && !Array.isArray(object) && Object.keys(object).sort().join('|') === [...keys].sort().join('|'), code);
const fail = (condition, code) => { if (!condition) { const error = new Error(code); error.code = code; throw error; } };
export const canonicalJson = (value) => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = (value) => createHash('sha256').update(value).digest('hex');

function scalar(raw) {
  fail(!/[&*!]|<<:|\{|\}/u.test(raw), 'MANIFEST_UNSUPPORTED_YAML');
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === '[]') return [];
  if (raw.startsWith('"')) { try { const value = JSON.parse(raw); fail(typeof value === 'string', 'MANIFEST_UNSUPPORTED_YAML'); return value; } catch { fail(false, 'MANIFEST_UNSUPPORTED_YAML'); } }
  fail(raw.length > 0 && !raw.startsWith('[') && !raw.startsWith("'"), 'MANIFEST_UNSUPPORTED_YAML');
  return raw;
}

// Deliberately implements only the map/list/scalar subset used by this security manifest.
export function parseManifest(text) {
  fail(typeof text === 'string' && Buffer.byteLength(text) <= 32 * 1024 && text.endsWith('\n') && !text.includes('\r') && !text.includes('\t'), 'MANIFEST_ENCODING_INVALID');
  const rows = text.split('\n').slice(0, -1).map((raw, index) => {
    fail(raw.trim() && !raw.trimStart().startsWith('#') && raw.trimEnd() === raw, 'MANIFEST_UNSUPPORTED_YAML');
    const spaces = raw.length - raw.trimStart().length;
    fail(spaces % 2 === 0, 'MANIFEST_INDENT_INVALID');
    return { indent: spaces, body: raw.slice(spaces), line: index + 1 };
  });
  function mapAt(start, indent, stopForList = false) {
    const out = {}; let index = start;
    while (index < rows.length && rows[index].indent === indent && !(stopForList && rows[index].body.startsWith('- '))) {
      const match = /^([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/u.exec(rows[index].body);
      fail(match && !Object.hasOwn(out, match[1]), match ? 'MANIFEST_DUPLICATE_KEY' : 'MANIFEST_UNSUPPORTED_YAML');
      const [, key, raw] = match;
      if (raw !== undefined) { out[key] = scalar(raw); index += 1; continue; }
      fail(index + 1 < rows.length && rows[index + 1].indent === indent + 2, 'MANIFEST_MISSING_VALUE');
      if (rows[index + 1].body.startsWith('- ')) { const parsed = listAt(index + 1, indent + 2); out[key] = parsed.value; index = parsed.index; }
      else { const parsed = mapAt(index + 1, indent + 2); out[key] = parsed.value; index = parsed.index; }
    }
    return { value: out, index };
  }
  function listAt(start, indent) {
    const out = []; let index = start;
    while (index < rows.length && rows[index].indent === indent && rows[index].body.startsWith('- ')) {
      const item = rows[index].body.slice(2);
      const first = /^([A-Za-z][A-Za-z0-9]*):(?: (.*))?$/u.exec(item);
      if (!first) { out.push(scalar(item)); index += 1; continue; }
      const object = {}; fail(first[2] !== undefined, 'MANIFEST_MISSING_VALUE'); object[first[1]] = scalar(first[2]); index += 1;
      if (index < rows.length && rows[index].indent === indent + 2) {
        const rest = mapAt(index, indent + 2, true); for (const [key, value] of Object.entries(rest.value)) { fail(!Object.hasOwn(object, key), 'MANIFEST_DUPLICATE_KEY'); object[key] = value; } index = rest.index;
      }
      out.push(object);
    }
    return { value: out, index };
  }
  const parsed = mapAt(0, 0); fail(parsed.index === rows.length, 'MANIFEST_INDENT_INVALID'); return parsed.value;
}

const same = (actual, expected, code) => fail(actual === expected, code);
function decimalParts(value, code) { const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,4}))?$/u.exec(value ?? ''); fail(match, code); return BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0')); }

export function validateManifest(m) {
  exactKeys(m, ['schema','status','repository','sourceSha','approval','operator','accounts','previewPreservation','productionShells','plannedTopology','cost','network','forbidden','rollback','blockingPrerequisites','nextGate'], 'MANIFEST_TOP_LEVEL_SCHEMA_INVALID');
  same(m.schema, 'wordle-royale-g0-provisioning/v1', 'MANIFEST_SCHEMA_INVALID'); same(m.status, 'local_qualification_required', 'MANIFEST_STATUS_INVALID'); same(m.repository, EXPECTED_REPOSITORY, 'REPOSITORY_IDENTITY_INVALID'); same(m.sourceSha, null, 'MANIFEST_SOURCE_MUST_BE_UNQUALIFIED');
  exactKeys(m.approval, ['singleUse','executeWithinMinutes','partialAttemptConsumesApproval','approvalId','approvedBy','approvedAt','executeBefore'], 'APPROVAL_SCHEMA_INVALID');
  fail(m.approval.singleUse === true && m.approval.executeWithinMinutes === '60' && m.approval.partialAttemptConsumesApproval === true && ['approvalId','approvedBy','approvedAt','executeBefore'].every((key) => m.approval[key] === null), 'APPROVAL_NOT_NULL');
  exactKeys(m.operator, ['principal','timezone'], 'OPERATOR_SCHEMA_INVALID'); same(m.operator.principal, 'ashar', 'OPERATOR_POLICY_INVALID'); same(m.operator.timezone, 'Asia/Karachi', 'OPERATOR_POLICY_INVALID');
  exactKeys(m.accounts, ['vercel','railway'], 'ACCOUNT_SCHEMA_INVALID'); exactKeys(m.accounts.vercel, ['teamId','teamSlug'], 'ACCOUNT_SCHEMA_INVALID'); exactKeys(m.accounts.railway, ['workspaceId','workspaceName'], 'ACCOUNT_SCHEMA_INVALID');
  fail(m.accounts.vercel.teamId === 'team_OeoH1n8WNMnJfgo4otQGevCG' && m.accounts.vercel.teamSlug === 'ashar-neodyms-projects' && m.accounts.railway.workspaceId === 'ae263dc6-85f3-4d84-9415-ecdf621f49b6' && m.accounts.railway.workspaceName === "ashar-neodym's Projects", 'ACCOUNT_IDENTITY_INVALID');
  exactKeys(m.previewPreservation, ['vercel','railway','postgresql','mutationAllowed'], 'PREVIEW_SCHEMA_INVALID'); exactKeys(m.previewPreservation.vercel, ['projectId','projectName'], 'PREVIEW_SCHEMA_INVALID'); exactKeys(m.previewPreservation.railway, ['projectId','projectName','environmentId','serviceId'], 'PREVIEW_SCHEMA_INVALID'); exactKeys(m.previewPreservation.postgresql, ['provider','projectRef'], 'PREVIEW_SCHEMA_INVALID');
  const previewIds = [m.previewPreservation.vercel.projectId,m.previewPreservation.railway.projectId,m.previewPreservation.railway.environmentId,m.previewPreservation.railway.serviceId,m.previewPreservation.postgresql.projectRef];
  const expectedPreviewIds = ['prj_2YxPufRTr52AjnQKvKiIunHnnZXl','12f01fb0-40a0-483a-9d88-923b4677b4c0','25f2e37e-88a6-4587-a875-d8662b684e54','c2d7de01-1827-4df3-933c-572615e020a4','edixtvmzktafxipifxvi'];
  fail(m.previewPreservation.mutationAllowed === false && previewIds.every((id,index) => id === expectedPreviewIds[index]) && m.previewPreservation.vercel.projectName === 'wordle-royale-web' && m.previewPreservation.railway.projectName === 'lucid-dream' && m.previewPreservation.postgresql.provider === 'supabase', 'PREVIEW_PRESERVATION_INVALID');
  exactKeys(m.productionShells, ['policy','vercel','railway','supabase','redis'], 'SHELL_SCHEMA_INVALID'); same(m.productionShells.policy, 'strict_no_secret_g0', 'SHELL_POLICY_INVALID');
  exactKeys(m.productionShells.vercel, ['projectCount','projectName','sourceLinkage','deployments','environmentVariables','domains'], 'SHELL_SCHEMA_INVALID');
  exactKeys(m.productionShells.railway, ['projectCount','projectName','environmentCount','environmentName','region','apiServiceCount','apiServiceName','apiServingReplicas','postgresServiceCount','postgresDeferredGate','postgresFutureName','sourceLinkage','deployments','variables','domains'], 'SHELL_SCHEMA_INVALID');
  exactKeys(m.productionShells.supabase, ['newProjects'], 'SHELL_SCHEMA_INVALID'); exactKeys(m.productionShells.redis, ['services'], 'SHELL_SCHEMA_INVALID');
  const expectedShells = {
    policy:'strict_no_secret_g0',
    vercel:{ projectCount:'1', projectName:'wordle-royale-production-web', sourceLinkage:'forbidden', deployments:'0', environmentVariables:'0', domains:'0' },
    railway:{ projectCount:'1', projectName:'wordle-royale-production', environmentCount:'1', environmentName:'production', region:'southeast-asia', apiServiceCount:'1', apiServiceName:'wordle-royale-production-api', apiServingReplicas:'0', postgresServiceCount:'0', postgresDeferredGate:'G2', postgresFutureName:'wordle-royale-production-postgres', sourceLinkage:'forbidden', deployments:'0', variables:'0', domains:'0' },
    supabase:{ newProjects:'0' }, redis:{ services:'0' },
  };
  fail(canonicalJson(m.productionShells) === canonicalJson(expectedShells), 'ZERO_ACTION_POLICY_INVALID');
  fail(m.productionShells.vercel.projectName !== m.previewPreservation.vercel.projectName && m.productionShells.railway.projectName !== m.previewPreservation.railway.projectName, 'PREVIEW_PRODUCTION_OVERLAP');
  exactKeys(m.plannedTopology, ['railwayRegion','apiReplicasAtDormantDeploy','apiAndPostgresPrivateNetwork','vercelRuntimeRegionPreference','plannedWebOrigin','plannedApiOrigin'], 'TOPOLOGY_SCHEMA_INVALID');
  fail(canonicalJson(m.plannedTopology) === canonicalJson({ railwayRegion:'southeast-asia', apiReplicasAtDormantDeploy:'1', apiAndPostgresPrivateNetwork:true, vercelRuntimeRegionPreference:'sin1', plannedWebOrigin:null, plannedApiOrigin:null }), 'TOPOLOGY_POLICY_INVALID');
  exactKeys(m.cost, ['currency','observedAt','railwayCurrentBillingPeriodUsageApprox','railwayTargetPlan','railwayMonthlyMinimumIncludingCredits','railwayWholeWorkspaceInvoiceCapPreTax','overageApproved','paidAddonsApproved','vercelTargetPlan','vercelApprovedMonthlyCharge','vercelEligibilityMustBeReconfirmed','supabaseApprovedMonthlyCharge','planUpgradeUnderThisManifest'], 'COST_SCHEMA_INVALID');
  const usage = decimalParts(m.cost.railwayCurrentBillingPeriodUsageApprox, 'COST_INVALID'), minimum = decimalParts(m.cost.railwayMonthlyMinimumIncludingCredits, 'COST_INVALID'), cap = decimalParts(m.cost.railwayWholeWorkspaceInvoiceCapPreTax, 'COST_INVALID');
  fail(usage <= cap && minimum === 50000n && cap === 50000n && decimalParts(m.cost.vercelApprovedMonthlyCharge, 'COST_INVALID') === 0n && decimalParts(m.cost.supabaseApprovedMonthlyCharge, 'COST_INVALID') === 0n, 'COST_POLICY_INVALID');
  fail(canonicalJson(m.cost) === canonicalJson({ currency:'USD', observedAt:'2026-07-30', railwayCurrentBillingPeriodUsageApprox:'1.3531', railwayTargetPlan:'Hobby', railwayMonthlyMinimumIncludingCredits:'5.00', railwayWholeWorkspaceInvoiceCapPreTax:'5.00', overageApproved:false, paidAddonsApproved:false, vercelTargetPlan:'Hobby', vercelApprovedMonthlyCharge:'0.00', vercelEligibilityMustBeReconfirmed:true, supabaseApprovedMonthlyCharge:'0.00', planUpgradeUnderThisManifest:false }), 'COST_POLICY_INVALID');
  exactKeys(m.network, ['publicTrafficAllowed','generatedDomainsAllowed','customDomains','dnsChanges','tlsChanges'], 'NETWORK_SCHEMA_INVALID'); fail(m.network.publicTrafficAllowed === false && m.network.generatedDomainsAllowed === false && ['customDomains','dnsChanges','tlsChanges'].every((key) => Array.isArray(m.network[key]) && m.network[key].length === 0), 'NETWORK_POLICY_INVALID');
  const expectedForbidden = ['preview mutation or reuse','git repository linkage','source image or branch assignment','build, deployment, promotion, restart, or replica start','PostgreSQL creation or provider-generated credential access','variables, secrets, references, tokens, or credential inspection','migrations, SQL, schema access, seeds, or account writes','domains, DNS, certificates, aliases, or public traffic','paid upgrade, overage, add-on, invitation, or payment-method change','Supabase or Redis changes'];
  fail(canonicalJson(m.forbidden) === canonicalJson(expectedForbidden), 'FORBIDDEN_POLICY_INVALID');
  exactKeys(m.rollback, ['authorizedOnlyForNewUnambiguousIds','triggers','order'], 'ROLLBACK_SCHEMA_INVALID');
  const expectedRollback = { authorizedOnlyForNewUnambiguousIds:true, triggers:['wrong account, name, region, plan, count, or cost','automatic source linkage, deployment, replica, domain, or exposure','unexpected variables, credentials, add-ons, or preview mutation','evidence ambiguity or cost projection above cap'], order:['preserve sanitized metadata and audit evidence','delete new API service shell','delete new Railway environment and project','delete new Vercel project','prove preview unchanged and all new IDs absent'] };
  fail(canonicalJson(m.rollback) === canonicalJson(expectedRollback), 'ROLLBACK_POLICY_INVALID');
  fail(Array.isArray(m.blockingPrerequisites) && m.blockingPrerequisites.length === 4, 'BLOCKER_SCHEMA_INVALID');
  const expected = {
    LIVE_PROVIDER_PROVENANCE:{ state:'resolved_by_wave_ad', reason:'production-live-v3 collector, verifier, replay consumption, and shipped CLI E2E are wired by Wave AD' },
    SINGLE_NODE_POSTGRES_OBSERVATION:{ state:'resolved_by_wave_ad', reason:'Wave AD models the production single-node database with one provider-derived observedReplicaId' },
    RAILWAY_BACKUP_RESTORE:{ state:'unresolved_before_G2', reason:'backup retention, restore destination, RPO/RTO, and restore drill are not yet proven' },
    PLAN_AND_COST:{ state:'approval_required', reason:'Railway Hobby or any billing change is not authorized by this draft' },
  };
  const expectedBlockerOrder = Object.keys(expected);
  for (const [index,blocker] of m.blockingPrerequisites.entries()) { exactKeys(blocker, ['id','state','reason'], 'BLOCKER_SCHEMA_INVALID'); const policy=expected[blocker.id]; fail(blocker.id === expectedBlockerOrder[index] && policy && blocker.state === policy.state && blocker.reason === policy.reason, 'BLOCKER_CLASSIFICATION_INVALID'); delete expected[blocker.id]; }
  fail(Object.keys(expected).length === 0, 'BLOCKER_CLASSIFICATION_INVALID'); exactKeys(m.nextGate, ['name','hostedMutationAllowed'], 'NEXT_GATE_SCHEMA_INVALID'); fail(m.nextGate.name === 'Wave AE exact-SHA local qualification' && m.nextGate.hostedMutationAllowed === false, 'HOSTED_MUTATION_FORBIDDEN');
  return m;
}

function git(repo, args, options = {}) {
  const result = spawnSync('/usr/bin/git', ['-c','core.pager=cat','-C',repo,...args], { encoding: options.encoding ?? 'utf8', maxBuffer: 16 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', HOME: process.env.HOME ?? '/nonexistent' } });
  fail(result.status === 0 && !result.error, options.code ?? 'GIT_OPERATION_FAILED'); return result.stdout;
}
async function protectedAbsolute(path, kind) { fail(typeof path === 'string' && isAbsolute(path) && resolve(path) === path, `${kind}_PATH_NOT_ABSOLUTE`); const stat = await lstat(path); fail(!stat.isSymbolicLink(), `${kind}_SYMLINK_FORBIDDEN`); fail(await realpath(path) === path, `${kind}_SYMLINK_FORBIDDEN`); return stat; }
function targetFile(repo, targetSha, path) { return git(repo, ['show', `${targetSha}:${path}`], { code: 'TARGET_ARTIFACT_MISSING' }); }
function validateWaveAd(repo, targetSha) {
  const pkg = JSON.parse(targetFile(repo,targetSha,'package.json')); const api = JSON.parse(targetFile(repo,targetSha,'apps/api/package.json'));
  const required = {
    'test:provider-provenance':'node --test scripts/provider-provenance.test.mjs scripts/provider-provenance-live.test.mjs scripts/provider-provenance-live-collector.test.mjs scripts/provider-provenance-live-cli.e2e.test.mjs',
    'test:auth-preflight-live-v3-cli-e2e':'pnpm --filter @wordle-royale/api test:auth-preflight-live-v3-cli-e2e',
  };
  fail(Object.entries(required).every(([key,value]) => pkg.scripts?.[key] === value) && api.scripts?.['test:auth-preflight-live-v3-cli-e2e'] === 'node scripts/run-auth-activation-preflight-live-v3-cli-e2e.mjs', 'WAVE_AD_PACKAGE_WIRING_INVALID');
  const core = targetFile(repo,targetSha,'scripts/auth-activation-preflight-core.mjs'); const collector = targetFile(repo,targetSha,'scripts/provider-provenance-live-collector-core.mjs');
  fail(core.includes("providerEvidenceLane === 'production-live-v3'") && core.includes('observedReplicaId') && core.includes('consumeProviderReplay') && collector.includes('verifyAndConsumeLiveBundle'), 'WAVE_AD_SEMANTICS_INVALID');
}
export async function qualify({ repo, manifest, targetSha, receipt }) {
  await protectedAbsolute(repo, 'REPOSITORY'); const repoStat = await lstat(repo); fail(repoStat.isDirectory(), 'REPOSITORY_INVALID');
  await protectedAbsolute(manifest, 'MANIFEST'); fail(dirname(manifest).startsWith(`${repo}${sep}`) || dirname(manifest) === repo, 'MANIFEST_OUTSIDE_REPOSITORY');
  fail(relative(repo,manifest).split(sep).join('/') === MANIFEST_PATH, 'MANIFEST_PATH_INVALID');
  fail(typeof receipt === 'string' && isAbsolute(receipt) && resolve(receipt) === receipt, 'RECEIPT_PATH_NOT_ABSOLUTE'); fail(!(receipt === repo || receipt.startsWith(`${repo}${sep}`)), 'RECEIPT_INSIDE_REPOSITORY');
  await protectedAbsolute(dirname(receipt), 'RECEIPT_PARENT');
  fail(FULL_SHA.test(targetSha ?? ''), 'TARGET_SHA_INVALID');
  same(git(repo,['rev-parse','--show-toplevel']).trim(), repo, 'REPOSITORY_ROOT_INVALID'); same(git(repo,['rev-parse','HEAD']).trim(), targetSha, 'TARGET_SHA_STALE');
  fail(git(repo,['cat-file','-t',targetSha]).trim() === 'commit', 'TARGET_NOT_COMMIT'); fail(EXPECTED_REMOTE.test(git(repo,['config','--get','remote.origin.url']).trim()), 'REPOSITORY_IDENTITY_INVALID');
  fail(git(repo,['status','--porcelain=v1','--untracked-files=all']).length === 0, 'RELEVANT_TREE_DIRTY');
  const manifestBytes = await readFile(manifest); const committedManifest = targetFile(repo,targetSha,MANIFEST_PATH); fail(manifestBytes.equals(Buffer.from(committedManifest)), 'MANIFEST_TARGET_MISMATCH'); validateManifest(parseManifest(manifestBytes.toString('utf8'))); validateWaveAd(repo,targetSha);
  const tree = git(repo,['ls-tree','-rz','--full-tree',targetSha], { encoding:'buffer' });
  for (const entry of tree.toString('utf8').split('\0').filter(Boolean)) fail(/^(100644|100755) blob [0-9a-f]{40}\t[^\n\0]+$/u.test(entry), 'UNSUPPORTED_GIT_ENTRY');
  const body = { schema:'wordle-royale-g0-local-qualification-receipt/v1', repository:EXPECTED_REPOSITORY, targetSha, sourceArtifactDigest:`sha256:${digest(tree)}`, manifestDigest:`sha256:${digest(manifestBytes)}`, waveAdToolingEvidence:{ providerProvenance:'production-live-v3', singleNodePostgresObservation:'observedReplicaId', packageWiringVerified:true }, blockers:{ railwayBackupRestore:'G2_deferred', planAndCost:'human_approval_required' }, hostedMutationAuthorized:false };
  const complete = { ...body, receiptDigest:`sha256:${digest(canonicalJson(body))}` };
  const temporary = `${receipt}.tmp-${process.pid}-${createHash('sha256').update(receipt).update(targetSha).digest('hex').slice(0,12)}`;
  let handle;
  try { handle = await open(temporary, 'wx', OWNER_MODE); await handle.writeFile(`${JSON.stringify(complete,null,2)}\n`, { encoding:'utf8' }); await handle.sync(); await handle.close(); handle = undefined; await link(temporary,receipt); await unlink(temporary); const parent = await open(dirname(receipt),'r'); await parent.sync(); await parent.close(); }
  catch (error) { if (handle) await handle.close().catch(()=>{}); await unlink(temporary).catch(()=>{}); if (error?.code === 'EEXIST') fail(false,'RECEIPT_ALREADY_EXISTS'); throw error; }
  return complete;
}
