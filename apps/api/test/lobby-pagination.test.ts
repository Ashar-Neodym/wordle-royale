import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { lobbyListQuerySchema } from '@wordle-royale/contracts';
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
    const query = lobbyListQuerySchema.parse({ limit: '2', mode: 'ranked', status: 'waiting', visibility: 'public' });
    const first = await service.listPublicLobbies(query);
    assert.deepEqual(first.items.map((item) => item.id), ids.slice(0, 2));
    assert.ok(first.pagination.nextCursor);
    const second = await service.listPublicLobbies({ ...query, cursor: first.pagination.nextCursor! });
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
      Buffer.from(JSON.stringify({ v: 3, createdAt: createdAt.toISOString(), id: ids[0] })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 2, createdAt: 'bad', id: ids[0] })).toString('base64url'),
      Buffer.from(JSON.stringify({ v: 2, createdAt: '2026-08-01T00:00:00Z', id: ids[0] })).toString('base64url'),
    ]) {
      await assert.rejects(service.listPublicLobbies({ visibility: 'public', limit: 20, cursor }), BadRequestException);
    }
  });

  it('strictly validates the closed query DTO instead of parsing or clamping malformed input', () => {
    for (const query of [
      { limit: '2junk' }, { limit: '0' }, { limit: '-4' }, { limit: '101' },
      { limit: '20.0' }, { mode: 'speed' }, { status: 'unknown' }, { visibility: 'friends' },
      { limit: '20', surprise: 'accepted' }, { cursor: '' }, { cursor: ['one', 'two'] },
    ]) assert.equal(lobbyListQuerySchema.safeParse(query).success, false, JSON.stringify(query));
    assert.deepEqual(lobbyListQuerySchema.parse({}), { visibility: 'public', limit: 20 });
    assert.deepEqual(lobbyListQuerySchema.parse({ limit: '50', mode: 'casual' }), { visibility: 'public', limit: 50, mode: 'casual' });
  });

  it('binds an opaque cursor to every canonical result-set parameter', async () => {
    const service = new LobbyService({ client: { lobby: { findMany: async () => rows } } } as never);
    const query = lobbyListQuerySchema.parse({ limit: '2', mode: 'ranked', status: 'waiting', visibility: 'public' });
    const cursor = (await service.listPublicLobbies(query)).pagination.nextCursor!;
    for (const changed of [
      { ...query, mode: 'casual' as const }, { ...query, status: 'ready' as const },
      { ...query, visibility: 'private' as const }, { ...query, limit: 3 },
    ]) await assert.rejects(service.listPublicLobbies({ ...changed, cursor }), BadRequestException);
  });
});