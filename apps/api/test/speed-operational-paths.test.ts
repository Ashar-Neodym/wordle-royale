import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, it } from 'node:test';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';

function unavailable() {
  return new ServiceUnavailableException({
    code: 'speed_1v1_unavailable',
    message: 'Speed 1v1 is temporarily unavailable. Retry later.',
  });
}

function isStableUnavailable(error: any): boolean {
  return error?.response?.code === 'speed_1v1_unavailable'
    && error?.response?.message === 'Speed 1v1 is temporarily unavailable. Retry later.';
}

describe('Ticket 166 fail-closed Speed operation paths', () => {
  it('blocks queue join/current/read/cancel before matchmaking persistence runs', async () => {
    const operational = { assertAvailable: async () => { throw unavailable(); }, assertDependenciesAvailable: async () => { throw unavailable(); } } as any;
    const service = new MatchmakingService({} as any, {} as any, {} as any, undefined, undefined, operational);
    const request = { mode: 'speed_1v1' as const, rated: true as const, allowProvisionalOpponent: true, clientRequestId: '16600000-0000-4000-8000-000000000001' };
    const operations = [
      () => service.joinSpeedQueueWithResult('user-1', request),
      () => service.getCurrentSpeedTicket('user-1'),
      () => service.getSpeedTicket('user-1', 'ticket-1'),
      () => service.cancelSpeedTicket('user-1', 'ticket-1'),
    ];
    for (const operation of operations) await assert.rejects(operation(), isStableUnavailable);
  });

  it('blocks ready/guess/forfeit/state/reconciliation before gameplay persistence runs', async () => {
    const operational = { assertAvailable: async () => { throw unavailable(); }, assertDependenciesAvailable: async () => { throw unavailable(); } } as any;
    const service = new SpeedGameplayService({} as any, {} as any, operational);
    const operations = [
      () => service.markReady('match-1', 'user-1', 'ready-1'),
      () => service.submitGuess({ matchId: 'match-1', roundId: 'round-1', userId: 'user-1', guess: 'crane', clientRequestId: '16600000-0000-4000-8000-000000000002' }),
      () => service.forfeit('match-1', 'user-1', 'forfeit-1'),
      () => service.getSnapshot('match-1', 'user-1'),
      () => service.reconcileDue(),
    ];
    for (const operation of operations) await assert.rejects(operation(), isStableUnavailable);
  });

  it('sanitizes the controller dispatch lookup when the enabled Speed database is unavailable', async () => {
    const previous = process.env.SPEED_1V1_QUEUE_ENABLED;
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    try {
      const operational = { assertAvailable: async () => { throw unavailable(); } } as any;
      const service = new SpeedGameplayService({ client: { match: { findUnique: async () => { throw new Error('database detail'); } } } } as any, {} as any, operational);
      await assert.rejects(service.isSpeedMatch('match-1'), isStableUnavailable);
    } finally {
      if (previous === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
      else process.env.SPEED_1V1_QUEUE_ENABLED = previous;
    }
  });
});
