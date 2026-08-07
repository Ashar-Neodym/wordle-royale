import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPracticeState, practiceReducer, type PracticeState } from './practice-game.ts';
import {
  allocatePracticeRound,
  copyPracticeResult,
  copyPracticeResultOutcome,
  copyPracticeResultStatus,
  emptyPracticeStats,
  formatPracticeShare,
  getBrowserStorage,
  hydratePracticeContinuity,
  loadPracticeSession,
  loadPracticeStats,
  MAX_ROUND_STORAGE_BYTES,
  parsePracticeSession,
  parsePracticeStats,
  PRACTICE_ROUND_STORAGE_KEY,
  PRACTICE_STATS_STORAGE_KEY,
  practiceWinPercentage,
  recordPracticeResult,
  reduceStartOverConfirmation,
  resetPracticeStats,
  savePracticeSession,
  savePracticeStats,
  serializePracticeSession,
  serializePracticeStats,
  type PracticeSession,
  type PracticeStats,
  type StorageLike,
} from './practice-persistence.ts';

const ROUND_A = 'round_1234567890abcdef';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  removed: string[] = [];
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.removed.push(key); this.values.delete(key); }
}

function submit(state: PracticeState, guess: string): PracticeState {
  for (const letter of guess) state = practiceReducer(state, { type: 'letter', letter });
  return practiceReducer(state, { type: 'submit' });
}

function session(game = createPracticeState('crane'), roundSequence = 1, recorded = false): PracticeSession {
  return { game, roundId: ROUND_A, roundSequence, recorded };
}

function storedRound(game = createPracticeState('crane'), roundSequence = 1, recorded = false): Record<string, unknown> {
  return JSON.parse(serializePracticeSession(session(game, roundSequence, recorded))) as Record<string, unknown>;
}

function allocate(stats: PracticeStats): { stats: PracticeStats; sequence: number } {
  const allocation = allocatePracticeRound(stats);
  assert.ok(allocation);
  return { stats: allocation.stats, sequence: allocation.roundSequence };
}

describe('practice round persistence', () => {
  it('round-trips valid active, crash-recovery, and recorded terminal rounds with recomputed state', () => {
    const storage = new MemoryStorage();
    const active = session(submit(createPracticeState('crane'), 'slate'));
    assert.equal(savePracticeSession(storage, active), true);
    assert.deepEqual(loadPracticeSession(storage), active);

    const won = submit(active.game, 'crane');
    assert.deepEqual(parsePracticeSession(storedRound(won, 1, false)), session(won, 1, false));
    assert.deepEqual(parsePracticeSession(storedRound(won, 1, true)), session(won, 1, true));
  });

  it('restores the current typed input as well as submitted guesses', () => {
    let game = submit(createPracticeState('crane'), 'slate');
    for (const letter of 'pla') game = practiceReducer(game, { type: 'letter', letter });
    const restored = parsePracticeSession(storedRound(game));
    assert.equal(restored?.game.currentGuess, 'pla');
    assert.equal(restored?.game.rows[0]?.guess, 'slate');
  });

  it('discards malformed JSON and oversized input before parsing', () => {
    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_ROUND_STORAGE_KEY, '{bad');
    assert.equal(loadPracticeSession(storage), null);
    assert.deepEqual(storage.removed, [PRACTICE_ROUND_STORAGE_KEY]);

    storage.values.set(PRACTICE_ROUND_STORAGE_KEY, 'x'.repeat(MAX_ROUND_STORAGE_BYTES + 1));
    assert.equal(loadPracticeSession(storage), null);
    assert.equal(storage.removed.length, 2);
  });

  it('rejects unknown versions, extra fields, and invalid sequences', () => {
    assert.equal(parsePracticeSession({ ...storedRound(), version: 2 }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), surprise: true }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), roundSequence: 0 }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), roundSequence: 1.5 }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), roundSequence: Number.MAX_SAFE_INTEGER + 1 }), null);
  });

  it('rejects invalid answers, guesses, current input, and round IDs', () => {
    assert.equal(parsePracticeSession({ ...storedRound(), answer: 'zzzzz' }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), currentGuess: 'ABC' }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), currentGuess: 'abcdef' }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), roundId: 'short' }), null);

    const played = storedRound(submit(createPracticeState('crane'), 'slate'));
    const rows = structuredClone(played.rows) as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], guess: 'zzzzz' };
    assert.equal(parsePracticeSession({ ...played, rows }), null);
  });

  it('never trusts tampered feedback', () => {
    const played = storedRound(submit(createPracticeState('crane'), 'slate'));
    const rows = structuredClone(played.rows) as Array<{ feedback: Array<Record<string, unknown>> }>;
    rows[0]!.feedback[0]!.state = 'correct';
    assert.equal(parsePracticeSession({ ...played, rows }), null);
  });

  it('rejects impossible continuation, terminal input, and permanently rejects active+recorded', () => {
    const won = storedRound(submit(createPracticeState('crane'), 'crane'));
    const extra = storedRound(submit(createPracticeState('crane'), 'slate')).rows as unknown[];
    assert.equal(parsePracticeSession({ ...won, rows: [...(won.rows as unknown[]), ...extra] }), null);
    assert.equal(parsePracticeSession({ ...won, currentGuess: 'a' }), null);
    assert.equal(parsePracticeSession({ ...storedRound(), recorded: true }), null);
  });

  it('catches a hostile localStorage property getter before evaluating storage methods', () => {
    let getterCalls = 0;
    const hostile = Object.defineProperty({}, 'localStorage', {
      get() { getterCalls += 1; throw new DOMException('blocked', 'SecurityError'); },
    });
    assert.equal(getBrowserStorage(hostile), null);
    assert.equal(getterCalls, 1);
    assert.equal(loadPracticeSession(null), null);
    assert.deepEqual(loadPracticeStats(null), emptyPracticeStats());
    assert.equal(savePracticeSession(null, session()), false);
    assert.equal(savePracticeStats(null, emptyPracticeStats()), false);
  });

  it('handles method- and quota-blocked storage without throwing', () => {
    const unavailable: StorageLike = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    assert.equal(loadPracticeSession(unavailable), null);
    assert.deepEqual(loadPracticeStats(unavailable), emptyPracticeStats());
    assert.equal(savePracticeSession(unavailable, session()), false);
    assert.equal(savePracticeStats(unavailable, emptyPracticeStats()), false);
  });

  it('hydrates a valid pair, repairs session-first issuance, and rejects impossible pair state', () => {
    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_STATS_STORAGE_KEY, serializePracticeStats(emptyPracticeStats()));
    storage.values.set(PRACTICE_ROUND_STORAGE_KEY, serializePracticeSession(session(createPracticeState('crane'), 4)));
    const repaired = hydratePracticeContinuity(storage);
    assert.equal(repaired.session?.roundSequence, 4);
    assert.equal(repaired.stats.highestRoundSequence, 4);
    assert.equal(loadPracticeStats(storage).highestRoundSequence, 4);

    const counted = { ...emptyPracticeStats(4, 4) };
    storage.values.set(PRACTICE_STATS_STORAGE_KEY, serializePracticeStats(counted));
    storage.values.set(PRACTICE_ROUND_STORAGE_KEY, serializePracticeSession(session(createPracticeState('crane'), 2)));
    assert.equal(hydratePracticeContinuity(storage).session, null);
  });
});

describe('local practice stats', () => {
  it('records wins, losses, win streaks, and guess distribution', () => {
    let stats = emptyPracticeStats();
    let issued = allocate(stats); stats = issued.stats;
    stats = recordPracticeResult(stats, ROUND_A, issued.sequence, 'won', 3);
    issued = allocate(stats); stats = issued.stats;
    stats = recordPracticeResult(stats, 'round_2234567890abcdef', issued.sequence, 'won', 1);
    assert.deepEqual(
      { played: stats.gamesPlayed, wins: stats.wins, streak: stats.currentStreak, best: stats.bestStreak, distribution: stats.distribution },
      { played: 2, wins: 2, streak: 2, best: 2, distribution: { '1': 1, '2': 0, '3': 1, '4': 0, '5': 0, '6': 0 } },
    );
    issued = allocate(stats); stats = issued.stats;
    stats = recordPracticeResult(stats, 'round_3234567890abcdef', issued.sequence, 'lost', 6);
    assert.equal(stats.gamesPlayed, 3);
    assert.equal(stats.currentStreak, 0);
    assert.equal(stats.bestStreak, 2);
    assert.equal(practiceWinPercentage(stats), 67);
  });

  it('updates a terminal round exactly once when recording is called twice', () => {
    const issued = allocate(emptyPracticeStats());
    const once = recordPracticeResult(issued.stats, ROUND_A, issued.sequence, 'won', 2);
    assert.equal(recordPracticeResult(once, ROUND_A, issued.sequence, 'won', 2), once);
  });

  it('has no receipt-eviction false negative after far beyond the prior 100-round bound', () => {
    let stats = emptyPracticeStats();
    let oldestSequence = 0;
    for (let index = 0; index < 275; index += 1) {
      const issued = allocate(stats); stats = issued.stats;
      if (index === 0) oldestSequence = issued.sequence;
      stats = recordPracticeResult(stats, `round_${String(index).padStart(16, '0')}`, issued.sequence, 'lost', 6);
    }
    assert.equal(stats.gamesPlayed, 275);
    const replayed = recordPracticeResult(stats, 'round_0000000000000000', oldestSequence, 'won', 1);
    assert.equal(replayed, stats);
    assert.equal(stats.gamesPlayed, 275);
  });

  it('preserves idempotence protection across stats reset for current and old rounds', () => {
    const first = allocate(emptyPracticeStats());
    const counted = recordPracticeResult(first.stats, ROUND_A, first.sequence, 'won', 2);
    const cleared = resetPracticeStats(counted);
    assert.equal(cleared.gamesPlayed, 0);
    assert.equal(cleared.highestRecordedSequence, first.sequence);
    assert.equal(recordPracticeResult(cleared, ROUND_A, first.sequence, 'won', 2), cleared);

    const second = allocate(cleared);
    const next = recordPracticeResult(second.stats, 'round_2234567890abcdef', second.sequence, 'lost', 6);
    assert.equal(next.gamesPlayed, 1);
    assert.equal(next.highestRecordedSequence, second.sequence);
  });

  it('protects a current terminal round when reset wins the race with recording', () => {
    const issued = allocate(emptyPracticeStats());
    const cleared = resetPracticeStats(issued.stats, issued.sequence);
    assert.equal(cleared.highestRecordedSequence, issued.sequence);
    assert.equal(recordPracticeResult(cleared, ROUND_A, issued.sequence, 'won', 1), cleared);
  });

  it('strictly validates persisted stats and safely discards corruption', () => {
    const issued = allocate(emptyPracticeStats());
    const valid = recordPracticeResult(issued.stats, ROUND_A, issued.sequence, 'won', 4);
    assert.deepEqual(parsePracticeStats({ version: 1, ...valid }), valid);
    assert.equal(parsePracticeStats({ version: 1, ...valid, extra: true }), null);
    assert.equal(parsePracticeStats({ version: 2, ...valid }), null);
    assert.equal(parsePracticeStats({ version: 1, ...valid, wins: 2 }), null);
    assert.equal(parsePracticeStats({ version: 1, ...valid, highestRecordedSequence: valid.highestRoundSequence + 1 }), null);
    assert.equal(parsePracticeStats({ version: 1, ...valid, highestRoundSequence: 1.2 }), null);

    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_STATS_STORAGE_KEY, JSON.stringify({ version: 1, ...valid, highestRecordedSequence: -1 }));
    assert.deepEqual(loadPracticeStats(storage), emptyPracticeStats());
    assert.deepEqual(storage.removed, [PRACTICE_STATS_STORAGE_KEY]);
  });
});

describe('runtime-oriented practice actions', () => {
  it('moves start-over through explicit request, cancel, and completion states', () => {
    assert.equal(reduceStartOverConfirmation('idle', 'request'), 'confirming');
    assert.equal(reduceStartOverConfirmation('confirming', 'cancel'), 'idle');
    assert.equal(reduceStartOverConfirmation('confirming', 'complete'), 'idle');
  });

  it('offers the exact payload for manual copy when the Clipboard API is missing or rejects', async () => {
    const rejected = { writeText: async () => { throw new Error('denied'); } };
    const expected = { status: 'Could not copy. Manual copy is available below.', manualCopyText: 'result' };
    assert.deepEqual(await copyPracticeResultOutcome(undefined, 'result'), expected);
    assert.deepEqual(await copyPracticeResultOutcome(rejected, 'result'), expected);
    assert.equal(await copyPracticeResultStatus(rejected, 'result'), expected.status);
    assert.equal(await copyPracticeResult(undefined, 'result'), false);
    let copied = '';
    assert.equal(await copyPracticeResult({ writeText: async (text) => { copied = text; } }, 'result'), true);
    assert.equal(copied, 'result');
  });

  it('times out a clipboard write that never settles', async () => {
    const pending = { writeText: async () => await new Promise<void>(() => undefined) };
    assert.equal(await copyPracticeResult(pending, 'result', 5), false);
    assert.deepEqual(await copyPracticeResultOutcome(pending, 'result', 5), {
      status: 'Could not copy. Manual copy is available below.',
      manualCopyText: 'result',
    });
  });

  it('does not expose a manual fallback after successful copy', async () => {
    let copied = '';
    assert.deepEqual(await copyPracticeResultOutcome({ writeText: async (text) => { copied = text; } }, 'safe share'), {
      status: 'Result copied.',
      manualCopyText: null,
    });
    assert.equal(copied, 'safe share');
  });
});

describe('spoiler-free practice sharing', () => {
  it('formats wins and losses with emoji grids and no answer', () => {
    const win = submit(submit(createPracticeState('crane'), 'slate'), 'crane');
    const winText = formatPracticeShare(win);
    assert.match(winText ?? '', /^Wordle Practice 2\/6\n\n[🟩🟨⬛]{5}\n🟩🟩🟩🟩🟩$/u);
    assert.doesNotMatch(winText ?? '', /crane/i);

    let loss = createPracticeState('apple');
    for (const guess of ['crane', 'sound', 'light', 'civic', 'bloom', 'chair']) loss = submit(loss, guess);
    const lossText = formatPracticeShare(loss);
    assert.match(lossText ?? '', /^Wordle Practice X\/6\n\n/u);
    assert.equal((lossText ?? '').split('\n').length, 8);
    assert.doesNotMatch(lossText ?? '', /apple/i);
  });

  it('does not format an active round', () => {
    assert.equal(formatPracticeShare(createPracticeState('crane')), null);
  });

  it('uses the same spoiler-free share payload for a failed copy fallback', async () => {
    const win = submit(submit(createPracticeState('crane'), 'slate'), 'crane');
    const share = formatPracticeShare(win);
    assert.ok(share);
    const outcome = await copyPracticeResultOutcome(undefined, share);
    assert.equal(outcome.manualCopyText, share);
    assert.doesNotMatch(outcome.manualCopyText ?? '', /crane/i);
  });
});
