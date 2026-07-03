import type { ReactElement } from 'react';
import { tileStates, type TileFeedbackState } from '../lib/tokens';
import styles from './web-shell.module.css';

const markerByState: Record<TileFeedbackState, string> = {
  empty: '',
  filled: '',
  pending: '•',
  submitted: '◷',
  correct: '✓',
  present: '◒',
  absent: '—',
  invalid: '!',
  locked: '🔒',
  disabled: '',
};

export function WordTile({ letter, state }: { letter: string; state: TileFeedbackState }): ReactElement {
  const token = tileStates[state];
  return (
    <span
      className={`${styles.tile} ${styles[`tile_${token.pattern.replaceAll('-', '_')}`] ?? ''}`}
      style={{ backgroundColor: token.bg, borderColor: token.border, color: token.text }}
      aria-label={`${letter || 'blank'}: ${token.label}`}
      title={token.accessibilityNote}
    >
      <span>{letter}</span>
      {markerByState[state] ? <small aria-hidden="true">{markerByState[state]}</small> : null}
    </span>
  );
}

export function EmptyTileRow({ count }: { count: number }): ReactElement[] {
  return Array.from({ length: count }, (_, index) => <WordTile key={index} letter="" state="empty" />);
}
