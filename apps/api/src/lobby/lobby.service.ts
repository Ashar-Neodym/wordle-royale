import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { lobbyDtoSchema } from '@wordle-royale/contracts';
import type { CreateLobbyRequest, JoinLobbyByCodeRequest, LobbyDto } from '@wordle-royale/contracts';
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

type LobbyListQuery = {
  status?: string;
  mode?: string;
  visibility?: string;
  limit?: string;
};

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

function defaultSettings(): LobbySettings {
  return {
    visibility: 'public',
    rated: false,
    mode: 'standard',
    language: 'en',
    wordLength: 5,
    difficulty: 'medium',
    minPlayers: 2,
    maxPlayers: 4,
    roundsCount: 3,
    roundTimeSeconds: 120,
    scoringPreset: 'standard_v1',
  };
}

function member(userId: string, displayName: string, handle: string, role: LobbyMember['role']): LobbyMember {
  return { userId, displayName, handle, role, state: 'joined', ready: false, joinedAt: nowIso() };
}

function toStoredSettings(settings: LobbySettings, members: LobbyMember[]): StoredLobbySettings {
  return { contractSettings: settings, members, expiresAt: expiresAtIso() };
}

function readStoredSettings(raw: unknown): StoredLobbySettings {
  const value = typeof raw === 'object' && raw !== null ? raw as Partial<StoredLobbySettings> : {};
  return {
    contractSettings: value.contractSettings ?? defaultSettings(),
    members: value.members ?? [member(stubHostUserId, stubHostDisplayName, 'player_one', 'host')],
    expiresAt: value.expiresAt ?? expiresAtIso(),
  };
}

function toRecordDate(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? nowIso();
}

@Injectable()
export class LobbyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPublicLobbies(query: LobbyListQuery = {}): Promise<{ items: LobbyDto[]; pagination: { nextCursor: string | null } }> {
    const visibility = query.visibility === 'private' ? 'private' : 'public';
    const status = ['waiting', 'ready', 'in_match', 'closed'].includes(query.status ?? '') ? query.status : undefined;
    const mode = ['ranked', 'casual'].includes(query.mode ?? '') ? query.mode : undefined;
    const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit ?? '20', 10) || 20));
    const where: Record<string, unknown> = { visibility, status: status ?? { in: ['waiting', 'ready'] } };
    if (mode) where.mode = mode;

    const rows = await this.prisma.client.lobby.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as LobbyRecord[];

    return { items: rows.map((row) => this.toDto(row)), pagination: { nextCursor: null } };
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
    const stored = readStoredSettings(existing.settings);
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
    const stored = readStoredSettings(row.settings);
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
  }
}
