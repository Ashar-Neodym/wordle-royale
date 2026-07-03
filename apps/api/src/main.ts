import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { ApiExceptionFilter } from './shared/api-exception.filter.ts';

const defaultPort = 3001;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ApiExceptionFilter());

  const parsedPort = Number.parseInt(process.env.PORT ?? String(defaultPort), 10);
  await app.listen(Number.isFinite(parsedPort) ? parsedPort : defaultPort);
}

await bootstrap();
