import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { authRegistrationMode, decodeAuthRateLimitKey } from '../config/runtime-config.ts';
import { durableAuthActive } from '../auth/durable-unsafe-request.middleware.ts';
import { PrismaService } from '../prisma/prisma.service.ts';

type AuthReadiness = {
  status: 'ok' | 'unavailable' | 'not_checked_stub';
  checkedAt: string;
  latencyMs?: number;
  message: string;
  registrationMode: 'closed' | 'canary' | 'open';
  keyFingerprint?: string;
  configFingerprint?: string;
  expectedReplicaCount?: number;
};

function fingerprint(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

@Injectable()
export class AuthReadinessService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async check(): Promise<AuthReadiness> {
    const checkedAt = new Date().toISOString();
    const registrationMode = authRegistrationMode();
    if (!durableAuthActive()) {
      return { status: 'not_checked_stub', checkedAt, registrationMode, message: 'Durable authentication schema is not required because durable authentication is disabled.' };
    }
    const key = decodeAuthRateLimitKey(process.env.AUTH_RATE_LIMIT_KEY ?? '');
    const expectedReplicaCount = Number(process.env.EXPECTED_API_REPLICA_COUNT || '1');
    const configFingerprint = fingerprint(JSON.stringify({
      authMode: process.env.AUTH_MODE,
      registrationMode,
      trustedProxyHops: process.env.TRUSTED_PROXY_HOPS ?? 'unset',
      expectedReplicaCount,
      sessionTtl: process.env.ACCOUNT_SESSION_TTL_SECONDS ?? '2592000',
      lastSeenInterval: process.env.ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS ?? '900',
      cookieSecure: process.env.COOKIE_SECURE ?? '',
      publicWebOrigin: process.env.PUBLIC_WEB_URL ?? '',
    }));
    const schema = await this.prisma.checkDurableAuthSchema();
    return {
      status: schema.status === 'ok' ? 'ok' : 'unavailable',
      checkedAt,
      ...(schema.latencyMs == null ? {} : { latencyMs: schema.latencyMs }),
      registrationMode,
      keyFingerprint: fingerprint(key),
      configFingerprint,
      expectedReplicaCount,
      message: schema.status === 'ok' ? 'Durable authentication configuration and schema are ready.' : 'Durable authentication schema is unavailable.',
    };
  }
}
