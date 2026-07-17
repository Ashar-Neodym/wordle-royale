import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PrismaClient } from '@prisma/client';

import { GameplayPersistenceService } from '../src/gameplay/gameplay-persistence.service.ts';
import { LeaderboardReadService } from '../src/leaderboard/leaderboard-read.service.ts';
import { ProfileReadService } from '../src/profile/profile-read.service.ts';

const databaseUrl = process.env.SPEED_RATING_INTEGRATION_DATABASE_URL;
const schema = databaseUrl ? new URL(databaseUrl).searchParams.get('schema') : null;
const enabled = Boolean(databaseUrl && (schema?.startsWith('ticket159') || schema?.startsWith('ticket169')));
const run = randomUUID().slice(0, 8);
const winnerId = randomUUID();
const loserId = randomUUID();
const matchId = randomUUID();
const immutableIdentityCases = [
  { matchId: randomUUID(), completionReason: 'forfeit' as const, status: 'completed' as const, results: ['loss', 'win'] as const, terminalReasons: ['forfeit', 'awarded_forfeit_win'] as const, expectedEvents: 2 },
  { matchId: randomUUID(), completionReason: 'deadline' as const, status: 'completed' as const, results: ['draw', 'draw'] as const, terminalReasons: ['deadline_timeout', 'deadline_timeout'] as const, expectedEvents: 2 },
  { matchId: randomUUID(), completionReason: 'ready_timeout' as const, status: 'voided' as const, results: ['void', 'void'] as const, terminalReasons: ['no_contest', 'no_contest'] as const, expectedEvents: 0 },
];
const dictionaryId = randomUUID();
const winnerHandle = `t159w_${run}`;
const loserHandle = `t159l_${run}`;
let prisma: PrismaClient | null = null;

async function cleanup(): Promise<void> {
  if (!prisma) return;
  await prisma.match.deleteMany({ where: { id: { in: [matchId, ...immutableIdentityCases.map((scenario) => scenario.matchId)] } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: [winnerId, loserId] } } });
  await prisma.dictionaryRelease.deleteMany({ where: { id: dictionaryId } });
}

describe('Speed rating settlement to authoritative read models (PostgreSQL)', { skip: !enabled }, () => {
  before(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await cleanup();
    await prisma.dictionaryRelease.create({ data: { id: dictionaryId, version: `ticket159-${run}`, locale: 'en-US', sourceLabel: `ticket159-${run}`, status: 'active', releasedAt: new Date() } });
    await prisma.userAccount.create({ data: { id: winnerId, displayName: 'Speed Winner', profile: { create: { publicHandle: winnerHandle } } } });
    await prisma.userAccount.create({ data: { id: loserId, displayName: 'Speed Loser', profile: { create: { publicHandle: loserHandle } } } });
    await prisma.match.create({
      data: {
        id: matchId,
        dictionaryReleaseId: dictionaryId,
        mode: 'ranked',
        rankedMode: 'speed_1v1',
        status: 'completed',
        algorithmConfigVersion: 'speed_1v1_glicko_v1',
        rulesetVersion: 'speed_1v1_v1_75s',
        adjudicationVersion: 'speed_1v1_adjudication_v1',
        adjudicatedAt: new Date(),
        completionReason: 'all_players_terminal',
        idempotencyKey: `ticket159:${run}`,
        startedAt: new Date('2026-07-16T00:00:00.000Z'),
        completedAt: new Date('2026-07-16T00:01:00.000Z'),
        participants: {
          create: [
            { userId: winnerId, seatNumber: 1, outcome: 'solved', finalScore: 0, terminalReason: 'solved', guessesUsed: 4, solveElapsedMs: 24_000, solveTimeBucket: 240, result: 'win' },
            { userId: loserId, seatNumber: 2, outcome: 'solved', finalScore: 9999, terminalReason: 'solved', guessesUsed: 4, solveElapsedMs: 24_100, solveTimeBucket: 241, result: 'loss' },
          ],
        },
      },
    });
  });

  after(async () => {
    await cleanup();
    await prisma?.$disconnect();
  });

  it('settles once and converges across Speed leaderboard, profile, and history reads', async () => {
    const gameplay = new GameplayPersistenceService({ client: prisma! } as any);
    const first = await gameplay.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-16T00:02:00.000Z') });
    const replay = await gameplay.finalizeRankedMatchRatings({ matchId, now: new Date('2026-07-16T00:03:00.000Z') });
    assert.equal(first.ratingEvent?.kind, 'speed_1v1_glicko_v1');
    assert.equal(first.rankedMode, 'speed_1v1');
    assert.equal(first.rulesetVersion, 'speed_1v1_v1_75s');
    assert.equal(first.speedCompletionReason, 'all_players_terminal');
    assert.equal(first.completionReason, 'all_players_terminal');
    assert.equal(first.ratingAlgorithmConfigVersion, 'speed_1v1_glicko_v1');
    assert.deepEqual(first.finalStandings.map((standing) => [standing.result, standing.terminalReason, standing.guessesUsed, standing.solveElapsedMs]), [
      ['win', 'solved', 4, 24_000],
      ['loss', 'solved', 4, 24_100],
    ]);
    assert.deepEqual(replay.ratingEvent, first.ratingEvent);
    assert.equal(await prisma!.ratingEvent.count({ where: { matchId, algorithmConfigVersion: 'speed_1v1_glicko_v1', type: 'apply' } }), 2);
    await prisma!.matchReport.update({
      where: { matchId },
      data: { publicSummary: { matchId, state: 'completed', rankedMode: 'standard_1v1', ratingAlgorithmConfigVersion: 'placement_mmr_v1' } },
    });
    const repaired = await gameplay.getRankedMatchResult(matchId);
    assert.equal(repaired.rankedMode, 'speed_1v1');
    assert.equal(repaired.ratingAlgorithmConfigVersion, 'speed_1v1_glicko_v1');

    const leaderboard = new LeaderboardReadService({ client: prisma! } as any);
    const speedBoard = await leaderboard.listLeaderboard({ mode: 'speed_1v1', limit: 100 });
    const fixtureEntries = speedBoard.entries.filter((entry) => entry.userId === winnerId || entry.userId === loserId);
    assert.equal(speedBoard.algorithm, 'speed_1v1_glicko_v1');
    assert.deepEqual(fixtureEntries.map((entry) => [entry.userId, entry.rating]), [[winnerId, 1514], [loserId, 1486]]);

    const speedProfile = await leaderboard.getRatedProfileByHandle(winnerHandle, { mode: 'speed_1v1' });
    const standardProfile = await leaderboard.getRatedProfileByHandle(winnerHandle, { mode: 'standard_1v1' });
    assert.equal(speedProfile.rating, 1514);
    assert.equal(speedProfile.algorithm, 'speed_1v1_glicko_v1');
    assert.equal(standardProfile.rating, 1500);
    assert.equal(standardProfile.unrated, true);

    const profileRead = new ProfileReadService({ client: prisma! } as any);
    const profile = await profileRead.getPublicProfileSummary(winnerHandle);
    assert.equal(profile.rating.rankedMode, 'standard_1v1');
    assert.equal(profile.ratings.find((rating) => rating.rankedMode === 'speed_1v1')?.rating, 1514);
    const history = await profileRead.listCurrentUserMatchHistory({ userId: winnerId, limit: 10 });
    const item = history.items.find((candidate) => candidate.matchId === matchId)!;
    assert.equal(item.ratingAlgorithm, 'speed_1v1_glicko_v1');
    assert.equal(item.viewer?.ratingDelta, 14);
    assert.equal(item.rankedMode, 'speed_1v1');
    assert.equal(item.rulesetVersion, 'speed_1v1_v1_75s');
    assert.equal(item.speedCompletionReason, 'all_players_terminal');
    assert.equal(item.participants.find((participant) => participant.userId === winnerId)?.solveElapsedMs, 24_000);
  });

  it('keeps persisted forfeit, deadline, and no-contest identity immutable across repeated reads and stale-report repair', async () => {
    const gameplay = new GameplayPersistenceService({ client: prisma! } as any);

    for (const scenario of immutableIdentityCases) {
      await prisma!.match.create({
        data: {
          id: scenario.matchId,
          dictionaryReleaseId: dictionaryId,
          mode: 'ranked',
          rankedMode: 'speed_1v1',
          status: scenario.status,
          algorithmConfigVersion: 'speed_1v1_glicko_v1',
          rulesetVersion: 'speed_1v1_v1_75s',
          adjudicationVersion: 'speed_1v1_adjudication_v1',
          adjudicatedAt: new Date('2026-07-16T00:04:00.000Z'),
          completionReason: scenario.completionReason,
          idempotencyKey: `ticket169:${run}:${scenario.completionReason}`,
          startedAt: new Date('2026-07-16T00:02:00.000Z'),
          completedAt: new Date('2026-07-16T00:04:00.000Z'),
          ...(scenario.status === 'voided' ? { voidedAt: new Date('2026-07-16T00:04:00.000Z'), voidReason: scenario.completionReason } : {}),
          participants: {
            create: [
              { userId: winnerId, seatNumber: 1, outcome: scenario.results[0] === 'void' ? 'voided' : scenario.terminalReasons[0] === 'forfeit' ? 'abandoned' : 'failed', finalScore: 0, terminalReason: scenario.terminalReasons[0], result: scenario.results[0] },
              { userId: loserId, seatNumber: 2, outcome: scenario.results[1] === 'void' ? 'voided' : scenario.terminalReasons[1] === 'awarded_forfeit_win' ? 'solved' : 'failed', finalScore: 0, terminalReason: scenario.terminalReasons[1], result: scenario.results[1] },
            ],
          },
        } as any,
      });

      await gameplay.finalizeRankedMatchRatings({
        matchId: scenario.matchId,
        reason: scenario.status === 'voided' ? 'voided' : scenario.completionReason === 'deadline' ? 'timeout' : 'forfeit',
        now: new Date('2026-07-16T00:05:00.000Z'),
      });
      await prisma!.matchReport.update({
        where: { matchId: scenario.matchId },
        data: { publicSummary: { matchId: scenario.matchId, state: 'completed', completionReason: 'all_players_final' } },
      });

      const firstRead = await gameplay.getRankedMatchResult(scenario.matchId);
      const reportAfterRepair = await prisma!.matchReport.findUniqueOrThrow({ where: { matchId: scenario.matchId } });
      const replay = await gameplay.getRankedMatchResult(scenario.matchId);
      const persistedMatch = await prisma!.match.findUniqueOrThrow({ where: { id: scenario.matchId } }) as unknown as { completionReason: string | null };
      const reportAfterReplay = await prisma!.matchReport.findUniqueOrThrow({ where: { matchId: scenario.matchId } });
      const repairedSummary = reportAfterRepair.publicSummary as { completionReason?: unknown; speedCompletionReason?: unknown };
      const replayedSummary = reportAfterReplay.publicSummary as { completionReason?: unknown; speedCompletionReason?: unknown };

      assert.equal(firstRead.completionReason, scenario.completionReason);
      assert.equal(firstRead.speedCompletionReason, scenario.completionReason);
      assert.equal(persistedMatch.completionReason, scenario.completionReason);
      assert.equal(repairedSummary.completionReason, scenario.completionReason);
      assert.equal(repairedSummary.speedCompletionReason, scenario.completionReason);
      assert.deepEqual(replay, firstRead);
      assert.deepEqual(replayedSummary, repairedSummary);
      assert.equal(await prisma!.ratingEvent.count({ where: { matchId: scenario.matchId, algorithmConfigVersion: 'speed_1v1_glicko_v1', type: 'apply' } }), scenario.expectedEvents);
    }
  });
});
