import { g0RetryCollectorPolicy } from './g0-retry-evidence-collector-core.mjs';
import { s } from './g0-readonly-provider-adapter-common.mjs';

const account = g0RetryCollectorPolicy.accounts;
const vercelIdentity = s.obj({
  email: s.str(),
  name: { type: 'null' },
  team: s.obj({ id: s.id, name: s.str(), slug: s.str() }),
  username: s.str(),
});
const railwayResponse = s.obj({ data: s.obj({
  workspace: s.obj({ id: s.id, name: s.str(), plan: s.str(), projectCount: s.int(1000), projectCountIncludingDeleted: s.int(1000) }),
  customerType: s.obj({ fields: s.arr(s.obj({ name: s.str() }), 1000) }),
}) });
const railwayQuery = 'query($workspaceId: String!) { workspace(workspaceId: $workspaceId) { id name plan projectCount projectCountIncludingDeleted: projectCount(includeDeleted: true) } customerType: __type(name: "Customer") { fields { name } } }';
const railwayArgs = ['api', railwayQuery, '--raw-var', `workspaceId=${account.railway.workspaceId}`, '--compact'];

function assertVercelIdentity(value) {
  if (value.team.id !== account.vercel.teamId || value.team.slug !== account.vercel.teamSlug) throw new Error('VERCEL_PROBE_INVALID');
}
function assertRailway(value) {
  const workspace = value.data.workspace;
  if (workspace.id !== account.railway.workspaceId || workspace.name !== account.railway.workspaceName || workspace.plan !== 'HOBBY' || workspace.projectCount !== 1 || workspace.projectCountIncludingDeleted !== 1) throw new Error('RAILWAY_PROBE_INVALID');
  const names = value.data.customerType.fields.map(({ name }) => name);
  if (new Set(names).size !== names.length || names.some((name) => /(?:subtotal|taxamount|feeamount)/iu.test(name.replace(/[^a-z]/giu, '')))) throw new Error('RAILWAY_PROBE_INVALID');
  return names.slice().sort().join('\0');
}

export const VERCEL_ADAPTER = Object.freeze({
  provider: 'vercel', invocationProfile: 'vercel-g0-readonly/1', adapterVersion: 'wordle-g0-vercel-readonly/1', blocker: 'VERCEL_BILLING_COMPLETENESS_UNAVAILABLE',
  operations: Object.freeze({
    identity_before: { runtime: 'node_entrypoint', args: ['whoami', '--scope', account.vercel.teamId, '--json', '--no-color', '--non-interactive'], schema: vercelIdentity, resultPolicy: 'vercel_json_banner' },
    billing_capability: { runtime: 'node_entrypoint', args: ['api', '/v1/billing/charges?from=2000-01-01&to=2000-01-02', '--scope', account.vercel.teamId, '--raw', '--no-color', '--non-interactive'], schema: null, resultPolicy: 'vercel_billing_404' },
    identity_after: { runtime: 'node_entrypoint', args: ['whoami', '--scope', account.vercel.teamId, '--json', '--no-color', '--non-interactive'], schema: vercelIdentity, resultPolicy: 'vercel_json_banner' },
  }),
  async probe(runtime) {
    const before = await runtime.runOperation('identity_before'); assertVercelIdentity(before);
    if (await runtime.runOperation('billing_capability') !== 'VERCEL_BILLING_404') throw new Error('VERCEL_PROBE_INVALID');
    const after = await runtime.runOperation('identity_after'); assertVercelIdentity(after);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('VERCEL_PROBE_INVALID');
  },
});

export const RAILWAY_ADAPTER = Object.freeze({
  provider: 'railway', invocationProfile: 'railway-g0-readonly/1', adapterVersion: 'wordle-g0-railway-readonly/1', blocker: 'RAILWAY_TAX_OR_FEE_UNKNOWN',
  operations: Object.freeze({
    workspace_before: { runtime: 'native_binary', args: railwayArgs, schema: railwayResponse, resultPolicy: 'json_empty_stderr' },
    workspace_after: { runtime: 'native_binary', args: railwayArgs, schema: railwayResponse, resultPolicy: 'json_empty_stderr' },
  }),
  async probe(runtime) {
    const before = await runtime.runOperation('workspace_before'); const beforeNames = assertRailway(before);
    const after = await runtime.runOperation('workspace_after');
    if (beforeNames !== assertRailway(after) || JSON.stringify(before.data.workspace) !== JSON.stringify(after.data.workspace)) throw new Error('RAILWAY_PROBE_INVALID');
  },
});

export const SUPABASE_ADAPTER = Object.freeze({
  provider: 'supabase', invocationProfile: 'supabase-g0-readonly/1', adapterVersion: 'wordle-g0-supabase-readonly/1', blocker: 'SUPABASE_AUTH_UNAVAILABLE',
  operations: Object.freeze({ auth_preflight: { runtime: 'native_binary', args: ['projects', 'list', '--output-format', 'json'], schema: null, resultPolicy: 'supabase_legacy_auth_required' } }),
  async probe(runtime) { if (await runtime.runOperation('auth_preflight') !== 'SUPABASE_LEGACY_AUTH_REQUIRED') throw new Error('SUPABASE_AUTH_CONDITION_INVALID'); },
});
