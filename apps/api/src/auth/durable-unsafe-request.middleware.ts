import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';

type RequestLike = { method?: string; originalUrl?: string; url?: string; headers?: Record<string, string | string[] | undefined> };
type ResponseLike = { setHeader(name: string, value: string): void };
type Next = () => void;

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function enabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

export function durableAuthActive(): boolean {
  return process.env.AUTH_MODE === 'session_required' && enabled(process.env.DURABLE_AUTH_ENABLED);
}

function approvedOrigin(): string | null {
  try {
    const configured = process.env.PUBLIC_WEB_URL;
    if (!configured) return null;
    const url = new URL(configured);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

@Injectable()
export class DurableUnsafeRequestMiddleware implements NestMiddleware {
  use(request: RequestLike, response: ResponseLike, next: Next): void {
    if (!durableAuthActive() || !unsafeMethods.has((request.method ?? '').toUpperCase())) return next();
    response.setHeader('Cache-Control', 'no-store');
    const rawOrigin = request.headers?.origin;
    const origin = Array.isArray(rawOrigin) ? null : rawOrigin;
    const expected = approvedOrigin();
    const rawContentType = request.headers?.['content-type'];
    const contentType = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType;
    let normalizedOrigin: string | null = null;
    try {
      if (origin && origin !== 'null') normalizedOrigin = new URL(origin).origin;
    } catch { /* rejected below */ }
    const exactOrigin = Boolean(expected && origin === expected && normalizedOrigin === expected);
    const json = /^application\/json(?:\s*;\s*charset=[A-Za-z0-9._-]+)?$/iu.test(contentType ?? '');
    if (!exactOrigin || !json) {
      throw new ForbiddenException({
        code: 'unsafe_request_origin',
        message: 'Request origin is not allowed.',
        details: {},
      });
    }
    // Ambiguous durable credentials and preview credentials must never reach a
    // durable mutation. This is deliberately enforced before rate limiting,
    // session revocation, or account creation in the controller/service.
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
    if (path === '/auth/register' || path === '/auth/login' || path === '/auth/logout' || path === '/auth/external/session') {
      const rawCookie = request.headers?.cookie;
      const cookieLines = Array.isArray(rawCookie) ? rawCookie : rawCookie ? [rawCookie] : [];
      const names = cookieLines.flatMap((line) => line.split(';').map((part) => {
        const separator = part.indexOf('=');
        return separator < 0 ? '' : part.slice(0, separator).trim();
      }));
      const hostCount = names.filter((name) => name === '__Host-wr_session').length;
      const legacyCount = names.filter((name) => name === 'wr_session').length;
      const durableCount = hostCount + legacyCount;
      if (hostCount > 1 || legacyCount > 1 || (hostCount > 0 && legacyCount > 0) || (durableCount > 0 && names.includes('wr_preview_demo_session'))) {
        throw new ForbiddenException({
          code: 'unsafe_auth_cookie',
          message: 'Authentication cookie is not allowed.',
          details: {},
        });
      }
    }
    next();
  }
}
