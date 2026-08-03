import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import {
  API_SUPPORTED_WEB_AUTHORITY_IDS,
  RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
  RUNTIME_COMPATIBILITY_SERVICE,
} from '@wordle-royale/contracts';
import type { RuntimeCompatibilityPayload } from '@wordle-royale/contracts';
import { ok } from '../shared/envelope.ts';
import { ReadinessService } from './readiness.service.ts';
import { publicDeploymentRevision } from '../shared/deployment-revision.ts';

type HealthPayload = {
  status: 'ok';
  service: 'wordle-royale-api';
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  revision: string;
};

type ResponseLike = { setHeader(name: string, value: string): void };

@Controller()
export class HealthController {
  constructor(@Inject(ReadinessService) private readonly readiness: ReadinessService) {}

  @Get('healthz')
  healthz(@Req() request: unknown) {
    return ok(this.payload(), request as never);
  }

  @Get('readyz')
  async readyz(@Req() request: unknown) {
    return ok(await this.readiness.getReadiness(), request as never);
  }

  @Get('.well-known/wordle-runtime-compatibility')
  runtimeCompatibility(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: ResponseLike,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const payload: RuntimeCompatibilityPayload = {
      schemaVersion: RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
      service: RUNTIME_COMPATIBILITY_SERVICE,
      environment: process.env.NODE_ENV ?? 'development',
      revision: publicDeploymentRevision(),
      supportedWebAuthorityIds: [...API_SUPPORTED_WEB_AUTHORITY_IDS],
    };
    return ok(payload, request as never);
  }

  private payload(): HealthPayload {
    return {
      status: 'ok',
      service: 'wordle-royale-api',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      revision: publicDeploymentRevision(),
    };
  }
}
