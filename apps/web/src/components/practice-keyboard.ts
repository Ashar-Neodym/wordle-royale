import type { PracticeAction } from '../lib/practice-game';

export interface PracticeKeydownFacts {
  key: string;
  gamePlaying: boolean;
  targetIsElement: boolean;
  targetIsInteractive: boolean;
  defaultPrevented: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function practiceActionForKey(key: string): PracticeAction | null {
  if (key === 'Enter') return { type: 'submit' };
  if (key === 'Backspace') return { type: 'backspace' };
  if (/^[a-z]$/i.test(key)) return { type: 'letter', letter: key };
  return null;
}

/** Pure policy used before Practice consumes a physical keyboard event. */
export function shouldHandlePracticeKeydown(facts: PracticeKeydownFacts): boolean {
  if (!facts.gamePlaying || !facts.targetIsElement || facts.targetIsInteractive) return false;
  if (facts.defaultPrevented || facts.isComposing) return false;
  if (facts.altKey || facts.ctrlKey || facts.metaKey || facts.shiftKey) return false;
  return practiceActionForKey(facts.key) !== null;
}
