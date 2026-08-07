import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatChallengeId } from './challenge-id.ts';
import {
  buildChallengeUrl,
  CHALLENGE_ROUND_STORAGE_PREFIX,
  createChallengeSession,
  deriveChallengeCompletion,
  formatChallengeShare,
  getChallengeBrowserStorage,
  loadChallengeSession,
  MAX_CHALLENGE_STORAGE_BYTES,
  parseChallengeSession,
  removeChallengeSession,
  saveChallengeSession,
  serializeChallengeSession,
  type ChallengeSession,
} from './challenge-persistence.ts';
import { practiceReducer, type PracticeState } from './practice-game.ts';
import {
  PRACTICE_ROUND_STORAGE_KEY,
  PRACTICE_STATS_STORAGE_KEY,
  type StorageLike,
} from './practice-persistence.ts';

const CRANE_ID = formatChallengeId(7);
const OTHER_ID = formatChallengeId(8);

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  readonly read: string[] = [];
  readonly written: string[] = [];
  readonly removed: string[] = [];
  getItem(key: string): string | null { this.read.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.written.push(key); this.values.set(key, value); }
  removeItem(key: string): void { this.removed.push(key); this.values.delete(key); }
}

function submit(game: PracticeState, guess: string): PracticeState {
  for (const letter of guess) game = practiceReducer(game, { type: 'letter', letter });
  return practiceReducer(game, { type: 'submit' });
}

function sessionWith(game: PracticeState): ChallengeSession {
  return { challengeId: CRANE_ID, game, completion: deriveChallengeCompletion(CRANE_ID, game) };
}

function fresh(): ChallengeSession {
  const session = createChallengeSession(CRANE_ID);
  if (!session) throw new Error('golden challenge ID must decode');
  return session;
}

function payload(session: ChallengeSession): Record<string, unknown> {
  return JSON.parse(serializeChallengeSession(session)) as Record<string, unknown>;
}

describe('isolated challenge persistence', () => {
  it('round-trips active, win, and loss states by replaying guesses and feedback', () => {
    const storage = new MemoryStorage();
    let activeGame = submit(fresh().game, 'slate');
    for (const letter of 'pla') activeGame = practiceReducer(activeGame, { type: 'letter', letter });
    const active = sessionWith(activeGame);
    assert.equal(saveChallengeSession(storage, active), true);
    assert.deepEqual(loadChallengeSession(storage, CRANE_ID), active);
    assert.deepEqual(active.game.rows[0]?.feedback.map((cell) => cell.state), ['absent', 'absent', 'correct', 'absent', 'correct']);

    const won = sessionWith(submit(submit(fresh().game, 'slate'), 'crane'));
    assert.deepEqual(parseChallengeSession(payload(won), CRANE_ID), won);
    assert.deepEqual(won.completion, { challengeId: CRANE_ID, result: 'won', guessCount: 2 });
    // Saving derives the same receipt even when the caller has not yet observed it.
    assert.equal(saveChallengeSession(storage, { ...won, completion: null }), true);
    assert.deepEqual(loadChallengeSession(storage, CRANE_ID)?.completion, won.completion);

    let lossGame = fresh().game;
    for (const guess of ['slate', 'bloom', 'civic', 'sound', 'light', 'chair']) lossGame = submit(lossGame, guess);
    const lost = sessionWith(lossGame);
    assert.equal(lost.game.status, 'lost');
    assert.deepEqual(parseChallengeSession(payload(lost), CRANE_ID), lost);
    assert.deepEqual(lost.completion, { challengeId: CRANE_ID, result: 'lost', guessCount: 6 });
  });

  it('serializes only the exact safe payload keys, with guesses but no answer or feedback fields', () => {
    const played = sessionWith(submit(fresh().game, 'slate'));
    const raw = serializeChallengeSession(played);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), ['version', 'challengeId', 'currentGuess', 'guesses', 'completion']);
    assert.deepEqual(parsed.guesses, ['slate']);
    assert.equal(Object.hasOwn(parsed, 'answer'), false);
    assert.equal(Object.hasOwn(parsed, 'feedback'), false);
    assert.doesNotMatch(raw, /"answer"|"feedback"/);
  });

  it('rejects mismatched IDs plus extra and missing payload keys', () => {
    const valid = payload(fresh());
    assert.equal(parseChallengeSession(valid, OTHER_ID), null);
    assert.equal(parseChallengeSession({ ...valid, challengeId: OTHER_ID }, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...valid, extra: true }, CRANE_ID), null);
    const { guesses: _guesses, ...missing } = valid;
    assert.equal(parseChallengeSession(missing, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...valid, version: 2 }, CRANE_ID), null);
  });

  it('rejects malformed guesses, current input, impossible continuation, and terminal input', () => {
    const active = payload(fresh());
    for (const guesses of [['zzzzz'], ['CRANE'], ['four'], new Array(7).fill('slate')]) {
      assert.equal(parseChallengeSession({ ...active, guesses }, CRANE_ID), null);
    }
    for (const currentGuess of ['ABC', 'abcdef', 'a1']) {
      assert.equal(parseChallengeSession({ ...active, currentGuess }, CRANE_ID), null);
    }
    const won = payload(sessionWith(submit(fresh().game, 'crane')));
    assert.equal(parseChallengeSession({ ...won, guesses: ['crane', 'slate'] }, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...won, currentGuess: 'a' }, CRANE_ID), null);
  });

  it('rejects false, absent, malformed, and mismatched completion receipts', () => {
    const active = payload(fresh());
    const falseReceipt = { challengeId: CRANE_ID, result: 'won', guessCount: 1 };
    assert.equal(parseChallengeSession({ ...active, completion: falseReceipt }, CRANE_ID), null);
    const won = payload(sessionWith(submit(fresh().game, 'crane')));
    assert.equal(parseChallengeSession({ ...won, completion: null }, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...won, completion: { ...falseReceipt, guessCount: 2 } }, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...won, completion: { ...falseReceipt, extra: true } }, CRANE_ID), null);
    assert.equal(parseChallengeSession({ ...won, completion: { ...falseReceipt, challengeId: OTHER_ID } }, CRANE_ID), null);
  });

  it('derives terminal completion idempotently and never creates aggregate challenge stats', () => {
    const game = submit(fresh().game, 'crane');
    const first = deriveChallengeCompletion(CRANE_ID, game);
    const second = deriveChallengeCompletion(CRANE_ID, game);
    assert.deepEqual(first, second);
    assert.deepEqual(Object.keys(first ?? {}), ['challengeId', 'result', 'guessCount']);
    assert.equal(deriveChallengeCompletion(CRANE_ID, fresh().game), null);
  });

  it('pre-bounds and removes corrupt data without touching another challenge', () => {
    const storage = new MemoryStorage();
    const key = `${CHALLENGE_ROUND_STORAGE_PREFIX}${CRANE_ID}`;
    const otherKey = `${CHALLENGE_ROUND_STORAGE_PREFIX}${OTHER_ID}`;
    storage.values.set(key, '{bad');
    storage.values.set(otherKey, 'preserve');
    assert.equal(loadChallengeSession(storage, CRANE_ID), null);
    assert.deepEqual(storage.removed, [key]);
    assert.equal(storage.values.get(otherKey), 'preserve');

    storage.values.set(key, 'x'.repeat(MAX_CHALLENGE_STORAGE_BYTES + 1));
    assert.equal(loadChallengeSession(storage, CRANE_ID), null);
    assert.deepEqual(storage.removed, [key, key]);

    storage.values.set(key, '😀'.repeat((MAX_CHALLENGE_STORAGE_BYTES / 4) + 1));
    assert.equal(loadChallengeSession(storage, CRANE_ID), null);
    assert.deepEqual(storage.removed, [key, key, key]);
  });

  it('keeps all reads, writes, and removals isolated from Practice storage', () => {
    const storage = new MemoryStorage();
    storage.values.set(PRACTICE_ROUND_STORAGE_KEY, 'practice-round');
    storage.values.set(PRACTICE_STATS_STORAGE_KEY, 'practice-stats');
    const session = fresh();
    assert.equal(saveChallengeSession(storage, session), true);
    assert.deepEqual(loadChallengeSession(storage, CRANE_ID), session);
    assert.equal(removeChallengeSession(storage, CRANE_ID), true);
    const touched = [...storage.read, ...storage.written, ...storage.removed];
    assert.ok(touched.every((key) => key.startsWith(CHALLENGE_ROUND_STORAGE_PREFIX)));
    assert.equal(storage.values.get(PRACTICE_ROUND_STORAGE_KEY), 'practice-round');
    assert.equal(storage.values.get(PRACTICE_STATS_STORAGE_KEY), 'practice-stats');
  });

  it('catches hostile property access, storage methods, and quota failures', () => {
    let getterCalls = 0;
    const globalLike = Object.defineProperty({}, 'localStorage', {
      get() { getterCalls += 1; throw new DOMException('blocked', 'SecurityError'); },
    });
    assert.equal(getChallengeBrowserStorage(globalLike), null);
    assert.equal(getterCalls, 1);

    const hostile: StorageLike = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    assert.equal(loadChallengeSession(hostile, CRANE_ID), null);
    assert.equal(saveChallengeSession(hostile, fresh()), false);
    assert.equal(removeChallengeSession(hostile, CRANE_ID), false);
    assert.equal(loadChallengeSession(null, CRANE_ID), null);
    assert.equal(saveChallengeSession(null, fresh()), false);
  });

  it('does not evaluate storage for malformed or unsupported IDs', () => {
    const storage = new MemoryStorage();
    assert.equal(loadChallengeSession(storage, 'bad'), null);
    assert.equal(removeChallengeSession(storage, 'c02-00000000-c4'), false);
    assert.deepEqual([...storage.read, ...storage.removed], []);
  });
});

describe('spoiler-free challenge sharing', () => {
  it('builds a stable canonical challenge URL', () => {
    assert.equal(buildChallengeUrl('https://play.example.test/old?x=1#hash', CRANE_ID), `https://play.example.test/challenge/${CRANE_ID}`);
    assert.equal(buildChallengeUrl('not a url', CRANE_ID), null);
    assert.equal(buildChallengeUrl('https://play.example.test', 'BAD'), null);
  });

  it('shares terminal wins and losses only, with URL, grid, and local unrated metadata', () => {
    const active = fresh();
    assert.equal(formatChallengeShare(active, 'https://play.example.test'), null);
    const win = sessionWith(submit(submit(active.game, 'slate'), 'crane'));
    const text = formatChallengeShare(win, 'https://play.example.test');
    assert.match(text ?? '', new RegExp(`^Wordle Challenge 2/6\\nhttps://play\\.example\\.test/challenge/${CRANE_ID}\\n\\n[🟩🟨⬛]{5}\\n🟩{5}\\n\\nAsync · local · unrated$`, 'u'));
    for (const spoiler of ['crane', 'slate']) assert.doesNotMatch(text ?? '', new RegExp(spoiler, 'i'));

    let lossGame = active.game;
    for (const guess of ['slate', 'bloom', 'civic', 'sound', 'light', 'chair']) lossGame = submit(lossGame, guess);
    const loss = formatChallengeShare(sessionWith(lossGame), 'https://play.example.test');
    assert.match(loss ?? '', /^Wordle Challenge X\/6\n/u);
    for (const spoiler of ['crane', 'slate', 'bloom', 'civic', 'sound', 'light', 'chair']) {
      assert.doesNotMatch(loss ?? '', new RegExp(spoiler, 'i'));
    }
  });
});
