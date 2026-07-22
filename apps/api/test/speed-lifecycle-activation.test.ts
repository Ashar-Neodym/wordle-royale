import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { SpeedLifecycleActivationService } from '../src/gameplay/speed-lifecycle-activation.service.ts';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';
import { ReadinessService } from '../src/health/readiness.service.ts';

const previousFlag = process.env.SPEED_1V1_QUEUE_ENABLED;

afterEach(() => {
  if (previousFlag === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
  else process.env.SPEED_1V1_QUEUE_ENABLED = previousFlag;
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    controlProtocol: 'speed_lifecycle_activation_gate_v1',
    phase: 'v1_open',
    activeCreationVersion: 'speed_ready_v1_match_created_20s',
    generation: 1n,
    targetReleaseId: null,
    expectedReplicaCount: null,
    ...overrides,
  };
}

function activation(authority: ReturnType<typeof row> | null, fresh = true, acknowledgedGeneration?: bigint) {
  const client = { $queryRawUnsafe: async () => authority ? [authority] : [] };
  const acknowledged = acknowledgedGeneration ?? (authority ? BigInt(authority.generation as bigint) : 0n);
  return new SpeedLifecycleActivationService({ client } as any, { isFresh: async (expected: bigint) => fresh && expected === acknowledged } as any);
}

describe('Ticket 187 fail-closed lifecycle activation', () => {
  it('accepts only exact supported open authorities and returns the shared identity', async () => {
    const v1 = activation(row());
    assert.deepEqual(await v1.lockCreationAuthority({ $queryRawUnsafe: async () => [row()] }), {
      protocol: 'speed_lifecycle_activation_gate_v1', phase: 'v1_open',
      activeVersion: 'speed_ready_v1_match_created_20s', generation: 1n,
    });
    const v2row = row({ phase: 'v2_open', activeCreationVersion: 'speed_ready_v2_first_ack_90s', generation: 9n });
    const v2 = activation(v2row);
    assert.equal((await v2.checkLocalAvailability()).activeVersion, 'speed_ready_v2_first_ack_90s');
  });

  it('fails closed for missing, closing, unsupported protocol/version, and stale lease states', async () => {
    const cases = [
      [activation(null), 'activation_unavailable'],
      [activation(row({ phase: 'closing_to_v2', activeCreationVersion: null })), 'activation_draining'],
      [activation(row({ controlProtocol: 'future_protocol' })), 'activation_protocol_unsupported'],
      [activation(row({ activeCreationVersion: 'speed_ready_v2_first_ack_90s' })), 'active_version_unsupported'],
      [activation(row(), false), 'capability_lease_unavailable'],
      [activation(row({ phase: 'v2_open', activeCreationVersion: 'speed_ready_v2_first_ack_90s', generation: 9n }), true, 8n), 'capability_lease_unavailable'],
    ] as const;
    for (const [service, reason] of cases) {
      const status = await service.checkLocalAvailability();
      assert.equal(status.available, false);
      assert.equal(status.reason, reason);
    }
  });

  it('maps database guard tokens to sanitized Speed-only errors', () => {
    const service = activation(row());
    assert.equal((service.mapDatabaseError(new Error('WR_SPEED_CREATION_CLOSED')) as any).response.code, 'speed_lifecycle_draining');
    assert.equal((service.mapDatabaseError(new Error('WR_SPEED_LIFECYCLE_VERSION_MISMATCH detail omitted')) as any).response.code, 'speed_lifecycle_version_mismatch');
    const fallback = service.mapDatabaseError(new Error('provider host schema secret detail')) as any;
    assert.deepEqual(fallback.response, {
      code: 'speed_lifecycle_activation_unavailable',
      message: 'Speed lifecycle activation is temporarily unavailable.',
    });
  });

  it('keeps configured Speed visible but closes its queue and hides fleet internals', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const catalog = new LeaderboardReadService({ client: {} } as any, {
      check: async () => ({ available: false, reason: 'activation_draining', checkedAt: new Date().toISOString(), phase: 'closing_to_v2', activeVersion: null }),
    } as any);
    const speed = (await catalog.listRankedModes()).modes.find((mode) => mode.id === 'speed_1v1')!;
    assert.equal(speed.enabled, true);
    assert.equal(speed.queueEnabled, false);
    assert.equal(speed.unavailableReason, 'lifecycle_activation_draining');
    assert.equal(speed.readyLifecycleVersion, undefined);
    assert.equal(JSON.stringify(speed).includes('generation'), false);
    assert.equal(JSON.stringify(speed).includes('release'), false);
    assert.equal(JSON.stringify(speed).includes('replica'), false);
    assert.equal(JSON.stringify(speed).includes('instance'), false);
  });

  it('keeps global readiness healthy when only activation schema is unavailable', async () => {
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    const ok = { status: 'ok', checkedAt: new Date().toISOString() };
    const readiness = new ReadinessService(
      {
        checkDatabase: async () => ok,
        checkApplicationSchema: async () => ok,
        checkSpeedReadyLifecycleSchema: async (includeActivation: boolean) => includeActivation ? { ...ok, status: 'unavailable' } : ok,
      } as any,
      { checkStandardDictionary: async () => ok } as any,
      { checkRedis: async () => ok } as any,
      { check: async () => ({ available: false, reason: 'activation_schema_unavailable', checkedAt: new Date().toISOString(), activeVersion: null, phase: null }) } as any,
    );
    const status = await readiness.getReadiness();
    assert.equal(status.status, 'ok');
    assert.equal(status.dependencies.speedRuntime?.status, 'ok');
    assert.equal((status.dependencies as any).speedLifecycleActivation.status, 'unavailable');
  });
});
