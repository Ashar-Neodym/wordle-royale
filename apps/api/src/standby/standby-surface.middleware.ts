import { Injectable, type NestMiddleware } from '@nestjs/common';
import { apiSurfaceMode } from '../config/runtime-config.ts';
import { fail } from '../shared/envelope.ts';

type StandbyRequest = {
  method?: string;
  originalUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
};

type StandbyResponse = {
  status(code: number): StandbyResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
};

export const STANDBY_GET_PATHS = new Set([
  '/healthz',
  '/readyz',
  '/.well-known/wordle-runtime-compatibility',
  '/ranked/modes',
]);

@Injectable()
export class StandbySurfaceMiddleware implements NestMiddleware {
  use(request: StandbyRequest, response: StandbyResponse, next: () => void): void {
    if (apiSurfaceMode() === 'active') {
      next();
      return;
    }

    // Match the untouched raw request target. Queries, fragments, encoding,
    // duplicate/trailing slashes and Express normalization are not accepted.
    if (request.method === 'GET' && STANDBY_GET_PATHS.has(request.originalUrl ?? '')) {
      next();
      return;
    }

    response.setHeader('Cache-Control', 'no-store');
    response.status(503).json(fail('backend_standby', 'Backend is in standby mode.', {}, request));
  }
}
