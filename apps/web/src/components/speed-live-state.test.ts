import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Speed1v1Ticket, SpeedMatchSnapshot } from '@wordle-royale/contracts';
import {
  anchoredServerNow,
  createNonRegressingServerClockAnchor,
  createServerClockAnchor,
  crossedCountdownAnnouncement,
  displayedSeconds,
  remainingSpeedMs,
  retainUncertainGuessRequest,
  reconcileUncertainGuessRequest,
  speedMatchedHref,
  speedPhaseCopy,
  speedQueueResolution,
  speedReadyOperationConfirmed,
  speedRetryIsSafe,
  speedSnapshotHasGuessOperation,
  shouldApplySpeedSnapshot,
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
    matchId: 'match-1', roundId: 'round-1', mode: 'speed_1v1', rulesetVersion: 'speed_1v1_v1_75s',
    readyLifecycleVersion: 'speed_ready_v1_match_created_20s', state,
    serverTime: '2026-07-16T12:00:00.000Z', readyDeadlineAt: '2026-07-16T12:00:20.000Z',
    startsAt: '2026-07-16T12:00:03.000Z', deadlineAt: '2026-07-16T12:01:18.000Z',
    timeControl: { roundTimeMs: 75_000, solveTimeBucketMs: 100, maxGuesses: 6 },
    readiness: { phase: 'legacy', viewerReady: false, readyCount: 0, viewerReadyAt: null, viewerReadyOperationId: null },
    myState: { acceptedGuesses: [], terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null },
    opponentProgress: { acceptedGuessCount: 0, terminal: false },
    ...overrides,
  } as unknown as SpeedMatchSnapshot;
}

function snapshotV2(
  state: 'waiting_invitation' | 'waiting_opponent_ready' | 'countdown' | 'in_progress' | 'finalizing' | 'completed' | 'voided',
  overrides: Record<string, unknown> = {},
): SpeedMatchSnapshot {
  return {
    ...snapshot('countdown'),
    readyLifecycleVersion: 'speed_ready_v2_first_ack_90s',
    state,
    invitationExpiresAt: '2026-07-16T12:01:30.000Z',
    readyWindowStartedAt: null,
    readyDeadlineAt: null,
    startsAt: null,
    deadlineAt: null,
    readiness: { phase: 'invitation', viewerReady: false, readyCount: 0, viewerReadyAt: null, viewerReadyOperationId: null },
    ...overrides,
  } as SpeedMatchSnapshot;
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
  it('distinguishes the 90-second invitation from the first-ready 20-second phase', () => {
    const invitation = snapshotV2('waiting_invitation');
    assert.equal(remainingSpeedMs(invitation, createServerClockAnchor(invitation.serverTime, 0)!, 0), 90_000);
    assert.match(speedPhaseCopy(invitation, 90).title, /invitation/i);

    const opponentReady = snapshotV2('waiting_opponent_ready', {
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 1, viewerReadyAt: null, viewerReadyOperationId: null },
    });
    assert.equal(remainingSpeedMs(opponentReady, createServerClockAnchor(opponentReady.serverTime, 0)!, 0), 20_000);
    assert.match(speedPhaseCopy(opponentReady, 20).message, /opponent.*ready|20-second/i);
  });

  it('confirms ready by exact operation identity and fences older late snapshots', () => {
    const current = snapshotV2('waiting_opponent_ready', {
      serverTime: '2026-07-16T12:00:10.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: 'ready-B' },
    });
    assert.equal(speedReadyOperationConfirmed(current, 'ready-A'), false);
    assert.equal(speedReadyOperationConfirmed(current, 'ready-B'), true);
    assert.equal(shouldApplySpeedSnapshot(current, snapshotV2('waiting_invitation', { serverTime: '2026-07-16T12:00:08.000Z' })), false);
    const advanced = snapshotV2('countdown', {
      serverTime: '2026-07-16T12:00:11.000Z',
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      startsAt: '2026-07-16T12:00:13.000Z',
      readiness: { ...current.readiness, phase: 'locked', readyCount: 2 },
    });
    assert.equal(shouldApplySpeedSnapshot(current, advanced), true);
  });

  it('fences equal-time and later-timestamp lifecycle regressions with local response generations', () => {
    const countdown = snapshotV2('countdown', {
      serverTime: '2026-07-16T12:00:10.000Z',
      readiness: { phase: 'locked', viewerReady: true, readyCount: 2, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: null },
    });
    const staleWaiting = snapshotV2('waiting_opponent_ready', {
      serverTime: '2026-07-16T12:00:10.000Z',
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
    });
    assert.equal(shouldApplySpeedSnapshot(countdown, staleWaiting, 3, 2), false, 'an older request generation cannot win');
    assert.equal(shouldApplySpeedSnapshot(countdown, staleWaiting, 3, 4), false, 'a later response cannot regress the lifecycle at equal server time');
    assert.equal(shouldApplySpeedSnapshot(countdown, { ...staleWaiting, serverTime: '2026-07-16T12:00:11.000Z' }, 3, 4), false, 'lifecycle ordering remains monotonic even with a later timestamp');
    assert.equal(shouldApplySpeedSnapshot(snapshot('in_progress', { serverTime: '2026-07-16T12:00:12.000Z' }), snapshot('completed', { serverTime: '2026-07-16T12:00:13.000Z' }), 5, 4), false, 'an older-generation terminal mutation response cannot overwrite newer state');
    assert.equal(shouldApplySpeedSnapshot(staleWaiting, snapshotV2('countdown', {
      serverTime: '2026-07-16T12:00:11.000Z',
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      startsAt: '2026-07-16T12:00:13.000Z',
      readiness: { phase: 'locked', viewerReady: true, readyCount: 2, viewerReadyAt: '2026-07-16T12:00:10.000Z', viewerReadyOperationId: null },
    }), 4, 5), true);
  });

  it('rejects regressive and contradictory readiness phases even when another field advances', () => {
    const invitation = snapshotV2('waiting_invitation');
    const opponentReady = snapshotV2('waiting_opponent_ready', {
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 1, viewerReadyAt: null, viewerReadyOperationId: null },
    });
    const locked = snapshotV2('countdown', {
      startsAt: '2026-07-16T12:00:03.000Z',
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'locked', viewerReady: true, readyCount: 2, viewerReadyAt: '2026-07-16T12:00:01.000Z', viewerReadyOperationId: 'ready-A' },
    });

    assert.equal(shouldApplySpeedSnapshot(invitation, { ...opponentReady, serverTime: invitation.serverTime }, 1, 2), true, 'invitation to opponent-ready is valid');
    assert.equal(shouldApplySpeedSnapshot(opponentReady, { ...locked, serverTime: '2026-07-16T12:00:01.000Z' }, 2, 3), true, 'opponent-ready to locked countdown is valid');
    assert.equal(shouldApplySpeedSnapshot(opponentReady, snapshotV2('waiting_opponent_ready', {
      serverTime: opponentReady.serverTime,
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'invitation', viewerReady: false, readyCount: 2, viewerReadyAt: null, viewerReadyOperationId: null },
    }), 2, 3), false, 'ready-count growth cannot legalize a phase regression');

    const invalidCombinations: SpeedMatchSnapshot[] = [
      snapshotV2('waiting_invitation', { readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 0, viewerReadyAt: null, viewerReadyOperationId: null } }),
      snapshotV2('waiting_opponent_ready', { readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 2, viewerReadyAt: null, viewerReadyOperationId: null } }),
      snapshotV2('countdown', { readiness: { phase: 'locked', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:01.000Z', viewerReadyOperationId: null } }),
      snapshotV2('in_progress', { readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:01.000Z', viewerReadyOperationId: null } }),
      snapshotV2('waiting_opponent_ready', { readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: null, viewerReadyOperationId: null } }),
    ];
    for (const invalid of invalidCombinations) {
      assert.equal(shouldApplySpeedSnapshot(invitation, invalid, 1, 2), false, `${invalid.state}/${invalid.readiness.phase}/${invalid.readiness.readyCount} must fail closed`);
    }
  });

  it('rejects equal-time readiness rollback and correlation replacement within one phase', () => {
    const current = snapshotV2('waiting_opponent_ready', {
      serverTime: '2026-07-16T12:00:10.000Z',
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: 'ready-A' },
    });
    const rollback = snapshotV2('waiting_opponent_ready', {
      serverTime: current.serverTime,
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 0, viewerReadyAt: null, viewerReadyOperationId: null },
    });
    assert.equal(shouldApplySpeedSnapshot(current, rollback, 4, 5), false);
    assert.equal(shouldApplySpeedSnapshot(current, current, 4, 5), false, 'an equal-time duplicate cannot reset the server clock anchor');
    assert.equal(shouldApplySpeedSnapshot(current, snapshotV2('waiting_opponent_ready', {
      serverTime: current.serverTime,
      readyWindowStartedAt: '2026-07-16T12:00:00.000Z',
      readyDeadlineAt: '2026-07-16T12:00:20.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: 'ready-B' },
    }), 4, 5), false, 'equal-time operation truth cannot be replaced');
  });

  it('rejects accepted-guess, deadline, and terminal truth regressions', () => {
    const accepted = {
      clientRequestId: '11111111-1111-4111-8111-111111111111', guess: 'crane', guessNumber: 1,
      feedback: [], submittedAt: '2026-07-16T12:00:06.000Z',
    };
    const playing = snapshot('in_progress', {
      myState: { acceptedGuesses: [accepted], terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null },
    });
    assert.equal(shouldApplySpeedSnapshot(playing, snapshot('in_progress'), 2, 3), false, 'accepted operations cannot disappear');
    assert.equal(shouldApplySpeedSnapshot(playing, snapshot('in_progress', {
      deadlineAt: '2026-07-16T12:01:19.000Z',
      myState: playing.myState,
    }), 2, 3), false, 'an established deadline cannot change');
    const countdown = snapshot('countdown');
    assert.equal(shouldApplySpeedSnapshot(countdown, snapshot('countdown', {
      startsAt: '2026-07-16T12:00:04.000Z',
    }), 2, 3), false, 'an established start instant cannot change');

    const progressed = snapshot('in_progress', {
      myState: {
        acceptedGuesses: [accepted, {
          clientRequestId: '22222222-2222-4222-8222-222222222222', guess: 'slate', guessNumber: 2,
          feedback: [], submittedAt: '2026-07-16T12:00:07.000Z',
        }],
        terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null,
      },
    });
    assert.equal(shouldApplySpeedSnapshot(playing, progressed, 2, 3), true, 'real authoritative operation-set growth is preserved');

    const terminal = snapshot('completed', {
      myState: { acceptedGuesses: [accepted], terminalReason: 'forfeit', guessesUsed: 1, solveElapsedMs: null, result: 'loss' },
      opponentProgress: { acceptedGuessCount: 2, terminal: true },
    });
    assert.equal(shouldApplySpeedSnapshot(terminal, snapshot('completed', {
      myState: { acceptedGuesses: [accepted], terminalReason: null, guessesUsed: null, solveElapsedMs: null, result: null },
      opponentProgress: { acceptedGuessCount: 1, terminal: false },
    }), 8, 9), false, 'terminal participant and opponent truth cannot roll back');
    assert.equal(shouldApplySpeedSnapshot(terminal, snapshot('voided', {
      myState: terminal.myState,
      opponentProgress: terminal.opponentProgress,
    }), 8, 9), false, 'one terminal state cannot be replaced by another');
  });

  it('confirms a lost ready response after reveal only when exact correlation is unavailable', () => {
    const startedWithoutCorrelation = snapshotV2('countdown', {
      readiness: { phase: 'locked', viewerReady: true, readyCount: 2, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: null },
    });
    assert.equal(speedReadyOperationConfirmed(startedWithoutCorrelation, 'ready-lost'), true);
    assert.equal(speedReadyOperationConfirmed(snapshotV2('waiting_opponent_ready', {
      readiness: { phase: 'opponent_ready', viewerReady: true, readyCount: 1, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: null },
    }), 'ready-lost'), false, 'waiting states still require exact operation correlation');
    assert.equal(speedReadyOperationConfirmed(snapshotV2('countdown', {
      readiness: { phase: 'locked', viewerReady: true, readyCount: 2, viewerReadyAt: '2026-07-16T12:00:09.000Z', viewerReadyOperationId: 'different-ready' },
    }), 'ready-lost'), false, 'a mismatched available identity cannot use the fallback');
  });

  it('exposes retry only after definitive settlement, successful absence proof, and a currently open deadline', () => {
    const open = snapshotV2('waiting_invitation');
    const requestId = 'ready-lost';
    const anchor = createServerClockAnchor(open.serverTime, 100)!;
    const evidence = { successful: true, snapshot: open, anchor };
    assert.equal(speedRetryIsSafe('ready', requestId, 'pending', evidence, 100), false, 'a POST that may still commit is never retryable');
    assert.equal(speedRetryIsSafe('ready', requestId, 'definitive', { successful: false, snapshot: null, anchor: null }, 100), false, 'failed recovery cannot prove absence');
    assert.equal(speedRetryIsSafe('ready', requestId, 'definitive', evidence, 100), true);
    assert.equal(speedRetryIsSafe('ready', requestId, 'definitive', evidence, 90_100), false, 'delayed rendering fails closed at deadline equality');
    assert.equal(speedRetryIsSafe('ready', requestId, 'definitive', evidence, 90_101), false, 'tab suspension and late clicks fail closed after expiry');
    const oneMillisecond = snapshotV2('waiting_invitation', { invitationExpiresAt: '2026-07-16T12:00:00.001Z' });
    const staleEvidence = { successful: true, snapshot: oneMillisecond, anchor: createServerClockAnchor(oneMillisecond.serverTime, 500) };
    assert.equal(speedRetryIsSafe('ready', requestId, 'definitive', staleEvidence, 502), false, 'a stale one-millisecond recovery response cannot expose retry');
    const playing = snapshot('in_progress');
    assert.equal(speedRetryIsSafe('forfeit', requestId, 'definitive', { successful: true, snapshot: playing, anchor: createServerClockAnchor(playing.serverTime, 100) }, 100), false, 'public state has no exact forfeit operation absence proof');
  });

  it('uses monotonic elapsed time instead of browser wall clock', () => {
    const anchor = createServerClockAnchor('2026-07-16T12:00:00.000Z', 500)!;
    assert.equal(anchoredServerNow(anchor, 2_500), Date.parse('2026-07-16T12:00:02.000Z'));
    assert.equal(remainingSpeedMs(snapshot('countdown'), anchor, 2_500), 1_000);
    assert.equal(displayedSeconds(1_001), 2);
  });

  it('preserves the prior authoritative-time lower bound across delayed progressive responses', () => {
    const previous = createServerClockAnchor('2026-07-16T12:00:00.000Z', 0)!;
    const delayed = snapshotV2('waiting_opponent_ready', {
      serverTime: '2026-07-16T12:00:05.000Z',
      readyWindowStartedAt: '2026-07-16T11:59:49.000Z',
      readyDeadlineAt: '2026-07-16T12:00:09.000Z',
      readiness: { phase: 'opponent_ready', viewerReady: false, readyCount: 1, viewerReadyAt: null, viewerReadyOperationId: null },
    });
    const effective = createNonRegressingServerClockAnchor(previous, delayed.serverTime, 10_000)!;

    assert.equal(effective.serverEpochMs, Date.parse('2026-07-16T12:00:10.000Z'), 'receipt preserves the already-proven lower bound');
    assert.equal(speedRetryIsSafe('ready', 'ready-lost', 'definitive', { successful: true, snapshot: delayed, anchor: effective }, 10_000), false, 'render cannot reopen a closed deadline');
    assert.equal(speedRetryIsSafe('ready', 'ready-lost', 'definitive', { successful: true, snapshot: delayed, anchor: effective }, 10_001), false, 'a forced late dispatch remains closed');

    const exactBoundary = createNonRegressingServerClockAnchor(
      createServerClockAnchor('2026-07-16T12:00:00.000Z', 0),
      '2026-07-16T12:00:04.000Z',
      9_000,
    )!;
    assert.equal(speedRetryIsSafe('ready', 'ready-lost', 'definitive', { successful: true, snapshot: delayed, anchor: exactBoundary }, 9_000), false, 'deadline equality is closed');

    const freshAhead = createNonRegressingServerClockAnchor(previous, '2026-07-16T12:00:12.000Z', 10_000)!;
    assert.equal(freshAhead.serverEpochMs, Date.parse('2026-07-16T12:00:12.000Z'), 'a genuinely newer server lower bound still advances the clock');
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
