const presentationKeys = Object.freeze({
  web: 'WORDLE_WEB_ENV',
  account: 'WORDLE_ACCOUNT_MODE',
  registration: 'WORDLE_REGISTRATION_MODE',
});
const durableGateKey = ['DURABLE', 'AUTH', 'ENABLED'].join('_');

/**
 * Resolve the public, non-secret presentation snapshot embedded by Next.
 * The legacy durable gate is read only to preserve the existing preview
 * deployment and to reject contradictions; it is never emitted.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @returns {Record<string, string>}
 */
export function resolveBuildPresentationEnvironment(environment) {
  const web = environment[presentationKeys.web];
  const account = environment[presentationKeys.account];
  const registration = environment[presentationKeys.registration];
  const gate = environment[durableGateKey];
  const aliasesAbsent = web === undefined && account === undefined && registration === undefined;

  if (aliasesAbsent && gate === 'false') {
    return {
      [presentationKeys.web]: 'preview',
      [presentationKeys.account]: 'preview_demo',
    };
  }
  if (web === undefined || account === undefined) {
    throw new Error('WORDLE_WEB_ENV and WORDLE_ACCOUNT_MODE must both be explicitly configured.');
  }

  const preview = web === 'preview' && account === 'preview_demo'
    && registration === undefined && gate === 'false';
  const dormant = web === 'production' && account === 'disabled'
    && registration === undefined && gate === 'false';
  const durable = web === 'production' && account === 'durable'
    && ['closed', 'canary', 'open'].includes(registration ?? '') && gate === 'true';
  if (!preview && !dormant && !durable) {
    throw new Error('Contradictory Wordle account presentation and durable server gate configuration.');
  }

  return {
    [presentationKeys.web]: web,
    [presentationKeys.account]: account,
    ...(registration === undefined ? {} : { [presentationKeys.registration]: registration }),
  };
}

const presentationEnvironment = resolveBuildPresentationEnvironment(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Only neutral, non-secret UI presentation values cross the build boundary.
  // API/web authorities and the durable runtime gate remain server process env.
  env: presentationEnvironment,
};

export default nextConfig;
