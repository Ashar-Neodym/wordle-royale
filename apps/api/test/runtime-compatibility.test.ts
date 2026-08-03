import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  API_SUPPORTED_WEB_AUTHORITY_IDS,
  runtimeCompatibilityEnvelopeSchema,
  RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
} from '@wordle-royale/contracts';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller.ts';
import { ReadinessService } from '../src/health/readiness.service.ts';

const revision = 'd452d5111cac3d9fa9f9a61e375102ea7760f6a2';
const readinessData = {
  status: 'ok' as const,
  service: 'wordle-royale-api' as const,
  environment: 'test',
  revision,
  checkedAt: '2026-08-03T12:00:00.000Z',
  dependencies: {},
};

describe('public runtime compatibility endpoint', () => {
  let app: INestApplication;
  const priorNodeEnv = process.env.NODE_ENV;
  const priorRevision = process.env.GIT_COMMIT_SHA;
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorSessionSecret = process.env.SESSION_SECRET;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.GIT_COMMIT_SHA = revision;
    process.env.DATABASE_URL = 'postgresql://sensitive-user:sensitive-password@sensitive-host/wordle';
    process.env.SESSION_SECRET = 'sensitive-session-value';
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: ReadinessService, useValue: { getReadiness: async () => readinessData } }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  after(async () => {
    await app.close();
    for (const [key, value] of [
      ['NODE_ENV', priorNodeEnv],
      ['GIT_COMMIT_SHA', priorRevision],
      ['DATABASE_URL', priorDatabaseUrl],
      ['SESSION_SECRET', priorSessionSecret],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns the exact standard envelope and disables caching without exposing secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/.well-known/wordle-runtime-compatibility')
      .set('x-request-id', 'runtime-contract-request')
      .expect(200)
      .expect('Cache-Control', 'no-store');

    assert.deepEqual(response.body, {
      data: {
        schemaVersion: RUNTIME_COMPATIBILITY_SCHEMA_VERSION,
        service: 'wordle-royale-api',
        environment: 'test',
        revision,
        supportedWebAuthorityIds: [...API_SUPPORTED_WEB_AUTHORITY_IDS],
      },
      error: null,
      requestId: 'runtime-contract-request',
    });
    assert.equal(runtimeCompatibilityEnvelopeSchema.safeParse(response.body).success, true);
    assert.doesNotMatch(JSON.stringify(response.body), /sensitive-user|sensitive-password|sensitive-host|sensitive-session-value|DATABASE_URL|SESSION_SECRET/);
  });

  it('agrees with health/readiness environment and revision while preserving old payload shapes', async () => {
    const compatibility = await request(app.getHttpServer()).get('/.well-known/wordle-runtime-compatibility').expect(200);
    const health = await request(app.getHttpServer()).get('/healthz').expect(200);
    const ready = await request(app.getHttpServer()).get('/readyz').expect(200);

    assert.equal(compatibility.body.data.environment, health.body.data.environment);
    assert.equal(compatibility.body.data.environment, ready.body.data.environment);
    assert.equal(compatibility.body.data.revision, health.body.data.revision);
    assert.equal(compatibility.body.data.revision, ready.body.data.revision);
    assert.deepEqual(Object.keys(health.body.data).sort(), ['environment', 'revision', 'service', 'status', 'timestamp', 'uptimeSeconds']);
    assert.deepEqual(Object.keys(ready.body.data).sort(), ['checkedAt', 'dependencies', 'environment', 'revision', 'service', 'status']);
    assert.equal('schemaVersion' in health.body.data, false);
    assert.equal('supportedWebAuthorityIds' in ready.body.data, false);
  });
});
