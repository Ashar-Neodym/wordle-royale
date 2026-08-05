import { canonicalInvocationProfileDocument, hashInvocationProfile } from './g0-invocation-profile.mjs';
import { RAILWAY_ADAPTER, SUPABASE_ADAPTER, VERCEL_ADAPTER } from './g0-readonly-provider-profiles.mjs';

const PROVIDER_PROFILES = Object.freeze({
  vercel: VERCEL_ADAPTER,
  railway: RAILWAY_ADAPTER,
  supabase: SUPABASE_ADAPTER,
});
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };

// Provider is the sole input. Profile identity and operations always come from
// the compiled, reviewed production records; artifact bytes are never accepted
// from a caller.
export function generateProviderBundleProfile(provider) {
  if (arguments.length !== 1 || typeof provider !== 'string') fail('PROVIDER_PROFILE_INPUT_INVALID');
  const adapter = PROVIDER_PROFILES[provider];
  if (!adapter) fail('PROVIDER_UNSUPPORTED');
  const document = canonicalInvocationProfileDocument(adapter.invocationProfile, adapter.operations);
  const bytes = Buffer.from(`${document}\n`, 'utf8');
  return Object.freeze({
    provider,
    invocationProfile: adapter.invocationProfile,
    relativePath: `invocation-profiles/${adapter.invocationProfile}.json`,
    bytes,
    sha256: hashInvocationProfile(adapter.invocationProfile, adapter.operations),
  });
}
