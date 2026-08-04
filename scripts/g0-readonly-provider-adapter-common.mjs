import { G0_RETRY_ADAPTER_ENVELOPE_SCHEMA, G0_RETRY_COLLECTOR_POLICY_DIGEST, g0RetryCollectorPolicy } from './g0-retry-evidence-collector-core.mjs';
import { createSanitizedProviderRuntime, runSanitizedAdapterMain, writeSanitizedEnvelope } from './g0-sanitized-provider-adapter-runtime.mjs';

const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, fields, code = 'PROVIDER_SCHEMA_INVALID') => {
  if (!plain(value) || Object.keys(value).sort().join('\0') !== [...fields].sort().join('\0')) fail(code);
};
const fixedString = (value, expected, code = 'PROVIDER_SCOPE_MISMATCH') => { if (value !== expected) fail(code); return value; };
const bool = (value) => { if (typeof value !== 'boolean') fail('PROVIDER_SCHEMA_INVALID'); return value; };
const canonicalTime = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) fail('PROVIDER_TIME_INVALID');
  return value;
};
const decimal = (value) => {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,8})\.[0-9]{4}$/u.test(value)) fail('PROVIDER_MONEY_INVALID');
  return value;
};
const identifier = (value) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !/^[A-Za-z0-9_' -]+$/u.test(value)) fail('PROVIDER_SCHEMA_INVALID');
  return value;
};
const absent = (value, kind) => {
  exact(value, ['id', 'name', 'idLookup', 'nameLookup', 'pendingDeletion', 'tombstone']);
  fixedString(value.id, g0RetryCollectorPolicy.createdIds[kind]); fixedString(value.name, g0RetryCollectorPolicy.createdNames[kind]);
  fixedString(value.idLookup, 'absent', 'PRIOR_RESOURCE_PRESENT'); fixedString(value.nameLookup, 'absent', 'PRIOR_RESOURCE_PRESENT');
  if (bool(value.pendingDeletion) || bool(value.tombstone)) fail('PRIOR_RESOURCE_TRANSITIONAL');
  return Object.freeze({ ...value });
};
const interval = (value) => {
  exact(value, ['start', 'end']); const start = canonicalTime(value.start), end = canonicalTime(value.end);
  if (Date.parse(start) >= Date.parse(end)) fail('PROVIDER_TIME_INVALID'); return Object.freeze({ start, end });
};
const completePage = (value) => {
  exact(value, ['complete', 'nextCursor', 'totalCount']);
  if (value.complete !== true || value.nextCursor !== '' || !Number.isSafeInteger(value.totalCount) || value.totalCount < 0) fail('PROVIDER_PAGINATION_INCOMPLETE');
};

export const s = Object.freeze({
  str: (maxLength = 128, pattern = '^[^\\u0000\\r\\n]{1,128}$') => ({ type: 'string', maxLength, pattern }),
  id: { type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' },
  bool: { type: 'boolean' },
  int: (max = 10_000) => ({ type: 'integer', min: 0, max }),
  obj: (fields) => ({ type: 'object', fields }),
  arr: (items, maxItems = 1000) => ({ type: 'array', items, maxItems }),
});

export function parseAdapterArguments(argv, expectedProvider) {
  const labels = ['collect', '--provider', expectedProvider, '--challenge-id', null, '--run-id', null, '--nonce', null, '--collector-key-id', null, '--challenge-digest', null, '--policy-digest', G0_RETRY_COLLECTOR_POLICY_DIGEST, '--format', 'json'];
  if (!Array.isArray(argv) || argv.length !== 17) fail('ADAPTER_ARGV_INVALID');
  for (let index = 0; index < labels.length; index += 1) if (labels[index] !== null && argv[index] !== labels[index]) fail('ADAPTER_ARGV_INVALID');
  for (const index of [4, 6, 8, 10]) if (typeof argv[index] !== 'string' || argv[index].length < 3 || argv[index].length > 128 || /[\0\r\n]/u.test(argv[index])) fail('ADAPTER_ARGV_INVALID');
  if (!/^sha256:[a-f0-9]{64}$/u.test(argv[12])) fail('ADAPTER_ARGV_INVALID');
  return Object.freeze({ provider: expectedProvider, challengeId: argv[4], runId: argv[6], nonce: argv[8], collectorKeyId: argv[10], challengeDigest: argv[12], policyDigest: argv[14] });
}

export function blockedEnvelope(binding, adapterVersion, blocker, observedAt) {
  canonicalTime(observedAt);
  return Object.freeze({ schemaVersion: G0_RETRY_ADAPTER_ENVELOPE_SCHEMA, provider: binding.provider, adapterVersion, challengeId: binding.challengeId, runId: binding.runId, nonce: binding.nonce, collectorKeyId: binding.collectorKeyId, challengeDigest: binding.challengeDigest, policyDigest: binding.policyDigest, observedAt, observationMode: g0RetryCollectorPolicy.observationMode, providerMutationObserved: false, status: 'blocked', blocker: Object.freeze({ code: blocker }), payload: null });
}

export function validateVercelCandidate({ identity, inventory, billing }) {
  exact(identity, ['accountId', 'teamId', 'teamSlug', 'plan']);
  fixedString(identity.accountId, g0RetryCollectorPolicy.accounts.vercel.teamId); for (const key of ['teamId', 'teamSlug', 'plan']) fixedString(identity[key], g0RetryCollectorPolicy.accounts.vercel[key]);
  exact(inventory, ['accountId', 'page', 'projects']); fixedString(inventory.accountId, identity.accountId); completePage(inventory.page);
  if (!Array.isArray(inventory.projects) || inventory.projects.length !== inventory.page.totalCount) fail('PROVIDER_PAGINATION_INCOMPLETE');
  for (const project of inventory.projects) { exact(project, ['id', 'name', 'pendingDeletion', 'tombstone']); identifier(project.id); identifier(project.name); bool(project.pendingDeletion); bool(project.tombstone); }
  const priorId = g0RetryCollectorPolicy.createdIds.vercelProject, priorName = g0RetryCollectorPolicy.createdNames.vercelProject;
  if (inventory.projects.some((x) => x.id === priorId || x.name === priorName || x.pendingDeletion || x.tombstone)) fail('PRIOR_RESOURCE_PRESENT');
  if (!inventory.projects.some((x) => x.id === g0RetryCollectorPolicy.preview.vercelProjectId)) fail('PREVIEW_IDENTITY_DRIFT');
  exact(billing, ['accountId', 'billingInterval', 'currency', 'chargeUsd', 'complete']); fixedString(billing.accountId, identity.accountId); fixedString(billing.currency, 'USD'); if (billing.complete !== true) fail('BILLING_INCOMPLETE');
  const billingInterval = interval(billing.billingInterval), chargeUsd = decimal(billing.chargeUsd); if (chargeUsd !== '0.0000') fail('VERCEL_CHARGE_NOT_ZERO');
  return Object.freeze({ account: Object.freeze({ teamId: identity.teamId, teamSlug: identity.teamSlug, plan: identity.plan }), billingInterval, chargeQuotes: Object.freeze([Object.freeze({ currency: 'USD', interval: billingInterval, chargeUsd })]), priorCreatedResource: absent({ id: priorId, name: priorName, idLookup: 'absent', nameLookup: 'absent', pendingDeletion: false, tombstone: false }, 'vercelProject'), preview: Object.freeze({ projectId: g0RetryCollectorPolicy.preview.vercelProjectId, unchanged: true }) });
}

export function validateRailwayCandidate({ identity, topology, billing }) {
  exact(identity, ['accountId', 'workspaceId', 'workspaceName', 'plan']); fixedString(identity.accountId, g0RetryCollectorPolicy.accounts.railway.workspaceId);
  for (const key of ['workspaceId', 'workspaceName', 'plan']) fixedString(identity[key], g0RetryCollectorPolicy.accounts.railway[key]);
  exact(topology, ['accountId', 'page', 'preview', 'priorCreatedResources']); fixedString(topology.accountId, identity.accountId); completePage(topology.page);
  exact(topology.preview, ['projectId', 'environmentId', 'serviceId', 'unchanged']);
  for (const [field, key] of [['projectId', 'railwayProjectId'], ['environmentId', 'railwayEnvironmentId'], ['serviceId', 'railwayServiceId']]) fixedString(topology.preview[field], g0RetryCollectorPolicy.preview[key], 'PREVIEW_IDENTITY_DRIFT');
  if (topology.preview.unchanged !== true) fail('PREVIEW_IDENTITY_DRIFT');
  exact(topology.priorCreatedResources, ['railwayProject', 'railwayEnvironment', 'railwayService', 'railwayServiceInstance']); const resources = {};
  for (const kind of Object.keys(topology.priorCreatedResources)) resources[kind] = absent(topology.priorCreatedResources[kind], kind);
  if (topology.page.totalCount !== 3) fail('PROVIDER_PAGINATION_INCOMPLETE');
  exact(billing, ['accountId', 'billingInterval', 'currency', 'subtotalUsd', 'taxesUsd', 'feesUsd', 'appliedCreditsUsd', 'unappliedBalanceUsd', 'complete']); fixedString(billing.accountId, identity.accountId); fixedString(billing.currency, 'USD'); if (billing.complete !== true) fail('BILLING_INCOMPLETE');
  const billingInterval = interval(billing.billingInterval), quote = { currency: 'USD', interval: billingInterval, subtotalUsd: decimal(billing.subtotalUsd), taxesUsd: decimal(billing.taxesUsd), feesUsd: decimal(billing.feesUsd), appliedCreditsUsd: decimal(billing.appliedCreditsUsd), unappliedBalanceUsd: decimal(billing.unappliedBalanceUsd) };
  const units = (x) => BigInt(x.replace('.', '')); const allIn = units(quote.subtotalUsd) + units(quote.taxesUsd) + units(quote.feesUsd) - units(quote.appliedCreditsUsd); if (allIn < 0n || allIn >= 50_000n) fail('RAILWAY_COST_INVALID');
  return Object.freeze({ account: Object.freeze({ workspaceId: identity.workspaceId, workspaceName: identity.workspaceName, plan: identity.plan }), billingInterval, costQuotes: Object.freeze([Object.freeze(quote)]), priorCreatedResources: Object.freeze(resources), preview: Object.freeze({ ...topology.preview }) });
}

export function validateSupabaseCandidate({ auth, projects }) {
  exact(auth, ['authenticated', 'accountId']); if (auth.authenticated !== true) fail('SUPABASE_AUTH_UNAVAILABLE'); identifier(auth.accountId);
  exact(projects, ['accountId', 'page', 'projects']); fixedString(projects.accountId, auth.accountId); completePage(projects.page);
  if (!Array.isArray(projects.projects) || projects.projects.length !== projects.page.totalCount) fail('PROVIDER_PAGINATION_INCOMPLETE');
  for (const project of projects.projects) exact(project, ['projectRef']);
  if (!projects.projects.some((x) => x.projectRef === g0RetryCollectorPolicy.preview.postgresqlProjectRef)) fail('PREVIEW_IDENTITY_DRIFT');
  return Object.freeze({ preview: Object.freeze({ projectRef: g0RetryCollectorPolicy.preview.postgresqlProjectRef, unchanged: true }) });
}

export async function executeBlockedAdapter(config) {
  return runSanitizedAdapterMain(async () => {
    const binding = parseAdapterArguments(process.argv.slice(2), config.provider); let runtime;
    try {
      runtime = createSanitizedProviderRuntime({ expectedProvider: config.provider, expectedInvocationProfile: config.invocationProfile, operations: config.operations });
      await config.probe(runtime);
      const observedAt = runtime.assertObservationWindow();
      await writeSanitizedEnvelope(blockedEnvelope(binding, config.adapterVersion, config.blocker, observedAt));
    } finally { runtime?.close(); }
  });
}
