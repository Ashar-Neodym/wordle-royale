import { fixtureUsers } from '@wordle-royale/fixtures';
import { buildPreviewDictionaryPlan } from './dictionary-fixture.ts';
import type { SeedDictionaryRelease, SeedDictionaryWord } from './dictionary-fixture.ts';
export type { SeedDictionaryRelease, SeedDictionaryWord, SeedDictionaryWordKind } from './dictionary-fixture.ts';

export interface SeedUser {
  id: string;
  email: null;
  displayName: string;
  status: 'active';
  profile: {
    id: string;
    userId: string;
    publicHandle: string;
    avatarUrl: null;
    bio: string;
  };
  ratingProfile: {
    id: string;
    userId: string;
    mode: 'standard_1v1';
    rating: number;
    matchesPlayed: number;
    provisionalRemaining: number;
    algorithmConfigVersion: string;
    status: 'active';
  };
}

export interface LocalFixtureSeedPlan {
  dictionaryRelease: SeedDictionaryRelease;
  dictionaryWords: SeedDictionaryWord[];
  users: SeedUser[];
}

const localStubSmokeUsers: SeedUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: null,
    displayName: 'Player One',
    status: 'active',
    profile: {
      id: 'profile_11111111_1111_4111_8111_111111111111',
      userId: '11111111-1111-4111-8111-111111111111',
      publicHandle: 'player_one',
      avatarUrl: null,
      bio: 'Local-only stub host profile for ranked smoke tests.',
    },
    ratingProfile: {
      id: 'rating_11111111_1111_4111_8111_111111111111_ranked_fixture',
      userId: '11111111-1111-4111-8111-111111111111',
      mode: 'standard_1v1',
      rating: 1500,
      matchesPlayed: 0,
      provisionalRemaining: 10,
      algorithmConfigVersion: 'placement_mmr_v1',
      status: 'active',
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: null,
    displayName: 'Guest Player',
    status: 'active',
    profile: {
      id: 'profile_22222222_2222_4222_8222_222222222222',
      userId: '22222222-2222-4222-8222-222222222222',
      publicHandle: 'guest_player',
      avatarUrl: null,
      bio: 'Local-only stub guest profile for ranked smoke tests.',
    },
    ratingProfile: {
      id: 'rating_22222222_2222_4222_8222_222222222222_ranked_fixture',
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'standard_1v1',
      rating: 1500,
      matchesPlayed: 0,
      provisionalRemaining: 10,
      algorithmConfigVersion: 'placement_mmr_v1',
      status: 'active',
    },
  },
];

export interface SeedDryRunSummary {
  mode: 'dry-run';
  dictionary: {
    id: string;
    version: string;
    locale: string;
    wordLength: number;
    status: 'draft';
    sourceLabel: string;
    artifactSha256: string;
    counts: { answer: number; guess: number; banned: number; totalWords: number };
    policy: { fixtureOnly: true; productionApproved: false; sourcePolicy: string };
    validation: { passed: boolean; reportPath: string };
  };
  users: { count: number; handles: string[]; emailsCommitted: 0 };
  apply: { available: false; reason: string };
}

export function buildLocalFixtureSeedPlan(): LocalFixtureSeedPlan {
  const { dictionaryRelease, dictionaryWords } = buildPreviewDictionaryPlan();

  const users = [
    ...Object.values(fixtureUsers).map((user): SeedUser => ({
      id: user.id,
      email: null,
      displayName: user.displayName,
      status: 'active',
      profile: {
        id: `profile_${user.id}`,
        userId: user.id,
        publicHandle: user.handle,
        avatarUrl: null,
        bio: `Local-only safe fixture profile for ${user.displayName}.`,
      },
      ratingProfile: {
        id: `rating_${user.id}_ranked_fixture`,
        userId: user.id,
        mode: 'standard_1v1',
        rating: user.rating,
        matchesPlayed: user.provisional ? 0 : 12,
        provisionalRemaining: user.provisional ? 10 : 0,
        algorithmConfigVersion: 'fixture_mmr_v1',
        status: 'active',
      },
    })),
    ...localStubSmokeUsers,
  ];

  return { dictionaryRelease, dictionaryWords, users };
}

export function buildSeedDryRunSummary(plan = buildLocalFixtureSeedPlan()): SeedDryRunSummary {
  return {
    mode: 'dry-run',
    dictionary: {
      id: plan.dictionaryRelease.id,
      version: plan.dictionaryRelease.version,
      locale: plan.dictionaryRelease.locale,
      wordLength: plan.dictionaryRelease.wordLength,
      status: plan.dictionaryRelease.status,
      sourceLabel: plan.dictionaryRelease.sourceLabel,
      artifactSha256: plan.dictionaryRelease.artifactSha256,
      counts: {
        answer: plan.dictionaryRelease.answerCount,
        guess: plan.dictionaryRelease.guessCount,
        banned: plan.dictionaryRelease.bannedCount,
        totalWords: plan.dictionaryWords.length,
      },
      policy: {
        fixtureOnly: true,
        productionApproved: false,
        sourcePolicy: plan.dictionaryRelease.sourceMetadata.sourcePolicy,
      },
      validation: plan.dictionaryRelease.sourceMetadata.validation,
    },
    users: {
      count: plan.users.length,
      handles: plan.users.map((user) => user.profile.publicHandle).sort(),
      emailsCommitted: 0,
    },
    apply: {
      available: false,
      reason: 'Run with --apply and a local DATABASE_URL to write this deterministic fixture plan to local Postgres.',
    },
  };
}

async function applyLocalFixtureSeed(plan: LocalFixtureSeedPlan) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for --apply. Use --dry-run for database-free validation.');
  }

  const prismaModule = await import('@prisma/client') as unknown as { PrismaClient: new () => any };
  const prisma = new prismaModule.PrismaClient();

  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.dictionaryRelease.upsert({
        where: {
          locale_wordLength_version: {
            locale: plan.dictionaryRelease.locale,
            wordLength: plan.dictionaryRelease.wordLength,
            version: plan.dictionaryRelease.version,
          },
        },
        update: {
          status: plan.dictionaryRelease.status,
          sourceLabel: plan.dictionaryRelease.sourceLabel,
          sourceMetadata: plan.dictionaryRelease.sourceMetadata,
          artifactSha256: plan.dictionaryRelease.artifactSha256,
          answerCount: plan.dictionaryRelease.answerCount,
          guessCount: plan.dictionaryRelease.guessCount,
          bannedCount: plan.dictionaryRelease.bannedCount,
        },
        create: plan.dictionaryRelease,
      });

      await tx.dictionaryWord.createMany({ data: plan.dictionaryWords, skipDuplicates: true });

      for (const user of plan.users) {
        await tx.userAccount.upsert({
          where: { id: user.id },
          update: { displayName: user.displayName, status: user.status },
          create: { id: user.id, email: user.email, displayName: user.displayName, status: user.status },
        });
        await tx.userProfile.upsert({
          where: { userId: user.id },
          update: {
            publicHandle: user.profile.publicHandle,
            avatarUrl: user.profile.avatarUrl,
            bio: user.profile.bio,
          },
          create: user.profile,
        });
        await tx.ratingProfile.upsert({
          where: {
            userId_mode_algorithmConfigVersion: {
              userId: user.id,
              mode: user.ratingProfile.mode,
              algorithmConfigVersion: user.ratingProfile.algorithmConfigVersion,
            },
          },
          update: {
            rating: user.ratingProfile.rating,
            matchesPlayed: user.ratingProfile.matchesPlayed,
            provisionalRemaining: user.ratingProfile.provisionalRemaining,
            status: user.ratingProfile.status,
          },
          create: user.ratingProfile,
        });
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const shouldApply = args.has('--apply');
  const json = args.has('--json');
  const plan = buildLocalFixtureSeedPlan();

  if (!shouldApply) {
    const summary = buildSeedDryRunSummary(plan);
    console.log(json ? JSON.stringify(summary, null, 2) : [
      `Wordle Royale local fixture seed dry-run`,
      `dictionary=${summary.dictionary.version}`,
      `words=${summary.dictionary.counts.totalWords} (answer=${summary.dictionary.counts.answer}, guess=${summary.dictionary.counts.guess}, banned=${summary.dictionary.counts.banned})`,
      `users=${summary.users.count}`,
      `policy=${summary.dictionary.policy.sourcePolicy}`,
      summary.apply.reason,
    ].join('\n'));
    return;
  }

  await applyLocalFixtureSeed(plan);
  const applied = {
    mode: 'apply',
    dictionary: buildSeedDryRunSummary(plan).dictionary,
    users: { count: plan.users.length },
    result: 'applied',
  };
  console.log(json ? JSON.stringify(applied, null, 2) : `Applied local fixture seed: ${applied.dictionary.version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
