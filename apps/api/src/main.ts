import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { allowedCorsOrigins } from './config/runtime-config.ts';
import { ApiExceptionFilter } from './shared/api-exception.filter.ts';

const defaultPort = 3001;

function configureCors(app: INestApplication) {
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureCors(app);
  app.useGlobalFilters(new ApiExceptionFilter());

  const parsedPort = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);
  await app.listen(Number.isFinite(parsedPort) ? parsedPort : defaultPort);
}

await bootstrap();
