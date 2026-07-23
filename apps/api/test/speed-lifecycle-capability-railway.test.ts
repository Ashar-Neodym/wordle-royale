import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SpeedLifecycleCapabilityService } from '../src/gameplay/speed-lifecycle-capability.service.ts';

const KEYS = ['RAILWAY_PROJECT_ID','RAILWAY_ENVIRONMENT_ID','RAILWAY_SERVICE_ID','RAILWAY_DEPLOYMENT_ID','RAILWAY_REPLICA_ID','RAILWAY_REPLICA_REGION','RAILWAY_GIT_COMMIT_SHA','SPEED_LIFECYCLE_RELEASE_ID','SPEED_LIFECYCLE_PROVIDER_ADAPTER','NODE_TEST_CONTEXT'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
afterEach(() => { for (const key of KEYS) { const value = saved[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

function railwayEnv() {
  process.env.RAILWAY_PROJECT_ID = 'project'; process.env.RAILWAY_ENVIRONMENT_ID = 'environment';
  process.env.RAILWAY_SERVICE_ID = 'service'; process.env.RAILWAY_DEPLOYMENT_ID = 'deployment';
  process.env.RAILWAY_REPLICA_ID = 'replica'; process.env.RAILWAY_REPLICA_REGION = 'region';
  process.env.RAILWAY_GIT_COMMIT_SHA = 'A'.repeat(40);
}

describe('Ticket 195 Railway capability identity', () => {
  it('derives canonical immutable provider identity and ignores mutable configured release when absent', async () => {
    railwayEnv();
    let args: unknown[] = [];
    let queryArgs: unknown[] = [];
    const client = {
      $executeRawUnsafe: async (_sql: string, ...values: unknown[]) => { args = values; return 1; },
      $queryRawUnsafe: async (_sql: string, ...values: unknown[]) => { queryArgs = values; return [{ fresh: 1 }]; },
    };
    const service = new SpeedLifecycleCapabilityService({ client } as any);
    assert.equal(await service.heartbeat(), true);
    assert.equal(args[2], 'railway:deployment:deployment');
    assert.deepEqual(args.slice(6, 13), ['project','environment','service','deployment','replica','region',`git:${'a'.repeat(40)}`]);
    assert.equal(queryArgs[10], 'region');
    assert.equal(queryArgs[11], `git:${'a'.repeat(40)}`);
    service.onModuleDestroy();
  });

  it('fails closed without a complete Railway identity or on configured release disagreement', async () => {
    railwayEnv();
    delete process.env.RAILWAY_REPLICA_ID;
    let writes = 0;
    const service = new SpeedLifecycleCapabilityService({ client: { $executeRawUnsafe: async () => { writes += 1; } } } as any);
    assert.equal(await service.heartbeat(), false);
    railwayEnv();
    delete process.env.RAILWAY_REPLICA_REGION;
    assert.equal(await service.heartbeat(), false);
    railwayEnv();
    process.env.SPEED_LIFECYCLE_RELEASE_ID = 'mutable-wrong-release';
    assert.equal(await service.heartbeat(), false);
    assert.equal(writes, 0);
  });
});
