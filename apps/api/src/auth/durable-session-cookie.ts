type RequestLike = { headers?: Record<string, string | string[] | undefined> } | undefined;
type ResponseLike = { setHeader(name: string, value: string | string[]): void };

function enabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

export function durableCookieSecure(): boolean {
  return enabled(process.env.COOKIE_SECURE);
}

export function durableCookieName(): string {
  return durableCookieSecure() ? '__Host-wr_session' : 'wr_session';
}

export function readDurableSessionToken(request?: RequestLike): string | undefined {
  const raw = request?.headers?.cookie;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const name = durableCookieName();
  const matches: string[] = [];
  for (const cookie of cookies) {
    for (const part of cookie.split(';')) {
      const index = part.indexOf('=');
      if (index < 0 || part.slice(0, index).trim() !== name) continue;
      matches.push(part.slice(index + 1).trim());
    }
  }
  return matches.length === 1 && matches[0] ? matches[0] : undefined;
}

export function setDurableSessionCookie(response: ResponseLike, token: string, expiresAt: Date): void {
  const maxAge = Number(process.env.ACCOUNT_SESSION_TTL_SECONDS ?? '2592000');
  const secure = durableCookieSecure();
  response.setHeader('Set-Cookie', `${durableCookieName()}=${token}; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}`);
}

export function clearDurableSessionCookie(response: ResponseLike): void {
  const secure = durableCookieSecure();
  response.setHeader('Set-Cookie', `${durableCookieName()}=; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}
