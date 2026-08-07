import { STANDARD_MAX_GUESSES } from '@wordle-royale/game-engine';
import { parseChallengeId } from './challenge-id.ts';
import {
  createPracticeState,
  PRACTICE_VALID_GUESSES,
  practiceReducer,
  type PracticeState,
} from './practice-game.ts';
import type { BrowserStorageGlobalLike, StorageLike } from './practice-persistence.ts';

export const CHALLENGE_STORAGE_VERSION = 1;
export const CHALLENGE_ROUND_STORAGE_PREFIX = 'wordle-royale:challenge:round:v1:';
export const MAX_CHALLENGE_STORAGE_BYTES = 12_000;

export interface ChallengeCompletionReceipt {
  challengeId: string;
  result: 'won' | 'lost';
  guessCount: number;
}

export interface ChallengeSession {
  challengeId: string;
  game: PracticeState;
  completion: ChallengeCompletionReceipt | null;
}

interface StoredChallengeRound {
  version: 1;
  challengeId: string;
  currentGuess: string;
  guesses: string[];
  completion: ChallengeCompletionReceipt | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function equalReceipt(left: ChallengeCompletionReceipt | null, right: ChallengeCompletionReceipt | null): boolean {
  return left === null
    ? right === null
    : right !== null
      && left.challengeId === right.challengeId
      && left.result === right.result
      && left.guessCount === right.guessCount;
}

export function challengeRoundStorageKey(challengeId: string): string | null {
  const decoded = parseChallengeId(challengeId);
  return decoded.ok ? `${CHALLENGE_ROUND_STORAGE_PREFIX}${decoded.challengeId}` : null;
}

/** Accessing localStorage itself may throw under browser security policies. */
export function getChallengeBrowserStorage(globalLike: BrowserStorageGlobalLike): StorageLike | null {
  try {
    return globalLike.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A deterministic terminal receipt; repeated derivation has the same value. */
export function deriveChallengeCompletion(
  challengeId: string,
  game: PracticeState,
): ChallengeCompletionReceipt | null {
  const decoded = parseChallengeId(challengeId);
  if (!decoded.ok || game.answer !== decoded.answer || game.status === 'playing') return null;
  return { challengeId: decoded.challengeId, result: game.status, guessCount: game.rows.length };
}

export function createChallengeSession(challengeId: string): ChallengeSession | null {
  const decoded = parseChallengeId(challengeId);
  if (!decoded.ok) return null;
  return { challengeId: decoded.challengeId, game: createPracticeState(decoded.answer), completion: null };
}

function parseReceipt(raw: unknown): ChallengeCompletionReceipt | null | undefined {
  if (raw === null) return null;
  if (!isPlainRecord(raw) || !hasExactKeys(raw, ['challengeId', 'result', 'guessCount'])) return undefined;
  if (typeof raw.challengeId !== 'string' || (raw.result !== 'won' && raw.result !== 'lost')) return undefined;
  if (!Number.isInteger(raw.guessCount) || (raw.guessCount as number) < 1 || (raw.guessCount as number) > STANDARD_MAX_GUESSES) return undefined;
  return raw as unknown as ChallengeCompletionReceipt;
}

function replay(answer: string, guesses: readonly string[], currentGuess: string): PracticeState | null {
  let game = createPracticeState(answer);
  for (const guess of guesses) {
    if (!/^[a-z]{5}$/.test(guess) || !PRACTICE_VALID_GUESSES.has(guess) || game.status !== 'playing') return null;
    for (const letter of guess) game = practiceReducer(game, { type: 'letter', letter });
    game = practiceReducer(game, { type: 'submit' });
    if (game.rows.at(-1)?.guess !== guess) return null;
  }
  if (!/^[a-z]{0,5}$/.test(currentGuess)) return null;
  if (game.status !== 'playing' && currentGuess !== '') return null;
  if (game.status === 'playing') {
    for (const letter of currentGuess) game = practiceReducer(game, { type: 'letter', letter });
  }
  return game;
}

export function parseChallengeSession(raw: unknown, expectedChallengeId: string): ChallengeSession | null {
  const expected = parseChallengeId(expectedChallengeId);
  if (!expected.ok || !isPlainRecord(raw)
    || !hasExactKeys(raw, ['version', 'challengeId', 'currentGuess', 'guesses', 'completion'])) return null;
  if (raw.version !== CHALLENGE_STORAGE_VERSION || raw.challengeId !== expected.challengeId
    || typeof raw.currentGuess !== 'string' || !Array.isArray(raw.guesses)
    || raw.guesses.length > STANDARD_MAX_GUESSES || !raw.guesses.every((guess) => typeof guess === 'string')) return null;
  const receipt = parseReceipt(raw.completion);
  if (receipt === undefined) return null;
  const game = replay(expected.answer, raw.guesses as string[], raw.currentGuess);
  if (!game) return null;
  const derived = deriveChallengeCompletion(expected.challengeId, game);
  if (!equalReceipt(receipt, derived)) return null;
  return { challengeId: expected.challengeId, game, completion: derived };
}

export function serializeChallengeSession(session: ChallengeSession): string {
  const completion = deriveChallengeCompletion(session.challengeId, session.game);
  const payload: StoredChallengeRound = {
    version: CHALLENGE_STORAGE_VERSION,
    challengeId: session.challengeId,
    currentGuess: session.game.currentGuess,
    guesses: session.game.rows.map((row) => row.guess),
    completion,
  };
  return JSON.stringify(payload);
}

function discard(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try { storage.removeItem(key); } catch { /* Challenge play remains available in memory. */ }
}

export function loadChallengeSession(storage: StorageLike | null, challengeId: string): ChallengeSession | null {
  const key = challengeRoundStorageKey(challengeId);
  if (!storage || !key) return null;
  let raw: string | null;
  try { raw = storage.getItem(key); } catch { return null; }
  if (raw === null) return null;
  // Check code units first so a hostile large value is never copied into an
  // encoder; then enforce the actual UTF-8 byte contract for non-ASCII input.
  if (raw.length > MAX_CHALLENGE_STORAGE_BYTES
    || new TextEncoder().encode(raw).byteLength > MAX_CHALLENGE_STORAGE_BYTES) {
    discard(storage, key);
    return null;
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch {
    discard(storage, key);
    return null;
  }
  const session = parseChallengeSession(parsed, challengeId);
  if (!session) discard(storage, key);
  return session;
}

export function saveChallengeSession(storage: StorageLike | null, session: ChallengeSession): boolean {
  const key = challengeRoundStorageKey(session.challengeId);
  const decoded = parseChallengeId(session.challengeId);
  if (!storage || !key || !decoded.ok || session.game.answer !== decoded.answer) return false;
  // Receipts are always derived during serialization. Refuse fabricated game
  // state by requiring it to equal the reducer replay that will be loaded.
  const serialized = serializeChallengeSession(session);
  const parsed = parseChallengeSession(JSON.parse(serialized) as unknown, session.challengeId);
  if (!parsed || JSON.stringify(parsed.game) !== JSON.stringify(session.game)) return false;
  try {
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removeChallengeSession(storage: StorageLike | null, challengeId: string): boolean {
  const key = challengeRoundStorageKey(challengeId);
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function buildChallengeUrl(origin: string, challengeId: string): string | null {
  const decoded = parseChallengeId(challengeId);
  if (!decoded.ok) return null;
  try {
    const url = new URL(`/challenge/${decoded.challengeId}`, origin);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** Terminal-only, spoiler-free share text for an asynchronous local round. */
export function formatChallengeShare(
  session: ChallengeSession,
  origin: string,
): string | null {
  const completion = deriveChallengeCompletion(session.challengeId, session.game);
  const url = buildChallengeUrl(origin, session.challengeId);
  if (!completion || !url) return null;
  const score = completion.result === 'won' ? String(completion.guessCount) : 'X';
  const grid = session.game.rows.map((row) => row.feedback.map((cell) => (
    cell.state === 'correct' ? '🟩' : cell.state === 'present' ? '🟨' : '⬛'
  )).join('')).join('\n');
  return `Wordle Challenge ${score}/${STANDARD_MAX_GUESSES}\n${url}\n\n${grid}\n\nAsync · local · unrated`;
}
