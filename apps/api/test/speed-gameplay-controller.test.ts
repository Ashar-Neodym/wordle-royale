import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GameplayController } from '../src/gameplay/gameplay.controller.ts';
import { speedQueueEnabled } from '../src/matchmaking/matchmaking-config.ts';

const matchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('Speed gameplay route ownership and feature gate', () => {
  const previous = process.env.SPEED_1V1_QUEUE_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.SPEED_1V1_QUEUE_ENABLED;
    else process.env.SPEED_1V1_QUEUE_ENABLED = previous;
  });

  it('keeps Speed fail-closed unless explicitly enabled', () => {
    delete process.env.SPEED_1V1_QUEUE_ENABLED;
    assert.equal(speedQueueEnabled(), false);
    process.env.SPEED_1V1_QUEUE_ENABLED = 'true';
    assert.equal(speedQueueEnabled(), true);
  });

  it('rejects client-driven generic completion for Speed matches', async () => {
    let completed = false;
    const controller = new GameplayController(
      { completeRankedMatch: async () => { completed = true; } } as any,
      { isSpeedMatch: async () => true } as any,
      {} as any,
      { resolveCurrentUser: () => ({ userId: 'viewer' }) } as any,
    );
    await assert.rejects(
      controller.completeRankedMatch(matchId, { matchId, clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', reason: 'all_players_final' }, undefined, {}),
      (error: any) => error?.response?.code === 'speed_server_authoritative_completion',
    );
    assert.equal(completed, false);
  });
});
