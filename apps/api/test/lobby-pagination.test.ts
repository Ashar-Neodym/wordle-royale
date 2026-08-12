import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { LobbyService } from '../src/lobby/lobby.service.ts';

const createdAt = new Date('2026-08-01T00:00:00.000Z');
const ids = ['ffffffff-ffff-4fff-8fff-ffffffffffff', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const hostUserId = '11111111-1111-4111-8111-111111111111';
const settings = { contractSettings: { visibility: 'public', rated: true, mode: 'standard', language: 'en', wordLength: 5, difficulty: 'medium', minPlayers: 2, maxPlayers: 2, roundsCount: 3, roundTimeSeconds: 120, scoringPreset: 'standard_v1' }, members: [{ userId: hostUserId, displayName: 'Host', handle: 'host', role: 'host', state: 'joined', ready: false, joinedAt: createdAt.toISOString() }], expiresAt: '2026-08-01T01:00:00.000Z' };
const rows = ids.map((id, index) => ({ id, code: `ROOM${index}`, hostUserId, status: 'waiting', visibility: 'public', mode: 'ranked', maxPlayers: 2, settings, createdAt }));

describe('durable lobby pagination', () => {
  it('uses a stable createdAt/id cursor and does not skip equal-time rows', async () => {
    const calls: any[] = [];
    const prisma = { client: { lobby: { findMany: async (query: any) => { calls.push(query); const visible = query.where.OR ? rows.slice(2) : rows; return visible.slice(0, query.take); } } } };
    const service = new LobbyService(prisma as never);
    const first = await service.listPublicLobbies({ limit: '2' });
    assert.deepEqual(first.items.map((item) => item.id), ids.slice(0, 2));
    assert.ok(first.pagination.nextCursor);
    const second = await service.listPublicLobbies({ limit: '2', cursor: first.pagination.nextCursor! });
    assert.deepEqual(second.items.map((item) => item.id), ids.slice(2));
    assert.equal(second.pagination.nextCursor, null);
    assert.equal(calls.every((call) => call.take === 3), true);
    assert.deepEqual(calls[0].orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
    assert.deepEqual(calls[1].where.OR, [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: ids[1] } }]);
  });

  it('rejects malformed cursors instead of restarting at page one', async () => {
    const service = new LobbyService({ client: { lobby: { findMany: async () => [] } } } as never);
    for (const cursor of [
      '',
      'not-base64!',
      `${Buffer.from('{}').toString('base64url')}=`,
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({ v: 2, createdAt: createdAt.toISOString(), id: ids[0] })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, createdAt: 'bad', id: ids[0] })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, createdAt: '2026-08-01T00:00:00Z', id: ids[0] })).toString('base64url'),
    ]) {
      await assert.rejects(service.listPublicLobbies({ cursor }), BadRequestException);
    }
  });
});