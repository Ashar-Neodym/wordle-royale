const hex = (character) => character.repeat(64);
const sourceSha = (character) => character.repeat(40);

function variables(prefix) {
  return [
    { name: `${prefix}_EMPTY`, value: '' },
    { name: `${prefix}_SET`, value: 'fixture-present-value' },
    { name: `${prefix}_MASKED`, masked: true },
  ];
}

function artifact(env, provider) {
  const preview = env === 'preview';
  const chars = provider === 'vercel'
    ? (preview ? ['1', '2', '3'] : ['4', '5', '6'])
    : (preview ? ['7', '8', '9'] : ['a', 'b', 'c']);
  return {
    sourceGitSha: sourceSha(preview ? 'd' : 'e'),
    artifactDigest: `sha256:${hex(chars[0])}`,
    artifactDigestDerivation: `${provider} deployment image digest observed through mocked read-only API`,
    manifest: provider === 'vercel'
      ? { mode: 'digest', digest: `sha256:${hex(chars[1])}`, derivation: 'canonical build and runtime manifest bytes', subjectArtifactDigest: `sha256:${hex(chars[0])}` }
      : {
          mode: 'provider-managed-attestation',
          provider,
          attestationId: `attestation-${env}-${provider}`,
          statementDigest: `sha256:${hex(chars[2])}`,
          subjectArtifactDigest: `sha256:${hex(chars[0])}`,
        },
  };
}

export function validProviderSnapshot() {
  const trackedVariables = Object.fromEntries(['vercel', 'railway', 'postgresql'].map((provider) => {
    const prefix = provider === 'postgresql' ? 'PG' : provider.toUpperCase();
    return [provider, [`${prefix}_ABSENT`, `${prefix}_EMPTY`, `${prefix}_SET`, `${prefix}_MASKED`]];
  }));
  const requiredVariables = Object.fromEntries(Object.entries(trackedVariables).map(([provider, names]) => [provider, names.filter((name) => name.endsWith('_SET'))]));
  const providers = { vercel: {}, railway: {}, postgresql: {} };
  for (const env of ['preview', 'production']) {
    const short = env === 'preview' ? 'pre' : 'prod';
    providers.vercel[env] = {
      identity: { projectId: `vercel-project-${short}`, environmentId: `vercel-environment-${short}`, deploymentId: `vercel-deployment-${short}` },
      artifact: artifact(env, 'vercel'),
      variables: variables('VERCEL'),
    };
    providers.railway[env] = {
      identity: { projectId: `railway-project-${short}`, environmentId: `railway-environment-${short}`, serviceId: `railway-service-${short}`, deploymentId: `railway-deployment-${short}` },
      artifact: artifact(env, 'railway'),
      variables: variables('RAILWAY'),
    };
    providers.postgresql[env] = {
      identity: { projectId: `postgres-project-${short}`, environmentId: `postgres-environment-${short}`, serviceId: `postgres-service-${short}`, deploymentId: `postgres-deployment-${short}` },
      variables: variables('PG'),
      observations: ['primary', 'replica'].map((role) => ({
        replicaId: `postgres-${short}-${role}`,
        clusterId: `postgres-cluster-${short}`,
        databaseId: `postgres-database-${short}`,
        schemaDigest: `sha256:${hex(env === 'preview' ? 'f' : '0')}`,
      })),
    };
  }
  return {
    schemaVersion: 'wordle-provider-snapshot/v1',
    collectedAt: '2026-07-29T12:00:00.000Z',
    trackedVariables,
    requiredVariables,
    providers,
  };
}
