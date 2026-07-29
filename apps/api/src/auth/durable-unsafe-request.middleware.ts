import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';

type RequestLike = { method?: string; headers?: Record<string, string | string[] | undefined> };
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
    next();
  }
}
