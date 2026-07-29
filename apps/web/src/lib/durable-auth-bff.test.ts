import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  durableAuthActionRequest,
  durableAuthRequest,
  durableCookieClearOptions,
  inspectInboundCookieHeader,
  parseDurableSetCookie,
  resolveDurableAuthConfiguration,
  serializeDurableCookieHeader,
  shouldClearDurableCookie,
} from './durable-auth-bff.ts';

const API = 'https://api.example.test';
const WEB = 'https://play.example.test';

function response(body: unknown, options: { status?: number; url?: string; setCookie?: string } = {}): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.setCookie) headers.set('set-cookie', options.setCookie);
  const value = new Response(JSON.stringify(body), { status: options.status ?? 200, headers });
  Object.defineProperty(value, 'url', { value: options.url ?? `${API}/auth/login`, configurable: true });
  return value;
}

const enabledEnvironment = {
  NODE_ENV: 'production',
  API_BASE_URL: API,
  PUBLIC_WEB_URL: WEB,
  DURABLE_AUTH_ENABLED: 'true',
};

describe('durable auth web BFF boundary', () => {
  it('fails closed unless durable auth, a pinned API authority, and one exact web origin are configured', () => {
    assert.equal(resolveDurableAuthConfiguration(enabledEnvironment).status, 'available');
    assert.equal(resolveDurableAuthConfiguration({ ...enabledEnvironment, DURABLE_AUTH_ENABLED: 'false' }).status, 'unavailable');
    assert.equal(resolveDurableAuthConfiguration({ ...enabledEnvironment, API_BASE_URL: `${API}/v1` }).status, 'unavailable');
    assert.equal(resolveDurableAuthConfiguration({ ...enabledEnvironment, PUBLIC_WEB_URL: `${WEB}/account` }).status, 'unavailable');
    assert.equal(resolveDurableAuthConfiguration({ ...enabledEnvironment, NEXT_PUBLIC_API_URL: 'https://other.example.test' }).status, 'unavailable');
    assert.equal(resolveDurableAuthConfiguration({ ...enabledEnvironment, API_BASE_URL: 'http://api.example.test' }).status, 'unavailable');
  });

  it('forwards only the allowlisted durable session cookie', () => {
    assert.equal(serializeDurableCookieHeader([
      { name: 'analytics', value: 'secret-ish' },
      { name: 'wr_session', value: 'durable-token' },
      { name: 'preview_demo_session', value: 'preview-token' },
    ], { NODE_ENV: 'development' }), 'wr_session=durable-token');
    assert.equal(serializeDurableCookieHeader([
      { name: 'wr_session', value: 'one' },
      { name: '__Host-wr_session', value: 'two' },
    ], { NODE_ENV: 'production' }), undefined, 'ambiguous durable cookies fail closed');
  });

  it('accepts only a strict allowlisted HttpOnly host cookie', () => {
    assert.deepEqual(parseDurableSetCookie('__Host-wr_session=raw-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600', { NODE_ENV: 'production' }), {
      name: '__Host-wr_session', value: 'raw-token', secure: true, maxAge: 3600,
    });
    assert.equal(parseDurableSetCookie('other=raw-token; Path=/; HttpOnly; Secure; SameSite=Lax', { NODE_ENV: 'production' }), null);
    assert.equal(parseDurableSetCookie('__Host-wr_session=raw-token; Path=/; Secure; SameSite=Lax', { NODE_ENV: 'production' }), null);
    assert.equal(parseDurableSetCookie('__Host-wr_session=raw-token; Path=/; HttpOnly; SameSite=Lax', { NODE_ENV: 'production' }), null);
    assert.equal(parseDurableSetCookie('wr_session=raw-token; Path=/; HttpOnly; SameSite=Lax', { NODE_ENV: 'production' }), null,
      'production never installs the insecure/local cookie');
  });

  it('uses runtime-specific exact cookie deletion attributes', () => {
    assert.deepEqual(durableCookieClearOptions({ NODE_ENV: 'production' }), {
      name: '__Host-wr_session', value: '', path: '/', httpOnly: true, sameSite: 'lax', secure: true,
      maxAge: 0, expires: new Date(0),
    });
    assert.deepEqual(durableCookieClearOptions({ NODE_ENV: 'development' }), {
      name: 'wr_session', value: '', path: '/', httpOnly: true, sameSite: 'lax', secure: false,
      maxAge: 0, expires: new Date(0),
    });
    assert.equal(shouldClearDurableCookie('logout', { status: 'success', code: 'signed_out', message: 'signed out' }), true);
    assert.equal(shouldClearDurableCookie('logout', { status: 'rejected', code: 'unsafe_request_origin', message: 'rejected' }), false);
    assert.equal(shouldClearDurableCookie('logout', { status: 'unavailable', code: 'auth_transport_unavailable', message: 'unavailable' }), false);
    assert.equal(shouldClearDurableCookie('login', { status: 'success', code: 'authenticated', message: 'signed in' }), false);
  });

  it('rejects duplicate/coexisting durable cookies and the actual preview cookie', () => {
    assert.equal(inspectInboundCookieHeader('__Host-wr_session=one; __Host-wr_session=two', enabledEnvironment).status, 'rejected');
    assert.equal(inspectInboundCookieHeader('__Host-wr_session=one; wr_session=two', enabledEnvironment).status, 'rejected');
    assert.equal(inspectInboundCookieHeader('__Host-wr_session=one; wr_preview_demo_session=preview', enabledEnvironment).status, 'rejected');
    assert.deepEqual(inspectInboundCookieHeader('analytics=x; __Host-wr_session=one', enabledEnvironment), {
      status: 'accepted', cookies: [{ name: '__Host-wr_session', value: 'one' }],
    });
  });

  it('rejects missing/forged/ambiguous action authority and bad cookies before fetch', async () => {
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = async () => { fetchCalls += 1; throw new Error('must not fetch'); };
    const cases = [
      new Headers({ host: 'play.example.test' }),
      new Headers({ origin: 'https://evil.example.test', host: 'play.example.test' }),
      new Headers({ origin: WEB, host: 'play.example.test', 'x-forwarded-host': 'evil.example.test' }),
      new Headers({ origin: WEB, host: 'play.example.test', cookie: '__Host-wr_session=one; __Host-wr_session=two' }),
      new Headers({ origin: WEB, host: 'play.example.test', cookie: 'wr_preview_demo_session=preview' }),
    ];
    for (const requestHeaders of cases) {
      const result = await durableAuthActionRequest({ operation: 'login', requestHeaders, environment: enabledEnvironment, fetchImpl });
      assert.equal(result.status, 'rejected');
    }
    assert.equal(fetchCalls, 0);
  });

  it('pins the authority, uses a manual redirect policy and exact Origin, and rejects redirects/cross-origin responses', async () => {
    const calls: Array<{ input: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ input: String(input), init: init ?? {} });
      return response({ data: { user: { id: 'safe' }, session: { id: 'session' } }, error: null }, {
        setCookie: '__Host-wr_session=raw-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600',
      });
    };
    const result = await durableAuthRequest({ operation: 'login', body: { email: 'player@example.test', password: 'long password' }, environment: enabledEnvironment, fetchImpl });
    assert.equal(result.status, 'success');
    assert.ok(result.cookie, 'cookie is returned only on the server boundary');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, `${API}/auth/login`);
    assert.equal(calls[0]?.init.redirect, 'manual');
    assert.equal(new Headers(calls[0]?.init.headers).get('origin'), WEB);

    const redirected = await durableAuthRequest({ operation: 'login', body: {}, environment: enabledEnvironment, fetchImpl: async () => response({}, { status: 307 }) });
    assert.deepEqual(redirected, { status: 'unavailable', code: 'auth_redirect_rejected', message: 'Account service is temporarily unavailable.' });
    const crossed = await durableAuthRequest({ operation: 'login', body: {}, environment: enabledEnvironment, fetchImpl: async () => response({}, { url: 'https://other.example.test/auth/login' }) });
    assert.deepEqual(crossed, { status: 'unavailable', code: 'auth_authority_mismatch', message: 'Account service is temporarily unavailable.' });
  });

  it('does not reflect upstream payloads, credentials, or tokens in its safe error result', async () => {
    const result = await durableAuthRequest({
      operation: 'register',
      body: { email: 'private@example.test', password: 'very-private-password' },
      environment: enabledEnvironment,
      fetchImpl: async () => response({ error: { code: 'debug', message: 'raw-token very-private-password' } }, { status: 500 }),
    });
    assert.deepEqual(result, { status: 'unavailable', code: 'auth_upstream_unavailable', message: 'Account service is temporarily unavailable.' });
    assert.doesNotMatch(JSON.stringify(result), /raw-token|very-private-password|private@example/);
  });
});
