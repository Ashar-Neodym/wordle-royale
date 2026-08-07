import { STANDARD_MAX_GUESSES, type LetterFeedbackState } from '@wordle-royale/game-engine';
import type { PracticeAction, PracticeRow, PracticeState } from '../lib/practice-game';

export type PracticeKeyState = LetterFeedbackState | 'unused';

export function practiceKeyLabel(key: string, state: PracticeKeyState = 'unused'): string {
  if (key === 'Backspace') return 'Delete letter';
  if (key === 'Enter') return 'Submit guess';
  return `Letter ${key.toUpperCase()}, ${state}`;
}

type PracticeResult = Pick<PracticeState, 'answer' | 'rows' | 'status'>;

export function acceptedGuessAnnouncement(row: PracticeRow, result: PracticeResult): string {
  const feedback = row.feedback
    .map((cell) => `${cell.letter.toUpperCase()} ${cell.state}`)
    .join(', ');
  const submitted = `Submitted ${row.guess.toUpperCase()}. ${feedback}.`;

  if (result.status === 'won') {
    const attempts = result.rows.length;
    return `${submitted} Solved! You win in ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}.`;
  }
  if (result.status === 'lost') {
    return `${submitted} Round ended. You lost after ${result.rows.length} attempts. The answer was ${result.answer.toUpperCase()}.`;
  }

  const remainingGuesses = STANDARD_MAX_GUESSES - result.rows.length;
  return `${submitted} ${remainingGuesses} ${remainingGuesses === 1 ? 'guess' : 'guesses'} remaining.`;
}

export function practiceAnnouncementForTransition(
  previous: PracticeState,
  next: PracticeState,
  action: PracticeAction,
): string | null {
  if (next.rows.length > previous.rows.length) {
    const row = next.rows.at(-1);
    return row ? acceptedGuessAnnouncement(row, next) : null;
  }
  if (action.type === 'submit' && next.message !== previous.message) return next.message;
  return null;
}

export function restoredRoundAnnouncement(submittedCount: number, currentGuessLength: number): string {
  const guesses = `${submittedCount} submitted ${submittedCount === 1 ? 'guess' : 'guesses'}`;
  const letters = `${currentGuessLength} ${currentGuessLength === 1 ? 'letter' : 'letters'} in the current guess`;
  return `Practice round restored: ${guesses}; ${letters}.`;
}

export const FRESH_ROUND_ANNOUNCEMENT = 'Fresh practice round started. No guesses submitted.';
export const MEMORY_ONLY_WARNING = 'Browser storage is unavailable. This round and stats are memory-only and will not survive a reload.';
