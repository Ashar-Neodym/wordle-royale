'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  durableAuthActionRequest,
  durableCookieClearOptions,
  shouldClearDurableCookie,
  type DurableAuthOperation,
  type DurableAuthResult,
} from '../../lib/durable-auth-bff';

function text(formData: FormData, key: string, trim = true): string {
  const value = formData.get(key);
  if (typeof value !== 'string') return '';
  return trim ? value.trim() : value;
}

function resultCode(result: DurableAuthResult): string {
  return result.code;
}

async function run(operation: Exclude<DurableAuthOperation, 'me'>, body: Record<string, unknown>): Promise<never> {
  // headers() exposes the uncollapsed Cookie header and the browser request authority.
  // The boundary helper validates both before durableAuthRequest/fetch is reachable.
  const requestHeaders = await headers();
  const result = await durableAuthActionRequest({ operation, body, requestHeaders });
  const store = await cookies();
  if (result.status === 'success' && result.cookie) {
    store.set({
      name: result.cookie.name,
      value: result.cookie.value,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: result.cookie.secure,
      ...(result.cookie.maxAge === undefined ? {} : { maxAge: result.cookie.maxAge }),
      ...(result.cookie.expires ? { expires: result.cookie.expires } : {}),
    });
  }
  if (shouldClearDurableCookie(operation, result)) {
    store.set(durableCookieClearOptions());
  }
  redirect(`/account?result=${encodeURIComponent(resultCode(result))}`);
}

export async function registerAccountAction(formData: FormData): Promise<never> {
  return run('register', {
    email: text(formData, 'email').toLowerCase(),
    password: text(formData, 'password', false),
    handle: text(formData, 'handle').toLowerCase(),
    displayName: text(formData, 'displayName'),
  });
}

export async function loginAccountAction(formData: FormData): Promise<never> {
  return run('login', {
    email: text(formData, 'email').toLowerCase(),
    password: text(formData, 'password', false),
  });
}

export async function logoutAccountAction(): Promise<never> {
  return run('logout', {});
}
