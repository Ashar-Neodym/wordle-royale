import { connectionStates, lobbyStates, rank, score, tileStates, type TileFeedbackState } from '../lib/tokens';

export { connectionStates, lobbyStates, rank, score, tileStates };
export type { TileFeedbackState };

export const markerByState: Record<TileFeedbackState, string> = {
  empty: '',
  filled: '',
  pending: '•',
  submitted: '◷',
  correct: '✓',
  present: '●',
  absent: '—',
  invalid: '!',
  locked: '🔒',
  disabled: '',
};
