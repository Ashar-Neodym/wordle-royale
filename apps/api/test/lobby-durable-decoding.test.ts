import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CurrentUserService } from '../src/auth/current-user.service.ts';
import { LobbyController } from '../src/lobby/lobby.controller.ts';
import { LobbyService } from '../src/lobby/lobby.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';
import { ApiExceptionFilter } from '../src/shared/api-exception.filter.ts';

const hostUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const lobbyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const createdAt = new Date('2026-08-11T10:00:00.000Z');

function validSettings() {
  return {
    contractSettings: {
      visibility: 'public', rated: false, mode: 'standard', language: 'en', wordLength: 5,
      difficulty: 'medium', minPlayers: 2, maxPlayers: 4, roundsCount: 3,
      roundTimeSeconds: 120, scoringPreset: 'standard_v1',
    },
    members: [{
      userId: hostUserId, displayName: 'Durable Host', handle: 'durable_host', role: 'host',
      state: 'joined', ready: false, joinedAt: '2026-08-11T10:00:00.000Z',
    }],
    expiresAt: '2026-08-11T10:30:00.000Z',
  };
}

function row(settings: unknown, visibility = 'public') {
  return {
    id: lobbyId, code: 'SAFE42', hostUserId, status: 'waiting', visibility,
    mode: 'casual', maxPlayers: 4, settings, createdAt,
  };
}

function prismaFor(rows: ReturnType<typeof row>[]) {
  let updates = 0;
  return {
    service: {
      client: {
        lobby: {
          findMany: async () => rows,
          findUnique: async () => rows[0] ?? null,
          update: async () => { updates += 1; return rows[0]; },
        },
      },
    },
    updates: () => updates,
  };
}

describe('LobbyService durable settings decoding', () => {
  it('preserves a valid stored lobby without replacing its member identity or settings', async () => {
    const prisma = prismaFor([row(validSettings())]);
    const service = new LobbyService(prisma.service as never);
    const result = await service.listPublicLobbies();

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]!.members[0]!.userId, hostUserId);
    assert.equal(result.items[0]!.members[0]!.displayName, 'Durable Host');
    assert.deepEqual(result.items[0]!.settings, validSettings().contractSettings);
    assert.doesNotMatch(JSON.stringify(result), /Player One|11111111-1111-4111-8111-111111111111/);
  });

  const invalidSettings: Array<[string, unknown]> = [
    ['null', null],
    ['missing members', { contractSettings: validSettings().contractSettings, expiresAt: validSettings().expiresAt }],
    ['malformed member', { ...validSettings(), members: [{ userId: 'not-a-uuid' }] }],
    ['extra root data', { ...validSettings(), sql: 'select secret from lobby' }],
    ['extra settings data', { ...validSettings(), contractSettings: { ...validSettings().contractSettings, fallbackPlayer: 'Player One' } }],
    ['extra member data', { ...validSettings(), members: [{ ...validSettings().members[0], fixtureName: 'Player One' }] }],
    ['type-confused members', { ...validSettings(), members: { 0: validSettings().members[0] } }],
    ['type-confused settings', { ...validSettings(), contractSettings: { ...validSettings().contractSettings, rated: 'false' } }],
    ['missing setting', { ...validSettings(), contractSettings: { ...validSettings().contractSettings, language: undefined } }],
    ['unbounded members', { ...validSettings(), members: Array.from({ length: 5 }, () => validSettings().members[0]) }],
  ];

  for (const [name, settings] of invalidSettings) {
    it(`fails closed for ${name}`, async () => {
      const prisma = prismaFor([row(settings)]);
      const service = new LobbyService(prisma.service as never);

      await assert.rejects(
        service.listPublicLobbies(),
        (error: unknown) => {
          const getResponse = (error as { getResponse?: () => unknown } | null)?.getResponse;
          if (typeof getResponse !== 'function') return false;
          return (getResponse.call(error) as { code?: string }).code === 'lobby_data_unavailable';
        },
      );
      assert.equal(prisma.updates(), 0);
    });
  }

  it('does not repair or update malformed settings during a private join', async () => {
    const prisma = prismaFor([row(null, 'private')]);
    const service = new LobbyService(prisma.service as never);
    await assert.rejects(service.joinLobby(lobbyId), ServiceUnavailableException);
    assert.equal(prisma.updates(), 0);
  });
});

describe('lobby HTTP data-integrity errors', () => {
  let app: INestApplication;
  let storedRow: ReturnType<typeof row>;

  before(async () => {
    storedRow = row(null);
    const prisma = { client: { lobby: {
      findMany: async () => [storedRow],
      findUnique: async () => storedRow,
      update: async () => { throw new Error('must not update malformed lobby'); },
    } } };
    const moduleRef = await Test.createTestingModule({
      controllers: [LobbyController],
      providers: [
        LobbyService,
        { provide: PrismaService, useValue: prisma },
        { provide: CurrentUserService, useValue: { resolveCurrentUser: async () => ({ userId: hostUserId }) } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });

  after(async () => { await app.close(); });

  it('serves valid durable rows unchanged over HTTP', async () => {
    storedRow = row(validSettings());
    const response = await request(app.getHttpServer()).get('/lobbies').expect(200);
    assert.equal(response.body.error, null);
    assert.equal(response.body.data.items[0].members[0].userId, hostUserId);
    assert.equal(response.body.data.items[0].members[0].displayName, 'Durable Host');
    assert.doesNotMatch(JSON.stringify(response.body), /Player One|11111111-1111-4111-8111-111111111111/);
  });

  it('returns the same sanitized public error for malformed public and private reads', async () => {
    for (const visibility of ['public', 'private']) {
      storedRow = row({ ...validSettings(), members: 'SQL row: password=secret' }, visibility);
      const response = await request(app.getHttpServer())
        .get(`/lobbies?visibility=${visibility}`)
        .expect(503);

      assert.deepEqual(response.body.error, {
        code: 'lobby_data_unavailable',
        message: 'Lobby data is temporarily unavailable.',
        details: {},
      });
      assert.equal(response.body.data, null);
      assert.equal(typeof response.body.requestId, 'string');
      assert.doesNotMatch(JSON.stringify(response.body), /password|secret|SQL row|Player One|11111111-1111-4111-8111-111111111111/i);
    }
  });
});
