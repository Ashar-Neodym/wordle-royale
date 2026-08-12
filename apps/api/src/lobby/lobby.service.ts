import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { idSchema, lobbyDtoSchema, timestampSchema } from '@wordle-royale/contracts';
import type { CreateLobbyRequest, JoinLobbyByCodeRequest, LobbyDto, LobbyListQuery } from '@wordle-royale/contracts';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.ts';

const stubHostUserId = '11111111-1111-4111-8111-111111111111';
const stubGuestUserId = '22222222-2222-4222-8222-222222222222';
const stubHostDisplayName = 'Player One';
const stubGuestDisplayName = 'Guest Player';

function generateLobbyCode(): string {
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

type LobbyMember = LobbyDto['members'][number];
type LobbySettings = LobbyDto['settings'];

type StoredLobbySettings = {
  contractSettings: LobbySettings;
  members: LobbyMember[];
  expiresAt: string;
};

const storedLobbySettingsSchema = z.object({
  contractSettings: z.object({
    visibility: z.enum(['public', 'private']),
    rated: z.boolean(),
    mode: z.literal('standard'),
    language: z.literal('en'),
    wordLength: z.literal(5),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    minPlayers: z.number().int().min(2).max(4),
    maxPlayers: z.number().int().min(2).max(4),
    roundsCount: z.number().int().min(1).max(10),
    roundTimeSeconds: z.literal(120),
    scoringPreset: z.literal('standard_v1'),
  }).strict().refine((value) => value.minPlayers <= value.maxPlayers),
  members: z.array(z.object({
    userId: idSchema,
    displayName: z.string().min(1).max(100),
    handle: z.string().max(64).nullable().optional(),
    role: z.enum(['host', 'player']),
    state: z.enum(['joined', 'disconnected', 'left', 'kicked']),
    ready: z.boolean(),
    joinedAt: timestampSchema,
  }).strict()).min(1).max(4),
  expiresAt: timestampSchema,
}).strict();

type LobbyRecord = {
  id: string;
  code: string;
  hostUserId: string;
  status: string;
  visibility: string;
  mode: string;
  maxPlayers: number;
  settings?: unknown;
  createdAt?: Date | string;
};

const LOBBY_CURSOR_VERSION = 2;
const MAX_LOBBY_CURSOR_LENGTH = 512;
const lobbyCursorSchema = z.object({
  v: z.literal(LOBBY_CURSOR_VERSION), createdAt: timestampSchema, id: idSchema,
  query: z.object({
    mode: z.enum(['ranked', 'casual']).nullable(),
    status: z.enum(['waiting', 'ready', 'in_match', 'closed']).nullable(),
    visibility: z.enum(['public', 'private']),
    limit: z.number().int().min(1).max(100),
  }).strict(),
}).strict();

type CanonicalLobbyListQuery = Omit<LobbyListQuery, 'cursor'>;

function encodeLobbyCursor(row: LobbyRecord, query: CanonicalLobbyListQuery): string {
  if (row.createdAt === undefined) throw new Error('Cannot paginate a lobby without createdAt.');
  return Buffer.from(JSON.stringify({
    v: LOBBY_CURSOR_VERSION, createdAt: toRecordDate(row.createdAt), id: row.id,
    query: { mode: query.mode ?? null, status: query.status ?? null, visibility: query.visibility, limit: query.limit },
  }), 'utf8').toString('base64url');
}

function decodeLobbyCursor(value: string, query: CanonicalLobbyListQuery): { createdAt: Date; id: string } {
  try {
    if (!value || value.length > MAX_LOBBY_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('shape');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('encoding');
    const parsed = lobbyCursorSchema.parse(JSON.parse(decoded.toString('utf8')));
    const expected = { mode: query.mode ?? null, status: query.status ?? null, visibility: query.visibility, limit: query.limit };
    if (JSON.stringify(parsed.query) !== JSON.stringify(expected)) throw new Error('query');
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) throw new Error('timestamp');
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException({ code: 'invalid_lobby_cursor', message: 'Lobby cursor is invalid.', details: {} });
  }
}

type UserForMember = {
  id: string;
  displayName?: string | null;
  profile?: { publicHandle?: string | null } | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function expiresAtIso(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function statusToState(status: string): LobbyDto['state'] {
  if (status === 'ready') return 'ready';
  if (status === 'in_match') return 'in_progress';
  if (status === 'closed') return 'cancelled';
  return 'waiting';
}

function member(userId: string, displayName: string, handle: string, role: LobbyMember['role']): LobbyMember {
  return { userId, displayName, handle, role, state: 'joined', ready: false, joinedAt: nowIso() };
}

function toStoredSettings(settings: LobbySettings, members: LobbyMember[]): StoredLobbySettings {
  return { contractSettings: settings, members, expiresAt: expiresAtIso() };
}

export function readStoredLobbySettings(raw: unknown): StoredLobbySettings {
  const parsed = storedLobbySettingsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceUnavailableException({
      code: 'lobby_data_unavailable',
      message: 'Lobby data is temporarily unavailable.',
      details: {},
    });
  }
  return parsed.data;
}

function toRecordDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? nowIso();
}

@Injectable()
export class LobbyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPublicLobbies(query: LobbyListQuery = { visibility: 'public', limit: 20 }): Promise<{ items: LobbyDto[]; pagination: { nextCursor: string | null } }> {
    const { visibility, status, mode, limit } = query;
    const where: Record<string, unknown> = { visibility, status: status ?? { in: ['waiting', 'ready'] } };
    if (mode) where.mode = mode;
    if (query.cursor !== undefined) {
      const cursor = decodeLobbyCursor(query.cursor, query);
      where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }];
    }

    const rows = await this.prisma.client.lobby.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    }) as LobbyRecord[];

    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => this.toDto(row)),
      pagination: { nextCursor: rows.length > limit ? encodeLobbyCursor(page[page.length - 1]!, query) : null },
    };
  }

  async createLobby(input: CreateLobbyRequest, userId = stubHostUserId): Promise<LobbyDto> {
    const hostMember = await this.memberForUser(userId, 'host');
    const settings: LobbySettings = {
      visibility: input.visibility,
      rated: input.rated,
      mode: input.mode,
      language: input.language,
      wordLength: input.wordLength,
      difficulty: input.difficulty,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      roundsCount: input.roundsCount,
      roundTimeSeconds: input.roundTimeSeconds,
      scoringPreset: input.scoringPreset,
    };

    const created = await this.prisma.client.lobby.create({
      data: {
        code: generateLobbyCode(),
        hostUserId: userId,
        status: 'waiting',
        visibility: input.visibility,
        mode: input.rated ? 'ranked' : 'casual',
        maxPlayers: input.maxPlayers,
        settings: toStoredSettings(settings, [hostMember]),
      },
    }) as LobbyRecord;

    return this.toDto(created);
  }

  async joinByCode(input: JoinLobbyByCodeRequest, userId = stubGuestUserId): Promise<LobbyDto> {
    const existing = await this.prisma.client.lobby.findUnique({ where: { code: input.code } }) as LobbyRecord | null;
    if (!existing) {
      throw new NotFoundException({ code: 'lobby_not_found', message: 'Lobby was not found.', details: { code: input.code } });
    }
    return this.addGuest(existing, userId);
  }

  async joinLobby(lobbyId: string, userId = stubGuestUserId): Promise<LobbyDto> {
    const existing = await this.prisma.client.lobby.findUnique({ where: { id: lobbyId } }) as LobbyRecord | null;
    if (!existing) {
      throw new NotFoundException({ code: 'lobby_not_found', message: 'Lobby was not found.', details: { lobbyId } });
    }
    return this.addGuest(existing, userId);
  }

  private async addGuest(existing: LobbyRecord, userId = stubGuestUserId): Promise<LobbyDto> {
    const stored = readStoredLobbySettings(existing.settings);
    const requestedUserAlreadyJoined = stored.members.some((lobbyMember) => lobbyMember.userId === userId);
    const effectiveUserId = requestedUserAlreadyJoined && userId === stubHostUserId ? stubGuestUserId : userId;
    const hasGuest = stored.members.some((lobbyMember) => lobbyMember.userId === effectiveUserId);
    const guestMember = await this.memberForUser(effectiveUserId, 'player');
    const members = hasGuest ? stored.members : [...stored.members, guestMember];
    const updated = await this.prisma.client.lobby.update({
      where: { id: existing.id },
      data: { settings: { ...stored, members } },
    }) as LobbyRecord;

    return this.toDto(updated);
  }

  private async memberForUser(userId: string, role: LobbyMember['role']): Promise<LobbyMember> {
    if (userId === stubHostUserId) return member(stubHostUserId, stubHostDisplayName, 'player_one', role);
    if (userId === stubGuestUserId) return member(stubGuestUserId, stubGuestDisplayName, 'guest_player', role);

    const user = await (this.prisma.client as any).userAccount.findUnique?.({ where: { id: userId }, include: { profile: true } }) as UserForMember | null;
    const handle = user?.profile?.publicHandle?.trim() || `demo_${userId.replace(/-/g, '').slice(0, 8)}`;
    const displayName = user?.displayName?.trim() || `Preview Demo ${userId.replace(/-/g, '').slice(0, 8)}`;
    return member(userId, displayName, handle, role);
  }

  private toDto(row: LobbyRecord): LobbyDto {
    try {
      const stored = readStoredLobbySettings(row.settings);
      const playerCount = stored.members.filter((lobbyMember) => lobbyMember.state === 'joined').length;
      const open = row.status === 'waiting' || row.status === 'ready';
      const full = playerCount >= row.maxPlayers;
      const enoughPlayers = playerCount >= stored.contractSettings.minPlayers;
      const blockerReason = !open ? 'lobby_not_open' : !enoughPlayers ? 'waiting_for_players' : null;
      return lobbyDtoSchema.parse({
        id: row.id,
        code: row.code,
        hostUserId: row.hostUserId,
        status: row.status,
        visibility: row.visibility,
        mode: row.mode,
        playerCount,
        maxPlayers: row.maxPlayers,
        canJoin: open && !full,
        canStart: open && enoughPlayers,
        blockerReason,
        state: statusToState(row.status),
        settings: stored.contractSettings,
        rankedCompatible: row.mode === 'ranked' && stored.contractSettings.visibility === 'public',
        members: stored.members,
        createdAt: toRecordDate(row.createdAt),
        expiresAt: stored.expiresAt,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: 'lobby_data_unavailable',
        message: 'Lobby data is temporarily unavailable.',
        details: {},
      });
    }
  }
}
