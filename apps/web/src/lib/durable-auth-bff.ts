import { resolveApiOriginConfiguration, type ApiOriginEnvironment } from './api-authority.ts';

export const DURABLE_COOKIE_NAMES = ['__Host-wr_session', 'wr_session'] as const;
type DurableCookieName = typeof DURABLE_COOKIE_NAMES[number];

export type DurableAuthEnvironment = ApiOriginEnvironment & Readonly<{
  PUBLIC_WEB_URL?: string;
  DURABLE_AUTH_ENABLED?: string;
}>;

export type DurableAuthConfiguration = Readonly<{
  status: 'available' | 'unavailable';
  apiOrigin: string | null;
  webOrigin: string | null;
  reason: string | null;
}>;

export type CookieValue = Readonly<{ name: string; value: string }>;
export type DurableCookie = Readonly<{
  name: DurableCookieName;
  value: string;
  secure: boolean;
  maxAge?: number;
  expires?: Date;
}>;

export type CookieStoreOptions = Readonly<{
  name: DurableCookieName;
  value: string;
  path: '/';
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  expires: Date;
}>;

export type DurableAuthOperation = 'register' | 'login' | 'logout' | 'me';
export type DurableAuthResult =
  | Readonly<{ status: 'success'; code: 'authenticated' | 'signed_out'; message: string; cookie?: DurableCookie; user?: SafeAccountUser }>
  | Readonly<{ status: 'signed_out'; code: 'not_authenticated'; message: string }>
  | Readonly<{ status: 'rejected'; code: string; message: string }>
  | Readonly<{ status: 'unavailable'; code: string; message: string }>;

export type SafeAccountUser = Readonly<{
  email: string | null;
  handle: string | null;
  displayName: string | null;
}>;

const genericUnavailable = 'Account service is temporarily unavailable.';

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

function exactWebOrigin(raw: string | undefined, nodeEnvironment: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    const secureEnough = parsed.protocol === 'https:' || (nodeEnvironment !== 'production' && parsed.protocol === 'http:');
    if (!secureEnough || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveDurableAuthConfiguration(environment: DurableAuthEnvironment = process.env): DurableAuthConfiguration {
  const authority = resolveApiOriginConfiguration(environment);
  const webOrigin = exactWebOrigin(environment.PUBLIC_WEB_URL, environment.NODE_ENV);
  if (!flag(environment.DURABLE_AUTH_ENABLED)) {
    return { status: 'unavailable', apiOrigin: authority.origin, webOrigin, reason: 'Durable accounts are not enabled for this deployment.' };
  }
  if (authority.status !== 'configured' || !authority.origin) {
    return { status: 'unavailable', apiOrigin: null, webOrigin, reason: authority.reason ?? 'No authoritative account service is configured.' };
  }
  if (!webOrigin) {
    return { status: 'unavailable', apiOrigin: authority.origin, webOrigin: null, reason: 'No exact web origin is configured for account requests.' };
  }
  return { status: 'available', apiOrigin: authority.origin, webOrigin, reason: null };
}

export function durableCookiePolicy(environment: Pick<DurableAuthEnvironment, 'NODE_ENV'> = process.env): Readonly<{
  name: DurableCookieName;
  secure: boolean;
}> {
  return environment.NODE_ENV === 'production'
    ? { name: '__Host-wr_session', secure: true }
    : { name: 'wr_session', secure: false };
}

export function durableCookieClearOptions(
  environment: Pick<DurableAuthEnvironment, 'NODE_ENV'> = process.env,
): CookieStoreOptions {
  const policy = durableCookiePolicy(environment);
  return {
    name: policy.name,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: policy.secure,
    maxAge: 0,
    expires: new Date(0),
  };
}

export function shouldClearDurableCookie(operation: DurableAuthOperation, result: DurableAuthResult): boolean {
  return operation === 'logout' && result.status === 'success' && result.code === 'signed_out';
}

export function serializeDurableCookieHeader(
  values: readonly CookieValue[],
  environment: Pick<DurableAuthEnvironment, 'NODE_ENV'> = process.env,
): string | undefined {
  const policy = durableCookiePolicy(environment);
  const selected = values.filter((cookie): cookie is CookieValue & { name: DurableCookieName } =>
    DURABLE_COOKIE_NAMES.includes(cookie.name as DurableCookieName)
    && cookie.value.length > 0
    && !/[;\r\n]/u.test(cookie.value));
  if (selected.length !== 1 || selected[0]!.name !== policy.name) return undefined;
  return `${selected[0]!.name}=${selected[0]!.value}`;
}

export type InboundCookieInspection =
  | Readonly<{ status: 'accepted'; cookies: readonly CookieValue[] }>
  | Readonly<{ status: 'rejected'; reason: 'ambiguous_durable_cookie' | 'preview_cookie_present' | 'runtime_cookie_mismatch' }>;

/** Parse the raw header so duplicate names cannot be hidden by cookies().get(). */
export function inspectInboundCookieHeader(
  rawCookieHeader: string | null,
  environment: Pick<DurableAuthEnvironment, 'NODE_ENV'> = process.env,
): InboundCookieInspection {
  if (!rawCookieHeader) return { status: 'accepted', cookies: [] };
  const durable: CookieValue[] = [];
  for (const rawPart of rawCookieHeader.split(';')) {
    const separator = rawPart.indexOf('=');
    if (separator < 1) continue;
    const name = rawPart.slice(0, separator).trim();
    const value = rawPart.slice(separator + 1).trim();
    if (name === 'wr_preview_demo_session') return { status: 'rejected', reason: 'preview_cookie_present' };
    if (DURABLE_COOKIE_NAMES.includes(name as DurableCookieName)) durable.push({ name, value });
  }
  if (durable.length > 1) return { status: 'rejected', reason: 'ambiguous_durable_cookie' };
  if (durable.length === 1) {
    const policy = durableCookiePolicy(environment);
    const cookie = durable[0]!;
    if (cookie.name !== policy.name || !cookie.value || /[;,\r\n\s]/u.test(cookie.value)) {
      return { status: 'rejected', reason: 'runtime_cookie_mismatch' };
    }
  }
  return { status: 'accepted', cookies: durable };
}

function splitSetCookie(value: string): { pair: string; attributes: Map<string, string | true> } | null {
  const parts = value.split(';').map((part) => part.trim());
  const pair = parts.shift();
  if (!pair) return null;
  const attributes = new Map<string, string | true>();
  for (const part of parts) {
    const index = part.indexOf('=');
    const name = (index < 0 ? part : part.slice(0, index)).trim().toLowerCase();
    const attributeValue = index < 0 ? true : part.slice(index + 1).trim();
    if (!name || attributes.has(name)) return null;
    attributes.set(name, attributeValue);
  }
  return { pair, attributes };
}

export function parseDurableSetCookie(
  setCookie: string | null,
  environment: Pick<DurableAuthEnvironment, 'NODE_ENV'> = process.env,
): DurableCookie | null {
  if (!setCookie || /[\r\n]/u.test(setCookie)) return null;
  const parsed = splitSetCookie(setCookie);
  if (!parsed) return null;
  const separator = parsed.pair.indexOf('=');
  if (separator <= 0) return null;
  const name = parsed.pair.slice(0, separator) as DurableCookieName;
  const value = parsed.pair.slice(separator + 1);
  if (!DURABLE_COOKIE_NAMES.includes(name) || !value || /[,;\s]/u.test(value)) return null;
  const { attributes } = parsed;
  const secure = attributes.get('secure') === true;
  const policy = durableCookiePolicy(environment);
  if (attributes.get('httponly') !== true
    || attributes.get('path') !== '/'
    || String(attributes.get('samesite')).toLowerCase() !== 'lax'
    || attributes.has('domain')
    || name !== policy.name
    || secure !== policy.secure) return null;

  const rawMaxAge = attributes.get('max-age');
  let maxAge: number | undefined;
  if (rawMaxAge !== undefined) {
    if (typeof rawMaxAge !== 'string' || !/^\d{1,8}$/u.test(rawMaxAge)) return null;
    maxAge = Number(rawMaxAge);
  }
  const rawExpires = attributes.get('expires');
  let expires: Date | undefined;
  if (typeof rawExpires === 'string') {
    expires = new Date(rawExpires);
    if (Number.isNaN(expires.getTime())) return null;
  }
  return { name, value, secure, ...(maxAge === undefined ? {} : { maxAge }), ...(expires ? { expires } : {}) };
}

function safeError(status: number, payload: unknown): DurableAuthResult {
  const upstreamCode = typeof payload === 'object' && payload !== null
    && 'error' in payload && typeof payload.error === 'object' && payload.error !== null
    && 'code' in payload.error && typeof payload.error.code === 'string' ? payload.error.code : null;
  if (status === 401) {
    if (upstreamCode === 'not_authenticated') return { status: 'signed_out', code: 'not_authenticated', message: 'Sign in to continue.' };
    return { status: 'rejected', code: 'invalid_credentials', message: 'Email or password is incorrect.' };
  }
  if (status === 400) return { status: 'rejected', code: 'invalid_request', message: 'Check the highlighted account details and try again.' };
  if (status === 409) return { status: 'rejected', code: 'account_conflict', message: 'That email or handle cannot be used.' };
  if (status === 429) return { status: 'rejected', code: 'rate_limited', message: 'Too many attempts. Wait a moment and try again.' };
  return { status: 'unavailable', code: 'auth_upstream_unavailable', message: genericUnavailable };
}

function hasTokenField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasTokenField);
  return Object.entries(value).some(([key, nested]) => /^(?:accessToken|refreshToken|token)$/iu.test(key) || hasTokenField(nested));
}

function safeUser(payload: unknown, operation: DurableAuthOperation): SafeAccountUser | undefined {
  if (!payload || typeof payload !== 'object' || !('data' in payload) || !payload.data || typeof payload.data !== 'object') return undefined;
  const data = payload.data as Record<string, unknown>;
  const raw = data.user && typeof data.user === 'object' ? data.user : data;
  const user = raw as Record<string, unknown>;
  if (typeof user.id !== 'string') return undefined;
  if (operation !== 'me' && (!data.session || typeof data.session !== 'object')) return undefined;
  const profile = user.profile && typeof user.profile === 'object' ? user.profile as Record<string, unknown> : {};
  return {
    email: typeof user.email === 'string' ? user.email : null,
    handle: typeof profile.handle === 'string' ? profile.handle : null,
    displayName: typeof profile.displayName === 'string' ? profile.displayName : null,
  };
}

export async function durableAuthRequest(input: Readonly<{
  operation: DurableAuthOperation;
  body?: Record<string, unknown>;
  cookies?: readonly CookieValue[];
  environment?: DurableAuthEnvironment;
  fetchImpl?: typeof fetch;
}>): Promise<DurableAuthResult> {
  const runtimeEnvironment = input.environment ?? process.env;
  const configuration = resolveDurableAuthConfiguration(runtimeEnvironment);
  if (configuration.status !== 'available' || !configuration.apiOrigin || !configuration.webOrigin) {
    return { status: 'unavailable', code: 'auth_not_configured', message: 'Durable accounts are not available in this deployment.' };
  }
  const path = input.operation === 'me' ? '/auth/me' : `/auth/${input.operation}`;
  const method = input.operation === 'me' ? 'GET' : 'POST';
  const cookie = serializeDurableCookieHeader(input.cookies ?? [], runtimeEnvironment);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await (input.fetchImpl ?? fetch)(`${configuration.apiOrigin}${path}`, {
      method,
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(method === 'POST' ? { 'content-type': 'application/json', origin: configuration.webOrigin } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(input.body ?? {}) } : {}),
    });
    if (response.status >= 300 && response.status < 400) {
      return { status: 'unavailable', code: 'auth_redirect_rejected', message: genericUnavailable };
    }
    let responseOrigin: string | null = null;
    try { responseOrigin = response.url ? new URL(response.url).origin : null; } catch { /* rejected below */ }
    if (responseOrigin !== configuration.apiOrigin) {
      return { status: 'unavailable', code: 'auth_authority_mismatch', message: genericUnavailable };
    }
    if (input.operation === 'logout' && response.status === 204) {
      return { status: 'success', code: 'signed_out', message: 'You are signed out.' };
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { return { status: 'unavailable', code: 'auth_response_malformed', message: genericUnavailable }; }
    if (!response.ok) return safeError(response.status, payload);
    if (hasTokenField(payload)) return { status: 'unavailable', code: 'auth_token_response_rejected', message: genericUnavailable };
    const user = safeUser(payload, input.operation);
    if (!user) return { status: 'unavailable', code: 'auth_response_malformed', message: genericUnavailable };
    if (input.operation === 'me') return { status: 'success', code: 'authenticated', message: 'Signed in.', user };
    const sessionCookie = parseDurableSetCookie(response.headers.get('set-cookie'), runtimeEnvironment);
    if (!sessionCookie) return { status: 'unavailable', code: 'auth_cookie_rejected', message: genericUnavailable };
    return { status: 'success', code: 'authenticated', message: input.operation === 'register' ? 'Account created.' : 'Welcome back.', cookie: sessionCookie, user };
  } catch {
    return { status: 'unavailable', code: 'auth_transport_unavailable', message: genericUnavailable };
  } finally {
    clearTimeout(timeout);
  }
}

type HeaderReader = Readonly<{ get(name: string): string | null }>;

export function validateDurableActionRequestHeaders(
  requestHeaders: HeaderReader,
  environment: DurableAuthEnvironment = process.env,
): boolean {
  const configuration = resolveDurableAuthConfiguration(environment);
  if (configuration.status !== 'available' || !configuration.webOrigin) return false;
  const origin = requestHeaders.get('origin');
  const host = requestHeaders.get('host');
  const forwardedHost = requestHeaders.get('x-forwarded-host');
  const expectedHost = new URL(configuration.webOrigin).host.toLowerCase();
  if (origin !== configuration.webOrigin
    || !host
    || host.includes(',')
    || host.trim().toLowerCase() !== expectedHost) return false;
  if (forwardedHost !== null
    && (forwardedHost.includes(',') || forwardedHost.trim().toLowerCase() !== expectedHost)) return false;
  return true;
}

/** Server-action entrypoint: all request metadata is rejected before fetch is reachable. */
export async function durableAuthActionRequest(input: Readonly<{
  operation: Exclude<DurableAuthOperation, 'me'>;
  body?: Record<string, unknown>;
  requestHeaders: HeaderReader;
  environment?: DurableAuthEnvironment;
  fetchImpl?: typeof fetch;
}>): Promise<DurableAuthResult> {
  const environment = input.environment ?? process.env;
  if (!validateDurableActionRequestHeaders(input.requestHeaders, environment)) {
    return { status: 'rejected', code: 'auth_request_rejected', message: 'The account request could not be verified.' };
  }
  const inspected = inspectInboundCookieHeader(input.requestHeaders.get('cookie'), environment);
  if (inspected.status === 'rejected') {
    return { status: 'rejected', code: 'auth_cookie_rejected', message: 'The account session cookie could not be verified.' };
  }
  return durableAuthRequest({
    operation: input.operation,
    cookies: inspected.cookies,
    environment,
    ...(input.body ? { body: input.body } : {}),
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  });
}
