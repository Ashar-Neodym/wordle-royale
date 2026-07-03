import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ok } from '../shared/envelope.ts';
import { ReadinessService } from './readiness.service.ts';

type HealthPayload = {
  status: 'ok';
  service: 'wordle-royale-api';
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
};

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

  private payload(): HealthPayload {
    return {
      status: 'ok',
      service: 'wordle-royale-api',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
