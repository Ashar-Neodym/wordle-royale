import { createPrivateKey, sign } from 'node:crypto';
import { canonicalJson } from './provider-provenance-core.mjs';

const hex = (character) => character.repeat(64);
const sourceSha = (character) => character.repeat(40);
const ADAPTERS = { vercel: 'vercel-native-mock/v1', railway: 'railway-native-mock/v1', postgresql: 'postgresql-native-mock/v1' };
// Deterministic, non-secret test seeds. Production adapters pin provider public keys instead.
const MOCK_SEEDS = { vercel: '11', railway: '22', postgresql: '33' };
function privateKey(provider) {
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(MOCK_SEEDS[provider].repeat(32), 'hex')]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}
function variables(prefix) { return [{ name: `${prefix}_EMPTY`, value: '' }, { name: `${prefix}_SET`, value: 'fixture-present-value' }, { name: `${prefix}_MASKED`, masked: true }]; }
function artifact(env, provider, deploymentId) {
  const preview = env === 'preview';
  const chars = provider === 'vercel' ? (preview ? ['1', '2', '3'] : ['4', '5', '6']) : (preview ? ['7', '8', '9'] : ['a', 'b', 'c']);
  return {
    deploymentId,
    sourceGitSha: sourceSha(preview ? 'd' : 'e'),
    artifactDigest: `sha256:${hex(chars[0])}`,
    artifactDigestDerivation: `${provider} deployment image digest observed through mocked native read-only API`,
    manifest: provider === 'vercel'
      ? { mode: 'digest', digest: `sha256:${hex(chars[1])}`, derivation: 'canonical build and runtime manifest bytes', subjectArtifactDigest: `sha256:${hex(chars[0])}`, subjectDeploymentId: deploymentId }
      : { mode: 'provider-managed-attestation', provider, attestationId: `attestation-${env}-${provider}`, statementDigest: `sha256:${hex(chars[2])}`, subjectArtifactDigest: `sha256:${hex(chars[0])}`, subjectDeploymentId: deploymentId },
  };
}
function signedEnvelope(provider, collectedAt, nonce, payload) {
  const unsigned = { adapter: ADAPTERS[provider], collectedAt, nonce, payload };
  return { ...unsigned, signature: `ed25519:${sign(null, Buffer.from(canonicalJson(unsigned)), privateKey(provider)).toString('base64')}` };
}
export function resignNativeEvidence(snapshot, provider, env) {
  const envelope = snapshot.providers[provider][env];
  snapshot.providers[provider][env] = signedEnvelope(provider, envelope.collectedAt, envelope.nonce, envelope.payload);
  return snapshot;
}
export function expectedIdentities(snapshot) {
  return Object.fromEntries(['preview', 'production'].map((env) => [env, Object.fromEntries(['vercel', 'railway', 'postgresql'].map((provider) => [provider, structuredClone(snapshot.providers[provider][env].payload.identity)]))]));
}
export function collectionConstraints(snapshot, overrides = {}) {
  return { now: Date.parse(snapshot.collectedAt), expectedNonce: snapshot.nonce, expectedIdentities: expectedIdentities(snapshot), ...overrides };
}
export function validProviderSnapshot({ collectedAt = new Date().toISOString(), nonce = 'ticket262-challenge-nonce' } = {}) {
  const trackedVariables = Object.fromEntries(['vercel', 'railway', 'postgresql'].map((provider) => { const prefix = provider === 'postgresql' ? 'PG' : provider.toUpperCase(); return [provider, [`${prefix}_ABSENT`, `${prefix}_EMPTY`, `${prefix}_SET`, `${prefix}_MASKED`]]; }));
  const requiredVariables = Object.fromEntries(Object.entries(trackedVariables).map(([provider, names]) => [provider, names.filter((name) => name.endsWith('_SET'))]));
  const providers = { vercel: {}, railway: {}, postgresql: {} };
  for (const env of ['preview', 'production']) {
    const short = env === 'preview' ? 'pre' : 'prod';
    const vercelDeployment = `vercel-deployment-${short}`;
    const railwayDeployment = `railway-deployment-${short}`;
    const payloads = {
      vercel: { identity: { projectId: `vercel-project-${short}`, environmentId: `vercel-environment-${short}`, deploymentId: vercelDeployment }, artifact: artifact(env, 'vercel', vercelDeployment), variables: variables('VERCEL') },
      railway: { identity: { projectId: `railway-project-${short}`, environmentId: `railway-environment-${short}`, serviceId: `railway-service-${short}`, deploymentId: railwayDeployment }, artifact: artifact(env, 'railway', railwayDeployment), variables: variables('RAILWAY') },
      postgresql: { identity: { projectId: `postgres-project-${short}`, environmentId: `postgres-environment-${short}`, serviceId: `postgres-service-${short}`, deploymentId: `postgres-deployment-${short}` }, variables: variables('PG'), observations: ['primary', 'replica'].map((role) => ({ replicaId: `postgres-${short}-${role}`, clusterId: `postgres-cluster-${short}`, databaseId: `postgres-database-${short}`, schemaDigest: `sha256:${hex(env === 'preview' ? 'f' : '0')}` })) },
    };
    for (const provider of ['vercel', 'railway', 'postgresql']) providers[provider][env] = signedEnvelope(provider, collectedAt, nonce, payloads[provider]);
  }
  return { schemaVersion: 'wordle-provider-native-evidence/v1', collectedAt, nonce, trackedVariables, requiredVariables, providers };
}
