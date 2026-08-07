import type { ReactElement } from 'react';
import { tileStates, type TileFeedbackState } from '../lib/tokens';
import { wordTileLabel } from './ranked-accessibility';
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

type WordTileProps = {
  letter: string;
  state: TileFeedbackState;
  row: number;
  column: number;
};

export function WordTile({ letter, state, row, column }: WordTileProps): ReactElement {
  const token = tileStates[state];
  return (
    <span
      className={`${styles.tile} ${styles[`tile_${token.pattern.replaceAll('-', '_')}`] ?? ''}`}
      style={{ backgroundColor: token.bg, borderColor: token.border, color: token.text }}
      role="gridcell"
      aria-rowindex={row}
      aria-colindex={column}
      aria-label={wordTileLabel(letter, token.label, row, column)}
      title={token.accessibilityNote}
    >
      <span>{letter}</span>
      {markerByState[state] ? <small aria-hidden="true">{markerByState[state]}</small> : null}
    </span>
  );
}

export function EmptyTileRow({ count, row }: { count: number; row: number }): ReactElement[] {
  return Array.from({ length: count }, (_, index) => <WordTile key={index} letter="" state="empty" row={row} column={index + 1} />);
}
