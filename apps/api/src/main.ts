import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { allowedCorsOrigins, trustedProxyHops } from './config/runtime-config.ts';
import { ApiExceptionFilter } from './shared/api-exception.filter.ts';

const defaultPort = 3001;

export function configureCors(app: INestApplication) {
  const origins = allowedCorsOrigins();
  if (origins.length === 0) return;
  app.enableCors({
    credentials: true,
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || origins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin is not allowed for this API environment.'), false);
    },
  });
}

export function configureTrustedProxy(app: INestApplication): void {
  const durable = ['1', 'true', 'yes'].includes((process.env.DURABLE_AUTH_ENABLED ?? '').toLowerCase());
  const productionDurable = durable && process.env.APP_ENV === 'production';
  const configuredProxyHops = process.env.TRUSTED_PROXY_HOPS?.trim();
  if (!productionDurable && !configuredProxyHops) return;
  const express = app.getHttpAdapter().getInstance() as { set(name: string, value: number): void };
  express.set('trust proxy', trustedProxyHops(configuredProxyHops));
}

export async function createApiApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  configureTrustedProxy(app);
  configureCors(app);
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.init();
  return app;
}

async function bootstrap() {
  const app = await createApiApplication();

  const parsedPort = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);
  await app.listen(Number.isFinite(parsedPort) ? parsedPort : defaultPort);
}

if (import.meta.url === `file://${process.argv[1]}`) await bootstrap();
