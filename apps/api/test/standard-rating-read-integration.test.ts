import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';
import { ProfileReadService } from '../src/profile/profile-read.service.ts';

const databaseUrl = process.env.RATING_READ_INTEGRATION_DATABASE_URL;
const databaseSchema = databaseUrl ? new URL(databaseUrl).searchParams.get('schema') : null;
const safeDatabaseUrl = databaseUrl && databaseSchema?.startsWith('ticket131') ? databaseUrl : undefined;
const runId = randomUUID().slice(0, 8);
const matchId = randomUUID();
const userOneId = randomUUID();
const userTwoId = randomUUID();
const participantOneId = randomUUID();
const participantTwoId = randomUUID();
const dictionaryId = randomUUID();
const winnerHandle = `t131w_${runId}`;
const runnerHandle = `t131r_${runId}`;

const prisma = safeDatabaseUrl ? new PrismaClient({ datasources: { db: { url: safeDatabaseUrl } } }) : null;

async function cleanFixture(): Promise<void> {
  if (!prisma) return;
  await prisma.match.deleteMany({ where: { id: matchId } });
  await prisma.userAccount.deleteMany({ where: { id: { in: [userOneId, userTwoId] } } });
  await prisma.dictionaryRelease.deleteMany({ where: { id: dictionaryId } });
}

describe('authoritative Standard rating read integration', { skip: !safeDatabaseUrl }, () => {
  before(async () => {
    assert.ok(prisma);
    await cleanFixture();
    await prisma.dictionaryRelease.create({
      data: {
        id: dictionaryId,
        locale: 'en',
        wordLength: 5,
        version: `ticket-131-${runId}`,
        status: 'draft',
        sourceLabel: `ticket-131-integration-${runId}`,
      },
    });
    await prisma.userAccount.createMany({
      data: [
        { id: userOneId, displayName: 'Ticket 131 Winner' },
        { id: userTwoId, displayName: 'Ticket 131 Runner Up' },
      ],
    });
    await prisma.userProfile.createMany({
      data: [
        { userId: userOneId, publicHandle: winnerHandle },
        { userId: userTwoId, publicHandle: runnerHandle },
      ],
    });
    await prisma.ratingProfile.createMany({
      data: [
        { userId: userOneId, mode: 'standard_1v1', rating: 1500, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1' },
        { userId: userTwoId, mode: 'standard_1v1', rating: 1500, algorithm: 'placement_mmr_v1', algorithmConfigVersion: 'placement_mmr_v1' },
      ],
    });
    await prisma.match.create({
      data: {
        id: matchId,
        dictionaryReleaseId: dictionaryId,
        mode: 'ranked',
        rankedMode: 'standard_1v1',
        status: 'active',
        algorithmConfigVersion: 'standard_1v1_glicko_v1',
        idempotencyKey: `ticket-131-standard-read-integration-${runId}`,
        startedAt: new Date('2026-07-10T10:00:00.000Z'),
        participants: {
          create: [
            { id: participantOneId, userId: userOneId, seatNumber: 1, outcome: 'solved', finalScore: 820 },
            { id: participantTwoId, userId: userTwoId, seatNumber: 2, outcome: 'failed', finalScore: 120 },
          ],
        },
      },
    });
  });

  after(async () => {
    await cleanFixture();
    await prisma?.$disconnect();
  });

  it('settles once and makes leaderboard, rated profile, summary, and history agree', async () => {
    assert.ok(prisma);
    const persistence = new GameplayPersistenceService({ client: prisma } as never);
    const leaderboardReads = new LeaderboardReadService({ client: prisma } as never);
    const profileReads = new ProfileReadService({ client: prisma } as never);

    const settlement = await persistence.finalizeRankedMatchRatings({
      matchId,
      now: new Date('2026-07-10T10:05:00.000Z'),
    });
    const leaderboard = await leaderboardReads.listLeaderboard({ mode: 'standard_1v1', limit: 10 });
    const ratedProfile = await leaderboardReads.getRatedProfileByHandle(winnerHandle);
    const summary = await profileReads.getPublicProfileSummary(winnerHandle);
    const history = await profileReads.listCurrentUserMatchHistory({ userId: userOneId, limit: 10 });
    const historyMatch = history.items.find((item) => item.matchId === matchId);

    assert.equal(settlement.ratingEvent?.algorithmVersion, 'standard_1v1_glicko_v1');
    assert.equal(settlement.ratingEvent?.participants[0]?.ratingDelta, 14);
    assert.equal(leaderboard.algorithm, 'standard_1v1_glicko_v1');
    assert.equal(leaderboard.algorithmConfigVersion, 'standard_1v1_glicko_v1');
    const fixtureEntries = leaderboard.entries
      .filter((entry) => entry.userId === userOneId || entry.userId === userTwoId)
      .map((entry) => ({ userId: entry.userId, rating: entry.rating, games: entry.matchesPlayed }));
    assert.deepEqual(fixtureEntries, [
      { userId: userOneId, rating: 1514, games: 1 },
      { userId: userTwoId, rating: 1486, games: 1 },
    ]);
    assert.deepEqual({ rating: ratedProfile.rating, games: ratedProfile.matchesPlayed, algorithm: ratedProfile.algorithm }, {
      rating: 1514,
      games: 1,
      algorithm: 'standard_1v1_glicko_v1',
    });
    assert.deepEqual({ rating: summary.rating.rating, games: summary.rating.matchesPlayed, algorithm: summary.rating.algorithm }, {
      rating: 1514,
      games: 1,
      algorithm: 'standard_1v1_glicko_v1',
    });
    assert.deepEqual({ delta: historyMatch?.viewer?.ratingDelta, algorithm: historyMatch?.ratingAlgorithm, version: historyMatch?.ratingAlgorithmConfigVersion }, {
      delta: 14,
      algorithm: 'standard_1v1_glicko_v1',
      version: 'standard_1v1_glicko_v1',
    });
  });
});
