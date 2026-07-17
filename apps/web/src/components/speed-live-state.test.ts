import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Speed1v1Ticket, SpeedMatchSnapshot } from '@wordle-royale/contracts';
import {
  anchoredServerNow,
  createServerClockAnchor,
  crossedCountdownAnnouncement,
  displayedSeconds,
  remainingSpeedMs,
  retainUncertainGuessRequest,
  reconcileUncertainGuessRequest,
  speedMatchedHref,
  speedPhaseCopy,
  speedQueueResolution,
  speedSnapshotHasGuessOperation,
} from './speed-live-state.ts';

function ticket(state: Speed1v1Ticket['state'], matchedMatchId: string | null = null): Speed1v1Ticket {
  return {
    ticketId: 'not-a-route-id', state, mode: 'speed_1v1', rated: true, userId: 'user-1',
    ratingAtQueue: 1500, provisional: true,
    searchWindow: { minRating: 1300, maxRating: 1700, expansionStep: 0 },
    estimatedWaitSeconds: 4, matchedMatchId, matchedOpponent: null, createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z', expiresAt: '2026-07-16T12:05:00.000Z',
    cancelledAt: null, timedOutAt: null,
  };
}

function snapshot(state: SpeedMatchSnapshot['state'], overrides: Partial<SpeedMatchSnapshot> = {}): SpeedMatchSnapshot {
  return {
    matchId: 'match-1', roundId: 'round-1', mode: 'speed_1v1', rulesetVersion: 'speed_1v1_v1_75s', state,
    serverTime: '2026-07-16T12:00:00.000Z', readyDeadlineAt: '2026-07-16T12:00:20.000Z',
    startsAt: '2026-07-16T12:00:03.000Z', deadlineAt: '2026-07-16T12:01:18.000Z',
    timeControl: { roundTimeMs: 75_000, solveTimeBucketMs: 100, maxGuesses: 6 },
    readiness: { viewerReady: false, readyCount: 0 },
    myState: { acceptedGuesses: [], terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null },
    opponentProgress: { acceptedGuessCount: 0, terminal: false },
    ...overrides,
  };
}

describe('Speed queue identity', () => {
  it('keeps Speed queue state and matched navigation separate', () => {
    const queued = ticket('queued');
    const matched = ticket('matched', 'speed match / 1');
    assert.equal(speedQueueResolution({ status: 'connected', apiUrl: 'x', data: queued, requestId: 'r', error: null }).state, 'searching');
    assert.equal(speedMatchedHref(matched), '/play?matchId=speed%20match%20%2F%201#speed-gameplay');
    assert.equal(speedMatchedHref(ticket('queued', 'must-not-route')), null);
  });
});

describe('viewer guess operation correlation', () => {
  it('distinguishes retries and repeated words by client request id', () => {
    const state = snapshot('in_progress', {
      myState: {
        acceptedGuesses: [{
          clientRequestId: '11111111-1111-4111-8111-111111111111',
          guess: 'crane',
          guessNumber: 1,
          feedback: ['c', 'r', 'a', 'n', 'e'].map((letter) => ({ letter, state: 'absent' as const })),
          submittedAt: '2026-07-16T12:00:06.000Z',
        }, {
          clientRequestId: '22222222-2222-4222-8222-222222222222',
          guess: 'crane',
          guessNumber: 2,
          feedback: ['c', 'r', 'a', 'n', 'e'].map((letter) => ({ letter, state: 'absent' as const })),
          submittedAt: '2026-07-16T12:00:07.000Z',
        }],
        terminalReason: null,
        guessesUsed: null,
        solveElapsedMs: null,
        result: null,
      },
    });
    assert.equal(speedSnapshotHasGuessOperation(state, '11111111-1111-4111-8111-111111111111'), true);
    assert.equal(speedSnapshotHasGuessOperation(state, '22222222-2222-4222-8222-222222222222'), true);
    assert.equal(speedSnapshotHasGuessOperation(state, '33333333-3333-4333-8333-333333333333'), false);
  });

  it('retains the uncertain operation across input changes and clears only its exact authoritative operation', () => {
    const second = { id: '22222222-2222-4222-8222-222222222222', guess: 'crane' };
    assert.equal(retainUncertainGuessRequest(second, 'slate', () => 'must-not-run'), second);

    const earlierOnly = snapshot('in_progress', {
      myState: {
        acceptedGuesses: [{
          clientRequestId: '11111111-1111-4111-8111-111111111111', guess: 'crane', guessNumber: 1,
          feedback: [], submittedAt: '2026-07-16T12:00:06.000Z',
        }],
        terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null,
      },
    });
    assert.equal(reconcileUncertainGuessRequest(earlierOnly, second), second);

    const committedSecond = snapshot('in_progress', {
      myState: {
        acceptedGuesses: [
          ...earlierOnly.myState.acceptedGuesses,
          { clientRequestId: second.id, guess: 'crane', guessNumber: 2, feedback: [], submittedAt: '2026-07-16T12:00:07.000Z' },
        ],
        terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null,
      },
    });
    assert.equal(reconcileUncertainGuessRequest(committedSecond, second), null);
  });
});

describe('server-synchronized Speed clock', () => {
  it('uses monotonic elapsed time instead of browser wall clock', () => {
    const anchor = createServerClockAnchor('2026-07-16T12:00:00.000Z', 500)!;
    assert.equal(anchoredServerNow(anchor, 2_500), Date.parse('2026-07-16T12:00:02.000Z'));
    assert.equal(remainingSpeedMs(snapshot('countdown'), anchor, 2_500), 1_000);
    assert.equal(displayedSeconds(1_001), 2);
  });

  it('re-anchors to fresh authoritative snapshots and never displays negative time', () => {
    const first = createServerClockAnchor('2026-07-16T12:00:00.000Z', 10)!;
    const corrected = createServerClockAnchor('2026-07-16T12:00:02.800Z', 1_000)!;
    assert.equal(remainingSpeedMs(snapshot('countdown'), first, 1_010), 2_000);
    assert.equal(remainingSpeedMs(snapshot('countdown'), corrected, 1_000), 200);
    assert.equal(remainingSpeedMs(snapshot('countdown'), corrected, 2_000), 0);
  });

  it('announces only meaningful thresholds', () => {
    assert.equal(crossedCountdownAnnouncement(31, 30), 30);
    assert.equal(crossedCountdownAnnouncement(11, 9), 10);
    assert.equal(crossedCountdownAnnouncement(6, 5), 5);
    assert.equal(crossedCountdownAnnouncement(1, 0), 0);
    assert.equal(crossedCountdownAnnouncement(29, 28), null);
  });

  it('uses truthful ready, countdown, expiry, and void copy', () => {
    assert.match(speedPhaseCopy(snapshot('waiting_ready'), 12).message, /server deadline/i);
    assert.match(speedPhaseCopy(snapshot('countdown'), 3).message, /server-synchronized/i);
    assert.match(speedPhaseCopy(snapshot('finalizing'), 0).message, /browser does not decide/i);
    assert.match(speedPhaseCopy(snapshot('voided'), 0).message, /No Speed rating/i);
  });
});
