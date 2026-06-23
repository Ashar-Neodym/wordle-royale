export type LetterFeedbackState = 'correct' | 'present' | 'absent';

export interface LetterFeedback {
  letter: string;
  state: LetterFeedbackState;
}

export type GuessRejectReason =
  | 'empty'
  | 'wrong_length'
  | 'invalid_characters'
  | 'not_in_dictionary'
  | 'banned_word';

export interface ValidateGuessInput {
  guess: string;
  wordLength?: number;
  validGuesses?: ReadonlySet<string> | readonly string[];
  bannedWords?: ReadonlySet<string> | readonly string[];
  allowAsciiOnly?: boolean;
}

export type ValidateGuessResult =
  | { valid: true; normalized: string }
  | { valid: false; normalized: string; reason: GuessRejectReason };

export interface RoundScoreInput {
  solved: boolean;
  validGuessCount: number;
  roundTimeMs: number;
  elapsedMs: number;
}

export interface RoundScoreBreakdown {
  base: number;
  guessBonus: number;
  speedBonus: number;
  penalty: number;
  adjustment: number;
  total: number;
  scoringPreset: 'standard_v1';
}

export interface ParticipantScoreSummary {
  userId: string;
  totalScore: number;
  roundsSolved: number;
  totalValidGuesses: number;
  totalSolveMs: number;
  finalRound?: {
    state: 'solved' | 'failed' | 'timed_out' | 'forfeited' | 'voided';
    validGuessCount: number;
    solveMs: number | null;
    roundScore: number;
  };
  bestRoundScore: number;
}

export interface FinalStanding extends ParticipantScoreSummary {
  placement: number;
  placementGroup: number;
  tied: boolean;
}

export interface RatedParticipant {
  userId: string;
  rating: number;
  provisional?: boolean;
}

export interface RatingConfig {
  establishedK?: number;
  provisionalK?: number;
  establishedDeltaCap?: number;
  provisionalDeltaCap?: number;
}

export interface RatingDelta {
  userId: string;
  ratingBefore: number;
  delta: number;
  ratingAfter: number;
  provisional: boolean;
}

export const STANDARD_WORD_LENGTH = 5;
export const STANDARD_MAX_GUESSES = 6;
export const STANDARD_SCORING_PRESET = 'standard_v1' as const;

const GUESS_BONUS_BY_COUNT = new Map<number, number>([
  [1, 60],
  [2, 50],
  [3, 40],
  [4, 25],
  [5, 10],
  [6, 0],
]);

export function normalizeWord(input: string): string {
  return input.trim().toLowerCase();
}

function toReadonlySet(values?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> | undefined {
  if (!values) return undefined;
  return values instanceof Set ? values : new Set(values.map(normalizeWord));
}

export function validateGuess(input: ValidateGuessInput): ValidateGuessResult {
  const wordLength = input.wordLength ?? STANDARD_WORD_LENGTH;
  const normalized = normalizeWord(input.guess);
  const allowAsciiOnly = input.allowAsciiOnly ?? true;

  if (normalized.length === 0) {
    return { valid: false, normalized, reason: 'empty' };
  }

  if (normalized.length !== wordLength) {
    return { valid: false, normalized, reason: 'wrong_length' };
  }

  if (allowAsciiOnly && !/^[a-z]+$/.test(normalized)) {
    return { valid: false, normalized, reason: 'invalid_characters' };
  }

  const bannedWords = toReadonlySet(input.bannedWords);
  if (bannedWords?.has(normalized)) {
    return { valid: false, normalized, reason: 'banned_word' };
  }

  const validGuesses = toReadonlySet(input.validGuesses);
  if (validGuesses && !validGuesses.has(normalized)) {
    return { valid: false, normalized, reason: 'not_in_dictionary' };
  }

  return { valid: true, normalized };
}

export function scoreGuess(answerInput: string, guessInput: string): LetterFeedback[] {
  const answer = normalizeWord(answerInput);
  const guess = normalizeWord(guessInput);

  if (answer.length !== guess.length) {
    throw new Error(`answer and guess length mismatch: ${answer.length} !== ${guess.length}`);
  }

  const feedback: LetterFeedback[] = Array.from(guess, (letter) => ({ letter, state: 'absent' }));
  const remaining = new Map<string, number>();

  for (let i = 0; i < answer.length; i += 1) {
    const answerLetter = answer[i];
    const guessLetter = guess[i];
    if (answerLetter === undefined || guessLetter === undefined) {
      throw new Error('unexpected missing letter while scoring guess');
    }

    if (guessLetter === answerLetter) {
      feedback[i] = { letter: guessLetter, state: 'correct' };
    } else {
      remaining.set(answerLetter, (remaining.get(answerLetter) ?? 0) + 1);
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    const current = feedback[i];
    if (!current || current.state === 'correct') continue;

    const count = remaining.get(current.letter) ?? 0;
    if (count > 0) {
      feedback[i] = { letter: current.letter, state: 'present' };
      remaining.set(current.letter, count - 1);
    }
  }

  return feedback;
}

export function isSolved(feedback: readonly LetterFeedback[]): boolean {
  return feedback.length > 0 && feedback.every((cell) => cell.state === 'correct');
}

export function calculateRoundScore(input: RoundScoreInput): RoundScoreBreakdown {
  if (!input.solved) {
    return {
      base: 0,
      guessBonus: 0,
      speedBonus: 0,
      penalty: 0,
      adjustment: 0,
      total: 0,
      scoringPreset: STANDARD_SCORING_PRESET,
    };
  }

  const guessBonus = GUESS_BONUS_BY_COUNT.get(input.validGuessCount);
  if (guessBonus === undefined) {
    throw new Error(`validGuessCount must be between 1 and ${STANDARD_MAX_GUESSES}`);
  }

  if (input.roundTimeMs <= 0) {
    throw new Error('roundTimeMs must be positive');
  }

  const remainingRatio = Math.max(0, Math.min(1, (input.roundTimeMs - input.elapsedMs) / input.roundTimeMs));
  const speedBonus = Math.round(50 * remainingRatio);
  const base = 100;
  const penalty = 0;
  const adjustment = 0;
  const total = base + guessBonus + speedBonus + penalty + adjustment;

  return {
    base,
    guessBonus,
    speedBonus,
    penalty,
    adjustment,
    total,
    scoringPreset: STANDARD_SCORING_PRESET,
  };
}

function compareParticipants(a: ParticipantScoreSummary, b: ParticipantScoreSummary): number {
  if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
  if (a.roundsSolved !== b.roundsSolved) return b.roundsSolved - a.roundsSolved;
  if (a.totalValidGuesses !== b.totalValidGuesses) return a.totalValidGuesses - b.totalValidGuesses;
  if (a.totalSolveMs !== b.totalSolveMs) return a.totalSolveMs - b.totalSolveMs;

  const aFinalSolved = a.finalRound?.state === 'solved' ? 1 : 0;
  const bFinalSolved = b.finalRound?.state === 'solved' ? 1 : 0;
  if (aFinalSolved !== bFinalSolved) return bFinalSolved - aFinalSolved;

  const aFinalGuesses = a.finalRound?.validGuessCount ?? Number.POSITIVE_INFINITY;
  const bFinalGuesses = b.finalRound?.validGuessCount ?? Number.POSITIVE_INFINITY;
  if (aFinalGuesses !== bFinalGuesses) return aFinalGuesses - bFinalGuesses;

  const aFinalSolveMs = a.finalRound?.solveMs ?? Number.POSITIVE_INFINITY;
  const bFinalSolveMs = b.finalRound?.solveMs ?? Number.POSITIVE_INFINITY;
  if (aFinalSolveMs !== bFinalSolveMs) return aFinalSolveMs - bFinalSolveMs;

  if (a.bestRoundScore !== b.bestRoundScore) return b.bestRoundScore - a.bestRoundScore;
  return 0;
}

export function compareForStandings(a: ParticipantScoreSummary, b: ParticipantScoreSummary): number {
  return compareParticipants(a, b);
}

export function calculateFinalStandings(participants: readonly ParticipantScoreSummary[]): FinalStanding[] {
  const sorted = [...participants].sort((a, b) => {
    const compared = compareParticipants(a, b);
    return compared === 0 ? a.userId.localeCompare(b.userId) : compared;
  });

  let currentPlacement = 0;
  let currentGroup = 0;
  let previous: ParticipantScoreSummary | undefined;
  let itemsInPreviousGroups = 0;

  return sorted.map((participant, index) => {
    const tiedWithPrevious = previous !== undefined && compareParticipants(previous, participant) === 0;
    if (!tiedWithPrevious) {
      currentGroup += 1;
      currentPlacement = itemsInPreviousGroups + 1;
    }

    const tied = sorted.some((other, otherIndex) => otherIndex !== index && compareParticipants(other, participant) === 0);
    const standing: FinalStanding = {
      ...participant,
      placement: currentPlacement,
      placementGroup: currentGroup,
      tied,
    };

    previous = participant;
    itemsInPreviousGroups += tiedWithPrevious ? 0 : 1;
    if (tiedWithPrevious) {
      itemsInPreviousGroups += 1;
    }

    return standing;
  });
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function calculatePlacementMmrDeltas(
  participants: readonly RatedParticipant[],
  placementGroups: readonly (readonly string[])[],
  config: RatingConfig = {},
): RatingDelta[] {
  const establishedK = config.establishedK ?? 24;
  const provisionalK = config.provisionalK ?? 36;
  const establishedDeltaCap = config.establishedDeltaCap ?? 40;
  const provisionalDeltaCap = config.provisionalDeltaCap ?? 60;
  const ratingByUser = new Map(participants.map((participant) => [participant.userId, participant]));
  const placementByUser = new Map<string, number>();

  placementGroups.forEach((group, groupIndex) => {
    for (const userId of group) {
      if (placementByUser.has(userId)) {
        throw new Error(`duplicate userId in placement groups: ${userId}`);
      }
      placementByUser.set(userId, groupIndex);
    }
  });

  for (const participant of participants) {
    if (!placementByUser.has(participant.userId)) {
      throw new Error(`missing placement for userId: ${participant.userId}`);
    }
  }

  return participants.map((participant) => {
    const participantPlacement = placementByUser.get(participant.userId);
    if (participantPlacement === undefined) {
      throw new Error(`missing placement for userId: ${participant.userId}`);
    }

    let sum = 0;
    for (const opponent of participants) {
      if (opponent.userId === participant.userId) continue;
      const opponentPlacement = placementByUser.get(opponent.userId);
      if (opponentPlacement === undefined) {
        throw new Error(`missing placement for userId: ${opponent.userId}`);
      }

      const actual = participantPlacement < opponentPlacement ? 1 : participantPlacement > opponentPlacement ? 0 : 0.5;
      sum += actual - expectedScore(participant.rating, opponent.rating);
    }

    const provisional = participant.provisional ?? false;
    const k = provisional ? provisionalK : establishedK;
    const cap = provisional ? provisionalDeltaCap : establishedDeltaCap;
    const uncapped = Math.round(k * sum);
    const delta = Math.max(-cap, Math.min(cap, uncapped));

    return {
      userId: participant.userId,
      ratingBefore: participant.rating,
      delta,
      ratingAfter: participant.rating + delta,
      provisional,
    };
  });
}

export function dictionaryFrom(words: readonly string[]): ReadonlySet<string> {
  return new Set(words.map(normalizeWord));
}
