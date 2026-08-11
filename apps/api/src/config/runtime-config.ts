export type RuntimeConfig = Record<string, string | undefined>;
export type AuthRegistrationMode = 'closed' | 'canary' | 'open';
export type ApiSurfaceMode = 'standby' | 'active';
export type ExternalOidcConfig = { issuer: string; audience: string; jwksUrl: string; algorithms: string[] };

const localDatabaseUrl = 'postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public';
const localRedisUrl = 'redis://localhost:6379';

export function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

export function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fail(message: string): never {
  throw new Error(`Invalid API runtime configuration: ${message}`);
}

function requireValue(config: RuntimeConfig, name: string, message: string): string {
  const value = config[name]?.trim();
  if (!value) fail(`${name} is required. ${message}`);
  return value;
}

function appEnv(config: RuntimeConfig): string {
  return config.APP_ENV ?? (config.NODE_ENV === 'production' ? 'production' : 'local');
}

function isProdLike(config: RuntimeConfig): boolean {
  const env = appEnv(config);
  return env === 'preview' || env === 'production';
}

export function apiSurfaceMode(config: RuntimeConfig = process.env): ApiSurfaceMode {
  const value = config.API_SURFACE_MODE?.trim();
  if (value === 'standby' || value === 'active') return value;
  if (!value && !isProdLike(config)) return 'active';
  fail('API_SURFACE_MODE must be explicitly set to standby or active in preview/production.');
}

function strictSeconds(value: string, name: string, minimum: number, maximum: number): number {
  if (!/^[0-9]+$/u.test(value)) fail(`${name} must be a strict integer number of seconds.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail(`${name} must be between ${minimum} and ${maximum} seconds.`);
  return parsed;
}

export function decodeAuthRateLimitKey(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) fail('AUTH_RATE_LIMIT_KEY must be one canonical base64url-encoded 32-byte key.');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) {
    fail('AUTH_RATE_LIMIT_KEY must be one canonical base64url-encoded 32-byte key.');
  }
  return decoded;
}

export function decodeAuthRegistrationCanaryDigest(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) fail('AUTH_REGISTRATION_CANARY_DIGEST must be one canonical base64url-encoded 32-byte digest.');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) {
    fail('AUTH_REGISTRATION_CANARY_DIGEST must be one canonical base64url-encoded 32-byte digest.');
  }
  return decoded;
}

export function authRegistrationMode(value = process.env.AUTH_REGISTRATION_MODE): AuthRegistrationMode {
  return (value || 'closed') as AuthRegistrationMode;
}

function exactHttpsUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.toString() !== value) throw new Error();
    return value;
  } catch {
    fail(`${name} must be one exact absolute HTTPS URL.`);
  }
}

const oidcAlgorithms = new Set(['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA']);

export function externalOidcConfig(config: RuntimeConfig = process.env): ExternalOidcConfig | null {
  const mode = config.EXTERNAL_AUTH_MODE?.trim() || 'disabled';
  if (mode !== 'disabled' && mode !== 'oidc') fail('EXTERNAL_AUTH_MODE must be exactly disabled or oidc.');
  if (mode === 'disabled') return null;
  if (appEnv(config) === 'preview') fail('External authentication is forbidden in preview mode.');
  if (config.DURABLE_AUTH_ENABLED !== 'true' || config.AUTH_MODE !== 'session_required') {
    fail('External OIDC requires durable session authentication.');
  }
  const rawIssuer = config.OIDC_ISSUER;
  if (!rawIssuer?.trim()) fail('OIDC_ISSUER is required. External OIDC requires an exact issuer.');
  const rawJwksUrl = config.OIDC_JWKS_URL;
  if (!rawJwksUrl?.trim()) fail('OIDC_JWKS_URL is required. External OIDC requires an exact JWKS endpoint.');
  const rawAudience = config.OIDC_AUDIENCE;
  if (!rawAudience?.trim()) fail('OIDC_AUDIENCE is required. External OIDC requires one exact audience.');
  const issuer = exactHttpsUrl(rawIssuer, 'OIDC_ISSUER');
  const jwksUrl = exactHttpsUrl(rawJwksUrl, 'OIDC_JWKS_URL');
  const audience = rawAudience;
  if (audience !== audience.trim() || audience.length > 255 || /\s/u.test(audience)) fail('OIDC_AUDIENCE must be one non-whitespace value of at most 255 characters.');
  const algorithms = splitCsv(config.OIDC_ALLOWED_ALGORITHMS ?? 'RS256');
  if (!algorithms.length || new Set(algorithms).size !== algorithms.length || algorithms.some((algorithm) => !oidcAlgorithms.has(algorithm))) {
    fail('OIDC_ALLOWED_ALGORITHMS must contain unique allowlisted asymmetric algorithms.');
  }
  return { issuer, audience, jwksUrl, algorithms };
}

export function trustedProxyHops(value = process.env.TRUSTED_PROXY_HOPS): number {
  if (value == null || !/^(?:0|[1-9][0-9]?)$/u.test(value)) fail('TRUSTED_PROXY_HOPS must be an explicit integer from 0 through 32.');
  const parsed = Number(value);
  if (parsed > 32) fail('TRUSTED_PROXY_HOPS must be an explicit integer from 0 through 32.');
  return parsed;
}

export function validateRuntimeConfig(config: RuntimeConfig): Record<string, string> {
  const resolved: Record<string, string> = {
    NODE_ENV: config.NODE_ENV ?? 'development',
    APP_ENV: appEnv(config),
    API_SURFACE_MODE: apiSurfaceMode(config),
    AUTH_MODE: config.AUTH_MODE ?? (config.NODE_ENV === 'production' ? 'session_required' : 'dev_stub'),
    DURABLE_AUTH_ENABLED: config.DURABLE_AUTH_ENABLED ?? 'false',
    EXTERNAL_AUTH_MODE: config.EXTERNAL_AUTH_MODE ?? 'disabled',
    OIDC_ISSUER: config.OIDC_ISSUER ?? '',
    OIDC_AUDIENCE: config.OIDC_AUDIENCE ?? '',
    OIDC_JWKS_URL: config.OIDC_JWKS_URL ?? '',
    OIDC_ALLOWED_ALGORITHMS: config.OIDC_ALLOWED_ALGORITHMS ?? 'RS256',
    AUTH_RATE_LIMIT_KEY: config.AUTH_RATE_LIMIT_KEY ?? '',
    AUTH_REGISTRATION_MODE: config.AUTH_REGISTRATION_MODE ?? 'closed',
    AUTH_REGISTRATION_CANARY_DIGEST: config.AUTH_REGISTRATION_CANARY_DIGEST ?? '',
    TRUSTED_PROXY_HOPS: config.TRUSTED_PROXY_HOPS ?? '',
    EXPECTED_API_REPLICA_COUNT: config.EXPECTED_API_REPLICA_COUNT ?? '',
    ACCOUNT_SESSION_TTL_SECONDS: config.ACCOUNT_SESSION_TTL_SECONDS ?? '2592000',
    ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: config.ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS ?? '900',
    PREVIEW_DEMO_SESSION_TTL_SECONDS: config.PREVIEW_DEMO_SESSION_TTL_SECONDS ?? '7200',
    ENABLE_DEV_AUTH: config.ENABLE_DEV_AUTH ?? 'true',
    ENABLE_DEV_ROUTES: config.ENABLE_DEV_ROUTES ?? 'true',
    COOKIE_SECURE: config.COOKIE_SECURE ?? '',
    COOKIE_DOMAIN: config.COOKIE_DOMAIN ?? '',
    PORT: config.PORT ?? '3001',
    PUBLIC_WEB_URL: config.PUBLIC_WEB_URL ?? '',
    CORS_ALLOWED_ORIGINS: config.CORS_ALLOWED_ORIGINS ?? '',
    DATABASE_URL: config.DATABASE_URL ?? localDatabaseUrl,
    REDIS_URL: config.REDIS_URL ?? localRedisUrl,
    REDIS_REQUIRED: config.REDIS_REQUIRED ?? 'true',
  };

  const durableAuthEnabled = envFlagEnabled(resolved.DURABLE_AUTH_ENABLED, false);
  if (resolved.API_SURFACE_MODE === 'standby') {
    if (durableAuthEnabled) fail('DURABLE_AUTH_ENABLED must be false in standby mode.');
    if (envFlagEnabled(config.STANDARD_1V1_QUEUE_ENABLED, false)) fail('STANDARD_1V1_QUEUE_ENABLED must be false in standby mode.');
    if (envFlagEnabled(config.SPEED_1V1_QUEUE_ENABLED, false)) fail('SPEED_1V1_QUEUE_ENABLED must be false in standby mode.');
    if (config.PUBLIC_WEB_URL?.trim() || splitCsv(config.CORS_ALLOWED_ORIGINS).length > 0) {
      fail('PUBLIC_WEB_URL and CORS_ALLOWED_ORIGINS must be unset in standby mode.');
    }
    return resolved;
  }
  externalOidcConfig({ ...config, APP_ENV: resolved.APP_ENV, EXTERNAL_AUTH_MODE: resolved.EXTERNAL_AUTH_MODE });
  const sessionTtlSeconds = strictSeconds(resolved.ACCOUNT_SESSION_TTL_SECONDS!, 'ACCOUNT_SESSION_TTL_SECONDS', 3_600, 2_592_000);
  strictSeconds(resolved.ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS!, 'ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS', 300, sessionTtlSeconds);
  if (durableAuthEnabled) {
    if (resolved.AUTH_MODE !== 'session_required') fail('DURABLE_AUTH_ENABLED requires AUTH_MODE=session_required.');
    if (!config.AUTH_RATE_LIMIT_KEY) fail('AUTH_RATE_LIMIT_KEY is required when durable auth is enabled.');
    decodeAuthRateLimitKey(resolved.AUTH_RATE_LIMIT_KEY!);
    if (!['closed', 'canary', 'open'].includes(resolved.AUTH_REGISTRATION_MODE!)) fail('AUTH_REGISTRATION_MODE must be exactly closed, canary, or open.');
    if (resolved.AUTH_REGISTRATION_MODE === 'canary') {
      if (!config.AUTH_REGISTRATION_CANARY_DIGEST) fail('AUTH_REGISTRATION_CANARY_DIGEST is required in canary registration mode.');
      decodeAuthRegistrationCanaryDigest(config.AUTH_REGISTRATION_CANARY_DIGEST);
    } else if (config.AUTH_REGISTRATION_CANARY_DIGEST) {
      fail('AUTH_REGISTRATION_CANARY_DIGEST is only allowed in canary registration mode.');
    }
    try {
      const publicWeb = new URL(requireValue(config, 'PUBLIC_WEB_URL', 'Durable authentication requires one exact HTTPS web origin.'));
      if (publicWeb.protocol !== 'https:' || publicWeb.username || publicWeb.password || publicWeb.pathname !== '/' || publicWeb.search || publicWeb.hash) {
        fail('PUBLIC_WEB_URL must be one exact HTTPS origin when durable auth is enabled.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid API runtime configuration:')) throw error;
      fail('PUBLIC_WEB_URL must be one exact HTTPS origin when durable auth is enabled.');
    }
  }
  if (resolved.APP_ENV === 'preview' && durableAuthEnabled) fail('DURABLE_AUTH_ENABLED is forbidden in preview mode.');

  if (isProdLike(resolved)) {
    resolved.DATABASE_URL = requireValue(config, 'DATABASE_URL', 'Set it to the isolated hosted preview/prod database connection string in provider env; do not rely on local defaults.');
    requireValue(config, 'PUBLIC_WEB_URL', 'Set it to the hosted web origin, for example https://<preview-web-host>.');
    const corsOrigins = splitCsv(config.CORS_ALLOWED_ORIGINS);
    if (corsOrigins.length === 0) fail('CORS_ALLOWED_ORIGINS is required in preview/prod-like mode and must include the hosted web origin.');
    if (corsOrigins.some((origin) => origin === '*' || origin.startsWith('http://'))) {
      fail('CORS_ALLOWED_ORIGINS must not use * or insecure http:// origins in preview/prod-like mode.');
    }
    if (resolved.APP_ENV === 'preview' && resolved.AUTH_MODE !== 'preview_demo_session') {
      fail('APP_ENV=preview requires AUTH_MODE=preview_demo_session for the controlled preview.');
    }
    if (resolved.APP_ENV === 'production' && resolved.AUTH_MODE !== 'session_required') {
      fail('APP_ENV=production requires AUTH_MODE=session_required.');
    }
    if (envFlagEnabled(resolved.ENABLE_DEV_AUTH, true)) fail('ENABLE_DEV_AUTH must be false in preview/prod-like mode.');
    if (envFlagEnabled(resolved.ENABLE_DEV_ROUTES, true)) fail('ENABLE_DEV_ROUTES must be false in preview/prod-like mode.');
    if (!envFlagEnabled(resolved.COOKIE_SECURE, false)) fail('COOKIE_SECURE must be true in preview/prod-like mode.');
    if (resolved.APP_ENV === 'production' && durableAuthEnabled) {
      trustedProxyHops(config.TRUSTED_PROXY_HOPS);
      if (config.EXPECTED_API_REPLICA_COUNT !== '1') fail('EXPECTED_API_REPLICA_COUNT must be exactly 1 for durable-auth activation v1.');
    }
    resolved.REDIS_URL = config.REDIS_URL ?? '';
    resolved.REDIS_REQUIRED = config.REDIS_REQUIRED ?? 'false';
  }

  return resolved;
}

export function allowedCorsOrigins(): string[] {
  return splitCsv(process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_WEB_URL);
}
