import { scoreGuess, STANDARD_MAX_GUESSES, STANDARD_WORD_LENGTH } from '@wordle-royale/game-engine';
import {
  createPracticeState,
  PRACTICE_ANSWERS,
  PRACTICE_VALID_GUESSES,
  practiceReducer,
  type PracticeState,
} from './practice-game.ts';

export const PRACTICE_ROUND_STORAGE_KEY = 'wordle-royale:practice:round:v1';
export const PRACTICE_STATS_STORAGE_KEY = 'wordle-royale:practice:stats:v1';
export const PRACTICE_STORAGE_VERSION = 1;
export const MAX_ROUND_STORAGE_BYTES = 12_000;
export const MAX_STATS_STORAGE_BYTES = 16_000;

const ROUND_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const ANSWERS = new Set<string>(PRACTICE_ANSWERS);
const FEEDBACK_STATES = new Set(['absent', 'present', 'correct']);
const DISTRIBUTION_KEYS = ['1', '2', '3', '4', '5', '6'] as const;

type DistributionKey = (typeof DISTRIBUTION_KEYS)[number];

export interface PracticeSession {
  game: PracticeState;
  roundId: string;
  roundSequence: number;
  recorded: boolean;
}

export interface PracticeStats {
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  distribution: Record<DistributionKey, number>;
  /** Highest sequence allocated in this browser's single-tab Practice history. */
  highestRoundSequence: number;
  /** A durable high watermark: stats reset deliberately never lowers this value. */
  highestRecordedSequence: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserStorageGlobalLike {
  readonly localStorage?: StorageLike | null;
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

export interface PracticeCopyOutcome {
  status: string;
  manualCopyText: string | null;
}

/** Accessing the localStorage property itself can throw a SecurityError. */
export function getBrowserStorage(globalLike: BrowserStorageGlobalLike): StorageLike | null {
  try {
    return globalLike.localStorage ?? null;
  } catch {
    return null;
  }
}

export function emptyPracticeStats(highestRoundSequence = 0, highestRecordedSequence = 0): PracticeStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    currentStreak: 0,
    bestStreak: 0,
    distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0 },
    highestRoundSequence,
    highestRecordedSequence,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isBoundedInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function validRoundId(value: unknown): value is string {
  return typeof value === 'string' && ROUND_ID_PATTERN.test(value);
}

function discard(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable (privacy mode/security policy). The game still works in memory.
  }
}

function readJson(storage: StorageLike | null, key: string, maximumBytes: number): unknown | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  if (raw.length > maximumBytes) {
    discard(storage, key);
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    discard(storage, key);
    return null;
  }
}

function deriveGame(answer: string, currentGuess: string, rows: unknown[]): PracticeState | null {
  let game = createPracticeState(answer);
  for (const rawRow of rows) {
    if (!isPlainRecord(rawRow) || !hasExactKeys(rawRow, ['guess', 'feedback'])) return null;
    if (typeof rawRow.guess !== 'string' || !PRACTICE_VALID_GUESSES.has(rawRow.guess)) return null;
    if (!Array.isArray(rawRow.feedback) || rawRow.feedback.length !== STANDARD_WORD_LENGTH) return null;

    const expected = scoreGuess(answer, rawRow.guess);
    const feedbackIsExact = rawRow.feedback.every((cell, index) => {
      if (!isPlainRecord(cell) || !hasExactKeys(cell, ['letter', 'state'])) return false;
      const expectedCell = expected[index];
      return expectedCell !== undefined
        && cell.letter === expectedCell.letter
        && cell.state === expectedCell.state
        && FEEDBACK_STATES.has(String(cell.state));
    });
    if (!feedbackIsExact || game.status !== 'playing') return null;

    for (const letter of rawRow.guess) game = practiceReducer(game, { type: 'letter', letter });
    game = practiceReducer(game, { type: 'submit' });
  }

  if (!/^[a-z]{0,5}$/.test(currentGuess)) return null;
  if (game.status !== 'playing' && currentGuess !== '') return null;
  if (game.status === 'playing') {
    for (const letter of currentGuess) game = practiceReducer(game, { type: 'letter', letter });
  }
  return game;
}

export function parsePracticeSession(raw: unknown): PracticeSession | null {
  if (!isPlainRecord(raw) || !hasExactKeys(raw, ['version', 'roundId', 'roundSequence', 'answer', 'currentGuess', 'rows', 'recorded'])) return null;
  if (raw.version !== PRACTICE_STORAGE_VERSION || !validRoundId(raw.roundId) || !isBoundedInteger(raw.roundSequence) || raw.roundSequence < 1 || typeof raw.recorded !== 'boolean') return null;
  if (typeof raw.answer !== 'string' || !ANSWERS.has(raw.answer)) return null;
  if (typeof raw.currentGuess !== 'string' || !Array.isArray(raw.rows) || raw.rows.length > STANDARD_MAX_GUESSES) return null;
  const game = deriveGame(raw.answer, raw.currentGuess, raw.rows);
  if (!game) return null;
  const terminal = game.status === 'won' || game.status === 'lost';
  // recorded is a receipt assertion, so an active game can never truthfully carry it.
  if (raw.recorded && !terminal) return null;
  return { game, roundId: raw.roundId, roundSequence: raw.roundSequence, recorded: raw.recorded };
}

export function serializePracticeSession(session: PracticeSession): string {
  return JSON.stringify({
    version: PRACTICE_STORAGE_VERSION,
    roundId: session.roundId,
    roundSequence: session.roundSequence,
    answer: session.game.answer,
    currentGuess: session.game.currentGuess,
    rows: session.game.rows,
    recorded: session.recorded,
  });
}

export function loadPracticeSession(storage: StorageLike | null): PracticeSession | null {
  const parsed = readJson(storage, PRACTICE_ROUND_STORAGE_KEY, MAX_ROUND_STORAGE_BYTES);
  if (parsed === null) return null;
  const session = parsePracticeSession(parsed);
  if (!session) discard(storage, PRACTICE_ROUND_STORAGE_KEY);
  return session;
}

export function savePracticeSession(storage: StorageLike | null, session: PracticeSession): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PRACTICE_ROUND_STORAGE_KEY, serializePracticeSession(session));
    return true;
  } catch {
    return false;
  }
}

export function parsePracticeStats(raw: unknown): PracticeStats | null {
  const keys = ['version', 'gamesPlayed', 'wins', 'currentStreak', 'bestStreak', 'distribution', 'highestRoundSequence', 'highestRecordedSequence'];
  if (!isPlainRecord(raw) || !hasExactKeys(raw, keys)) return null;
  if (raw.version !== PRACTICE_STORAGE_VERSION) return null;
  if (!isBoundedInteger(raw.gamesPlayed) || !isBoundedInteger(raw.wins, raw.gamesPlayed)) return null;
  if (!isBoundedInteger(raw.currentStreak, raw.wins) || !isBoundedInteger(raw.bestStreak, raw.wins) || raw.currentStreak > raw.bestStreak) return null;
  if (!isBoundedInteger(raw.highestRoundSequence) || !isBoundedInteger(raw.highestRecordedSequence, raw.highestRoundSequence)) return null;
  if (!isPlainRecord(raw.distribution) || !hasExactKeys(raw.distribution, DISTRIBUTION_KEYS)) return null;

  const distribution = emptyPracticeStats().distribution;
  let distributedWins = 0;
  for (const key of DISTRIBUTION_KEYS) {
    const count = raw.distribution[key];
    if (!isBoundedInteger(count, raw.wins)) return null;
    distribution[key] = count;
    distributedWins += count;
  }
  if (distributedWins !== raw.wins) return null;

  return {
    gamesPlayed: raw.gamesPlayed,
    wins: raw.wins,
    currentStreak: raw.currentStreak,
    bestStreak: raw.bestStreak,
    distribution,
    highestRoundSequence: raw.highestRoundSequence,
    highestRecordedSequence: raw.highestRecordedSequence,
  };
}

export function serializePracticeStats(stats: PracticeStats): string {
  return JSON.stringify({ version: PRACTICE_STORAGE_VERSION, ...stats });
}

export function loadPracticeStats(storage: StorageLike | null): PracticeStats {
  const parsed = readJson(storage, PRACTICE_STATS_STORAGE_KEY, MAX_STATS_STORAGE_BYTES);
  if (parsed === null) return emptyPracticeStats();
  const stats = parsePracticeStats(parsed);
  if (!stats) discard(storage, PRACTICE_STATS_STORAGE_KEY);
  return stats ?? emptyPracticeStats();
}

export function savePracticeStats(storage: StorageLike | null, stats: PracticeStats): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PRACTICE_STATS_STORAGE_KEY, serializePracticeStats(stats));
    return true;
  } catch {
    return false;
  }
}

export function allocatePracticeRound(stats: PracticeStats): { stats: PracticeStats; roundSequence: number } | null {
  if (stats.highestRoundSequence >= Number.MAX_SAFE_INTEGER) return null;
  const roundSequence = stats.highestRoundSequence + 1;
  return { stats: { ...stats, highestRoundSequence: roundSequence }, roundSequence };
}

/**
 * Loads the two records as one continuity unit. Practice is intentionally single-tab:
 * a high watermark prevents every old local round from being counted again, while an
 * out-of-order completion from another tab is ignored rather than double-counted.
 */
export function hydratePracticeContinuity(storage: StorageLike | null): { stats: PracticeStats; session: PracticeSession | null } {
  let stats = loadPracticeStats(storage);
  const session = loadPracticeSession(storage);
  if (!session) return { stats, session: null };

  if (session.recorded && session.roundSequence > stats.highestRecordedSequence) {
    discard(storage, PRACTICE_ROUND_STORAGE_KEY);
    return { stats, session: null };
  }
  if (session.game.status === 'playing' && session.roundSequence <= stats.highestRecordedSequence) {
    discard(storage, PRACTICE_ROUND_STORAGE_KEY);
    return { stats, session: null };
  }
  if (session.roundSequence > stats.highestRoundSequence) {
    stats = { ...stats, highestRoundSequence: session.roundSequence };
    savePracticeStats(storage, stats);
  }
  return { stats, session };
}

export function recordPracticeResult(
  stats: PracticeStats,
  roundId: string,
  roundSequence: number,
  result: 'won' | 'lost',
  guesses: number,
): PracticeStats {
  if (!validRoundId(roundId) || !isBoundedInteger(roundSequence, stats.highestRoundSequence) || roundSequence < 1 || roundSequence <= stats.highestRecordedSequence) return stats;
  const won = result === 'won' && guesses >= 1 && guesses <= STANDARD_MAX_GUESSES;
  const currentStreak = won ? stats.currentStreak + 1 : 0;
  const distribution = { ...stats.distribution };
  if (won) distribution[String(guesses) as DistributionKey] += 1;
  return {
    ...stats,
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (won ? 1 : 0),
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    distribution,
    highestRecordedSequence: roundSequence,
  };
}

export function resetPracticeStats(stats: PracticeStats, protectThroughSequence = stats.highestRecordedSequence): PracticeStats {
  const protectedSequence = isBoundedInteger(protectThroughSequence, stats.highestRoundSequence)
    ? Math.max(stats.highestRecordedSequence, protectThroughSequence)
    : stats.highestRecordedSequence;
  return emptyPracticeStats(stats.highestRoundSequence, protectedSequence);
}

export function practiceWinPercentage(stats: PracticeStats): number {
  return stats.gamesPlayed === 0 ? 0 : Math.round((stats.wins / stats.gamesPlayed) * 100);
}

export function formatPracticeShare(game: PracticeState): string | null {
  if (game.status === 'playing') return null;
  const score = game.status === 'won' ? String(game.rows.length) : 'X';
  const grid = game.rows.map((row) => row.feedback.map((cell) => (
    cell.state === 'correct' ? '🟩' : cell.state === 'present' ? '🟨' : '⬛'
  )).join('')).join('\n');
  return `Wordle Practice ${score}/${STANDARD_MAX_GUESSES}\n\n${grid}`;
}

export async function copyPracticeResult(clipboard: ClipboardLike | undefined, text: string, timeoutMs = 2_000): Promise<boolean> {
  if (!clipboard) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      clipboard.writeText(text).then(() => true, () => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function copyPracticeResultOutcome(
  clipboard: ClipboardLike | undefined,
  text: string,
  timeoutMs = 2_000,
): Promise<PracticeCopyOutcome> {
  return await copyPracticeResult(clipboard, text, timeoutMs)
    ? { status: 'Result copied.', manualCopyText: null }
    : { status: 'Could not copy. Manual copy is available below.', manualCopyText: text };
}

export async function copyPracticeResultStatus(clipboard: ClipboardLike | undefined, text: string): Promise<string> {
  return (await copyPracticeResultOutcome(clipboard, text)).status;
}

export type StartOverConfirmation = 'idle' | 'confirming';
export type StartOverConfirmationAction = 'request' | 'cancel' | 'complete';

export function reduceStartOverConfirmation(state: StartOverConfirmation, action: StartOverConfirmationAction): StartOverConfirmation {
  if (action === 'request') return 'confirming';
  if (action === 'cancel' || action === 'complete') return 'idle';
  return state;
}
