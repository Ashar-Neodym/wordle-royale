import { Inject, Injectable } from '@nestjs/common';
import { currentUserSchema, handleAvailabilityResponseSchema, publicProfileSchema } from '@wordle-royale/contracts';
import type { CurrentUserDto, HandleAvailabilityResponse, PublicProfileDto, UpdateProfileRequest } from '@wordle-royale/contracts';
import { PrismaService } from '../prisma/prisma.service.ts';

const stubUserId = '11111111-1111-4111-8111-111111111111';
const stubEmail = 'player@example.local';
const defaultHandle = 'player_one';
const defaultDisplayName = 'Player One';

type UserProfileRecord = {
  publicHandle?: string | null;
  avatarUrl?: string | null;
};

type UserRecord = {
  id: string;
  email?: string | null;
  displayName: string;
  status?: string;
  createdAt?: Date | string;
  profile?: UserProfileRecord | null;
};

function normalizeHandle(input: string): string {
  const normalized = input.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return normalized.length >= 3 ? normalized : defaultHandle;
}

function dateToIso(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? new Date().toISOString();
}

@Injectable()
export class ProfileService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCurrentUser(): Promise<CurrentUserDto> {
    const user = await this.ensureStubUser();
    return currentUserSchema.parse({
      id: user.id,
      email: user.email ?? stubEmail,
      status: 'active',
      role: 'player',
      createdAt: dateToIso(user.createdAt),
      profile: {
        handle: user.profile?.publicHandle ?? defaultHandle,
        displayName: user.displayName,
        avatarUrl: user.profile?.avatarUrl ?? null,
        profileVisibility: 'public',
      },
    });
  }

  async getPublicProfile(): Promise<PublicProfileDto> {
    const user = await this.ensureStubUser();
    return this.toPublicProfile(user);
  }

  async updateProfile(input: UpdateProfileRequest): Promise<PublicProfileDto> {
    await this.prisma.client.userAccount.upsert({
      where: { id: stubUserId },
      create: { id: stubUserId, email: stubEmail, displayName: input.displayName ?? defaultDisplayName, status: 'active' },
      update: { displayName: input.displayName ?? defaultDisplayName },
    });

    const profile = await this.prisma.client.userProfile.upsert({
      where: { userId: stubUserId },
      create: {
        userId: stubUserId,
        publicHandle: input.handle ?? defaultHandle,
        avatarUrl: input.avatarUrl ?? null,
      },
      update: {
        ...(input.handle ? { publicHandle: input.handle } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
    }) as UserProfileRecord;

    return publicProfileSchema.parse({
      userId: stubUserId,
      handle: profile.publicHandle ?? input.handle ?? defaultHandle,
      displayName: input.displayName ?? defaultDisplayName,
      avatarUrl: profile.avatarUrl ?? input.avatarUrl ?? null,
      profileVisibility: 'public',
      rating: 1200,
      rank: null,
    });
  }

  async handleAvailability(handle: string): Promise<HandleAvailabilityResponse> {
    const normalizedHandle = normalizeHandle(handle);
    const count = await this.prisma.client.userProfile.count({ where: { publicHandle: normalizedHandle } });
    return handleAvailabilityResponseSchema.parse({ handle, normalizedHandle, available: count === 0 || normalizedHandle === defaultHandle });
  }

  private async ensureStubUser(): Promise<UserRecord> {
    const user = await this.prisma.client.userAccount.upsert({
      where: { id: stubUserId },
      create: {
        id: stubUserId,
        email: stubEmail,
        displayName: defaultDisplayName,
        status: 'active',
        profile: { create: { publicHandle: defaultHandle, avatarUrl: null } },
      },
      update: {},
      include: { profile: true },
    }) as UserRecord;

    if (!user.profile) {
      const profile = await this.prisma.client.userProfile.upsert({
        where: { userId: stubUserId },
        create: { userId: stubUserId, publicHandle: defaultHandle, avatarUrl: null },
        update: {},
      }) as UserProfileRecord;
      return { ...user, profile };
    }

    return user;
  }

  private toPublicProfile(user: UserRecord): PublicProfileDto {
    return publicProfileSchema.parse({
      userId: user.id,
      handle: user.profile?.publicHandle ?? defaultHandle,
      displayName: user.displayName,
      avatarUrl: user.profile?.avatarUrl ?? null,
      profileVisibility: 'public',
      rating: 1200,
      rank: null,
    });
  }
}
