import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PrismaService } from '../src/prisma/prisma.service.ts';

describe('Ticket 184 readiness dependency sanitization', () => {
  it('does not expose SQL, provider, schema, or connection details from dependency failures', async () => {
    const sensitive = 'postgresql://user:secret@db.internal:5432/app SQLSTATE 42P01 SELECT * FROM private_schema.secret_table';
    const service = new PrismaService();
    (service as any).prisma = {
      $queryRaw: async () => { throw new Error(sensitive); },
      $queryRawUnsafe: async () => { throw new Error(sensitive); },
      $disconnect: async () => undefined,
    };

    const database = await service.checkDatabase();
    const application = await service.checkApplicationSchema();
    const lifecycle = await service.checkSpeedReadyLifecycleSchema();

    assert.equal(database.status, 'unavailable');
    assert.equal(database.message, 'Database dependency is unavailable.');
    assert.equal(application.status, 'unavailable');
    assert.equal(application.message, 'Application schema dependency is unavailable. Run database migrations before serving traffic.');
    assert.equal(lifecycle.status, 'unavailable');
    assert.equal(lifecycle.message, 'Speed ready lifecycle schema dependency is unavailable.');
    for (const result of [database, application, lifecycle]) {
      assert.doesNotMatch(result.message ?? '', /secret|SQLSTATE|SELECT|private_schema|postgresql:\/\//i);
    }

    await service.onModuleDestroy();
  });
});
