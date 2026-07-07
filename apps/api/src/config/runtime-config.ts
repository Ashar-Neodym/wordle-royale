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

export function validateRuntimeConfig(config: RuntimeConfig): Record<string, string> {
  const resolved: Record<string, string> = {
    NODE_ENV: config.NODE_ENV ?? 'development',
    APP_ENV: appEnv(config),
    AUTH_MODE: config.AUTH_MODE ?? (config.NODE_ENV === 'production' ? 'session_required' : 'dev_stub'),
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
