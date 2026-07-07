import { Injectable } from '@nestjs/common';
import type { ReadinessDependency } from '@wordle-royale/contracts';
import net from 'node:net';
import { envFlagEnabled } from '../config/runtime-config.ts';

const redisCheckTimeoutMs = 250;

type RedisLocation = {
  host: string;
  port: number;
};

function parseRedisUrl(rawUrl: string | undefined): RedisLocation | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    return { host: parsed.hostname || '127.0.0.1', port: Number.parseInt(parsed.port || '6379', 10) };
  } catch {
    return null;
  }
}

@Injectable()
export class RedisReadinessService {
  checkRedis(redisUrl = process.env.REDIS_URL): Promise<ReadinessDependency> {
    const checkedAt = new Date().toISOString();
    const redisRequired = envFlagEnabled(process.env.REDIS_REQUIRED, false);
    if (!redisUrl && !redisRequired) {
      return Promise.resolve({
        status: 'not_checked_stub',
        checkedAt,
        message: 'REDIS_URL is not configured; Redis readiness is optional for this environment.',
      });
    }
    const startedAt = Date.now();
    const location = parseRedisUrl(redisUrl);

    if (!location || !Number.isFinite(location.port)) {
      return Promise.resolve({
        status: 'not_checked_stub',
        checkedAt,
        message: 'REDIS_URL is not configured or could not be parsed.',
      });
    }

    return new Promise((resolve) => {
      const socket = net.createConnection(location);
      const finish = (dependency: ReadinessDependency) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(dependency);
      };

      socket.setTimeout(redisCheckTimeoutMs);
      socket.once('connect', () => {
        finish({ status: 'ok', checkedAt, latencyMs: Date.now() - startedAt });
      });
      socket.once('timeout', () => {
        finish({ status: 'unavailable', checkedAt, latencyMs: Date.now() - startedAt, message: 'Redis readiness check timed out.' });
      });
      socket.once('error', (error) => {
        finish({ status: 'unavailable', checkedAt, latencyMs: Date.now() - startedAt, message: error.message });
      });
    });
  }
}
