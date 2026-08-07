import type { LetterFeedbackState } from '@wordle-royale/game-engine';
import type { PracticeRow } from '../lib/practice-game';

export type PracticeKeyState = LetterFeedbackState | 'unused';

export function practiceKeyLabel(key: string, state: PracticeKeyState = 'unused'): string {
  if (key === 'Backspace') return 'Delete letter';
  if (key === 'Enter') return 'Submit guess';
  return `Letter ${key.toUpperCase()}, ${state}`;
}

export function acceptedGuessAnnouncement(row: PracticeRow, remainingGuesses: number): string {
  const feedback = row.feedback
    .map((cell) => `${cell.letter.toUpperCase()} ${cell.state}`)
    .join(', ');
  const remaining = `${remainingGuesses} ${remainingGuesses === 1 ? 'guess' : 'guesses'} remaining`;
  return `Submitted ${row.guess.toUpperCase()}. ${feedback}. ${remaining}.`;
}

export function restoredRoundAnnouncement(submittedCount: number, currentGuessLength: number): string {
  const guesses = `${submittedCount} submitted ${submittedCount === 1 ? 'guess' : 'guesses'}`;
  const letters = `${currentGuessLength} ${currentGuessLength === 1 ? 'letter' : 'letters'} in the current guess`;
  return `Practice round restored: ${guesses}; ${letters}.`;
}

export const FRESH_ROUND_ANNOUNCEMENT = 'Fresh practice round started. No guesses submitted.';
export const MEMORY_ONLY_WARNING = 'Browser storage is unavailable. This round and stats are memory-only and will not survive a reload.';
