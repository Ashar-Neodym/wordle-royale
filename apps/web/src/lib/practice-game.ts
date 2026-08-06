import {
  isSolved,
  scoreGuess,
  STANDARD_MAX_GUESSES,
  STANDARD_WORD_LENGTH,
  validateGuess,
  type LetterFeedback,
  type LetterFeedbackState,
} from '@wordle-royale/game-engine';

// Seeded from the repository's safe English test fixtures, then expanded with
// reviewed, common five-letter words so practice games have useful variety.
export const PRACTICE_ANSWERS = [
  'allee', 'arena', 'array', 'bloom', 'brave', 'chair', 'civic', 'crane',
  'crown', 'flame', 'knoll', 'level', 'light', 'mamma', 'model', 'plant',
  'press', 'pride', 'slate', 'sound', 'apple', 'beach', 'bread', 'cloud',
  'dance', 'dream', 'earth', 'field', 'grape', 'green', 'house', 'lemon',
  'music', 'ocean', 'peach', 'river', 'smile', 'stone', 'table', 'tiger',
  'train', 'water', 'world', 'youth',
] as const;

const FIXTURE_GUESSES = [
  'adieu', 'awake', 'blush', 'cigar', 'dwarf', 'evade', 'focal', 'heath',
  'humph', 'karma', 'later', 'naval', 'raise', 'rates', 'rebut', 'roate',
  'serve', 'sissy', 'stare', 'tears',
] as const;

export const PRACTICE_VALID_GUESSES: ReadonlySet<string> = new Set([
  ...PRACTICE_ANSWERS,
  ...FIXTURE_GUESSES,
]);

export type PracticeStatus = 'playing' | 'won' | 'lost';

export interface PracticeRow {
  guess: string;
  feedback: LetterFeedback[];
}

export interface PracticeState {
  answer: string;
  currentGuess: string;
  rows: PracticeRow[];
  status: PracticeStatus;
  message: string;
}

export type PracticeAction =
  | { type: 'letter'; letter: string }
  | { type: 'backspace' }
  | { type: 'submit' }
  | { type: 'reset'; answer: string };

export function createPracticeState(answer: string): PracticeState {
  return {
    answer,
    currentGuess: '',
    rows: [],
    status: 'playing',
    message: 'Type a five-letter word.',
  };
}

const REJECT_MESSAGES: Record<string, string> = {
  empty: 'Type a five-letter word.',
  wrong_length: 'Not enough letters.',
  invalid_characters: 'Use letters A–Z only.',
  not_in_dictionary: 'That word is not in the practice list.',
  banned_word: 'That word cannot be played.',
};

export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  if (action.type === 'reset') return createPracticeState(action.answer);
  if (state.status !== 'playing') return state;

  if (action.type === 'letter') {
    const letter = action.letter.toLowerCase();
    if (!/^[a-z]$/.test(letter) || state.currentGuess.length >= STANDARD_WORD_LENGTH) return state;
    return { ...state, currentGuess: `${state.currentGuess}${letter}`, message: '' };
  }

  if (action.type === 'backspace') {
    if (!state.currentGuess) return state;
    return { ...state, currentGuess: state.currentGuess.slice(0, -1), message: '' };
  }

  const validation = validateGuess({
    guess: state.currentGuess,
    wordLength: STANDARD_WORD_LENGTH,
    validGuesses: PRACTICE_VALID_GUESSES,
  });
  if (!validation.valid) {
    return { ...state, message: REJECT_MESSAGES[validation.reason] ?? 'That guess cannot be played.' };
  }

  const feedback = scoreGuess(state.answer, validation.normalized);
  const rows = [...state.rows, { guess: validation.normalized, feedback }];
  const solved = isSolved(feedback);
  const lost = !solved && rows.length >= STANDARD_MAX_GUESSES;
  return {
    ...state,
    currentGuess: '',
    rows,
    status: solved ? 'won' : lost ? 'lost' : 'playing',
    message: solved
      ? `Solved in ${rows.length} ${rows.length === 1 ? 'guess' : 'guesses'}!`
      : lost
        ? 'Good try. The word is revealed below.'
        : `${STANDARD_MAX_GUESSES - rows.length} ${STANDARD_MAX_GUESSES - rows.length === 1 ? 'guess' : 'guesses'} left.`,
  };
}

const KEY_PRIORITY: Record<LetterFeedbackState, number> = {
  absent: 1,
  present: 2,
  correct: 3,
};

export function aggregateKeyStates(rows: readonly PracticeRow[]): ReadonlyMap<string, LetterFeedbackState> {
  const states = new Map<string, LetterFeedbackState>();
  for (const row of rows) {
    for (const cell of row.feedback) {
      const existing = states.get(cell.letter);
      if (!existing || KEY_PRIORITY[cell.state] > KEY_PRIORITY[existing]) states.set(cell.letter, cell.state);
    }
  }
  return states;
}
