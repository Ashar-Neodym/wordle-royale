export type RuntimeConfig = Record<string, string | undefined>;

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

export function validateRuntimeConfig(config: RuntimeConfig): Record<string, string> {
  const resolved: Record<string, string> = {
    NODE_ENV: config.NODE_ENV ?? 'development',
    APP_ENV: appEnv(config),
    AUTH_MODE: config.AUTH_MODE ?? (config.NODE_ENV === 'production' ? 'session_required' : 'dev_stub'),
    DURABLE_AUTH_ENABLED: config.DURABLE_AUTH_ENABLED ?? 'false',
    AUTH_RATE_LIMIT_KEY: config.AUTH_RATE_LIMIT_KEY ?? '',
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
  const sessionTtlSeconds = strictSeconds(resolved.ACCOUNT_SESSION_TTL_SECONDS!, 'ACCOUNT_SESSION_TTL_SECONDS', 3_600, 2_592_000);
  strictSeconds(resolved.ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS!, 'ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS', 300, sessionTtlSeconds);
  if (durableAuthEnabled) {
    if (resolved.AUTH_MODE !== 'session_required') fail('DURABLE_AUTH_ENABLED requires AUTH_MODE=session_required.');
    if (!config.AUTH_RATE_LIMIT_KEY) fail('AUTH_RATE_LIMIT_KEY is required when durable auth is enabled.');
    decodeAuthRateLimitKey(config.AUTH_RATE_LIMIT_KEY);
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
    resolved.REDIS_URL = config.REDIS_URL ?? '';
    resolved.REDIS_REQUIRED = config.REDIS_REQUIRED ?? 'false';
  }

  return resolved;
}

export function allowedCorsOrigins(): string[] {
  return splitCsv(process.env.CORS_ALLOWED_ORIGINS ?? process.env.PUBLIC_WEB_URL);
}
