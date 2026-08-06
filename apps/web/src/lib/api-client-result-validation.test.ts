import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  completeRankedMatch,
  getRankedMatchResult,
  HOSTED_READ_POLICY,
} from './api-client.ts';

const matchId = '00000000-0000-4000-8000-000000000201';
const userA = '00000000-0000-4000-8000-000000000202';
const userB = '00000000-0000-4000-8000-000000000203';

function canonicalResult() {
  return {
    matchId,
    state: 'completed' as const,
    rankedMode: 'standard_1v1' as const,
    completedAt: '2026-08-06T12:00:00.000Z',
    completionReason: 'all_players_final' as const,
    finalStandings: [
      { userId: userA, placement: 1, totalScore: 171, roundsSolved: 1, totalValidGuesses: 3, totalSolveMs: 45_000 },
      { userId: userB, placement: 2, totalScore: 120, roundsSolved: 1, totalValidGuesses: 5, totalSolveMs: 90_000 },
    ],
    ratingEvent: null,
    resultActions: {
      rematch: { available: false as const, reason: 'not_implemented' as const, label: 'Create rematch lobby' },
      share: { spoilerSafe: true as const, text: 'Ranked result', path: `/matches/${matchId}` },
      links: {
        matchHref: `/matches/${matchId}`,
        historyHref: '/history' as const,
        leaderboardHref: '/leaderboard' as const,
        nextRankedHref: '/lobbies?mode=ranked&status=waiting' as const,
        profileHrefTemplate: '/profile/{handle}' as const,
      },
    },
  };
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, error: null, requestId: 'result-validation-201' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function withoutReadRetryDelay<T>(run: () => Promise<T>): Promise<T> {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    return originalSetTimeout(handler, timeout === HOSTED_READ_POLICY.retryDelayMs ? 0 : timeout, ...args);
  }) as typeof globalThis.setTimeout;
  try {
    return await run();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

describe('ranked result API boundary validation', () => {
  it('rejects 200 result envelopes with external or malformed action links before rendering can consume them', async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const links of [
        { matchHref: 'https://attacker.example/matches/fake' },
        { nextRankedHref: 'javascript:alert(1)' },
      ]) {
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          const result = canonicalResult();
          return success({
            ...result,
            resultActions: {
              ...result.resultActions,
              links: { ...result.resultActions.links, ...links },
            },
          });
        };

        const result = await withoutReadRetryDelay(() => getRankedMatchResult(matchId));
        assert.equal(result.status, 'unavailable');
        assert.equal(result.data, null);
        assert.equal(result.errorCode, 'api_success_payload_noncanonical');
        assert.equal(calls, HOSTED_READ_POLICY.maxAttempts);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps a canonical ranked result connected and available to render', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return success(canonicalResult()); };
    try {
      const result = await getRankedMatchResult(matchId);
      assert.equal(result.status, 'connected');
      assert.equal(result.data?.resultActions.links.matchHref, `/matches/${matchId}`);
      assert.equal(result.data?.resultActions.links.nextRankedHref, '/lobbies?mode=ranked&status=waiting');
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('also rejects a noncanonical result returned directly by completion', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      const result = canonicalResult();
      return success({
        ...result,
        resultActions: {
          ...result.resultActions,
          links: { ...result.resultActions.links, matchHref: '//attacker.example/result' },
        },
      });
    };
    try {
      const result = await completeRankedMatch({
        clientRequestId: '00000000-0000-4000-8000-000000000204',
        matchId,
        reason: 'all_players_final',
      });
      assert.equal(result.status, 'unavailable');
      assert.equal(result.data, null);
      assert.equal(result.errorCode, 'api_success_payload_noncanonical');
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
