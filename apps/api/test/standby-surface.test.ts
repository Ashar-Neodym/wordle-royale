import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';
import { apiSurfaceMode, validateRuntimeConfig } from '../src/config/runtime-config.ts';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { RedisReadinessService } from '../src/health/redis-readiness.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';
import { StandbySurfaceMiddleware } from '../src/standby/standby-surface.middleware.ts';

const managedEnvironment = [
  'NODE_ENV', 'APP_ENV', 'API_SURFACE_MODE', 'DATABASE_URL', 'PUBLIC_WEB_URL',
  'CORS_ALLOWED_ORIGINS', 'DURABLE_AUTH_ENABLED', 'STANDARD_1V1_QUEUE_ENABLED',
  'SPEED_1V1_QUEUE_ENABLED', 'ENABLE_DEV_AUTH', 'ENABLE_DEV_ROUTES',
] as const;

describe('locked standby API surface', () => {
  let app: INestApplication;
  let dependencyOperations = 0;
  const prior = new Map<string, string | undefined>();

  before(async () => {
    for (const name of managedEnvironment) prior.set(name, process.env[name]);
    Object.assign(process.env, {
      NODE_ENV: 'production',
      APP_ENV: 'preview',
      API_SURFACE_MODE: 'standby',
      DURABLE_AUTH_ENABLED: 'false',
      STANDARD_1V1_QUEUE_ENABLED: 'false',
      SPEED_1V1_QUEUE_ENABLED: 'false',
      ENABLE_DEV_AUTH: 'false',
      ENABLE_DEV_ROUTES: 'false',
    });
    delete process.env.DATABASE_URL;
    delete process.env.PUBLIC_WEB_URL;
    delete process.env.CORS_ALLOWED_ORIGINS;

    const forbiddenClient = new Proxy({}, {
      get() {
        dependencyOperations += 1;
        throw new Error('standby_database_operation');
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        client: forbiddenClient,
        checkDatabase: async () => { dependencyOperations += 1; throw new Error('standby_database_read'); },
        checkApplicationSchema: async () => { dependencyOperations += 1; throw new Error('standby_schema_read'); },
        checkSpeedReadyLifecycleSchema: async () => { dependencyOperations += 1; throw new Error('standby_lifecycle_read'); },
        onModuleDestroy: async () => {},
      })
      .overrideProvider(StandardDictionaryService)
      .useValue({ checkStandardDictionary: async () => { dependencyOperations += 1; throw new Error('standby_dictionary_read'); } })
      .overrideProvider(RedisReadinessService)
      .useValue({ checkRedis: async () => { dependencyOperations += 1; throw new Error('standby_redis_read'); } })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  after(async () => {
    await app.close();
    for (const [name, value] of prior) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('allows only the exact GET health, readiness, compatibility, and mode identity contracts without dependency reads', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200);
    const readiness = await request(app.getHttpServer()).get('/readyz').expect(200);
    await request(app.getHttpServer()).get('/.well-known/wordle-runtime-compatibility').expect(200);
    const identity = await request(app.getHttpServer()).get('/ranked/modes').expect(200);

    assert.equal(readiness.body.data.status, 'unavailable');
    assert.deepEqual(new Set(Object.values(readiness.body.data.dependencies).map((item: any) => item.status)), new Set(['not_checked_stub']));
    assert.equal(identity.body.data.modes.every((mode: any) => mode.enabled === false), true);
    assert.equal(identity.body.data.modes.find((mode: any) => mode.id === 'speed_1v1').queueEnabled, false);
    assert.equal(dependencyOperations, 0);
  });

  it('rejects all methods and raw-target bypasses before auth, controller, or database work', async () => {
    const headResponse = await request(app.getHttpServer()).head('/healthz').expect(503).expect('Cache-Control', 'no-store');
    assert.equal(headResponse.text, undefined);

    const blocked = [
      ['post', '/healthz'], ['options', '/readyz'],
      ['get', '/healthz?probe=1'], ['get', '/healthz/'], ['get', '//healthz'],
      ['get', '/%68ealthz'], ['get', '/health%7a'], ['get', '/readyz%3Fprobe=1'],
      ['get', '/.well-known%2Fwordle-runtime-compatibility'],
      ['get', '/ranked/modes?mode=standard_1v1'], ['get', '/ranked%2Fmodes'],
      ['get', '/auth/me'], ['post', '/auth/login'], ['get', '/leaderboard'],
    ] as const;

    for (const [method, path] of blocked) {
      const response = await (request(app.getHttpServer()) as any)[method](path).expect(503).expect('Cache-Control', 'no-store');
      assert.equal(response.body.error.code, 'backend_standby', `${method.toUpperCase()} ${path}`);
      assert.equal(response.body.error.message, 'Backend is in standby mode.');
      assert.deepEqual(response.body.error.details, {});
      assert.equal(JSON.stringify(response.body).includes('standby_database'), false);
    }
    assert.equal(dependencyOperations, 0);
  });

  it('requires explicit hosted mode and fails closed on standby feature activation', () => {
    assert.equal(apiSurfaceMode({ APP_ENV: 'local' }), 'active');
    assert.throws(() => apiSurfaceMode({ APP_ENV: 'preview' }), /must be explicitly set/);
    assert.throws(() => apiSurfaceMode({ APP_ENV: 'production', API_SURFACE_MODE: 'invalid' }), /must be explicitly set/);
    assert.equal(validateRuntimeConfig({ APP_ENV: 'preview', NODE_ENV: 'production', API_SURFACE_MODE: 'standby' }).API_SURFACE_MODE, 'standby');
    for (const unsafe of [
      { DURABLE_AUTH_ENABLED: 'true' },
      { STANDARD_1V1_QUEUE_ENABLED: 'true' },
      { SPEED_1V1_QUEUE_ENABLED: 'true' },
      { PUBLIC_WEB_URL: 'https://web.example' },
      { CORS_ALLOWED_ORIGINS: 'https://web.example' },
    ]) {
      assert.throws(() => validateRuntimeConfig({ APP_ENV: 'preview', API_SURFACE_MODE: 'standby', ...unsafe }), /standby mode/);
    }
  });

  it('preserves the active middleware pass-through contract', () => {
    process.env.API_SURFACE_MODE = 'active';
    let nextCalls = 0;
    new StandbySurfaceMiddleware().use(
      { method: 'DELETE', originalUrl: '/anything', headers: {} },
      { status: () => { throw new Error('active_response_write'); }, setHeader: () => { throw new Error('active_header_write'); }, json: () => { throw new Error('active_json_write'); } },
      () => { nextCalls += 1; },
    );
    assert.equal(nextCalls, 1);
    process.env.API_SURFACE_MODE = 'standby';
  });
});
