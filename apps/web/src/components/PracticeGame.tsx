'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { STANDARD_MAX_GUESSES, STANDARD_WORD_LENGTH, type LetterFeedbackState } from '@wordle-royale/game-engine';
import {
  aggregateKeyStates,
  createPracticeState,
  PRACTICE_ANSWERS,
  practiceReducer,
  type PracticeAction,
  type PracticeState,
} from '../lib/practice-game';
import styles from './practice.module.css';

const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
] as const;

function secureIndex(length: number): number {
  if (length <= 0) throw new Error('Practice answer list must not be empty.');
  const range = 0x1_0000_0000;
  const ceiling = Math.floor(range / length) * length;
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while ((value[0] ?? range) >= ceiling);
  return (value[0] ?? 0) % length;
}

function chooseAnswer(previous?: string): string {
  const candidates = previous ? PRACTICE_ANSWERS.filter((answer) => answer !== previous) : PRACTICE_ANSWERS;
  return candidates[secureIndex(candidates.length)] ?? PRACTICE_ANSWERS[0];
}

function keyAction(key: string): PracticeAction | null {
  if (key === 'Enter') return { type: 'submit' };
  if (key === 'Backspace') return { type: 'backspace' };
  if (/^[a-z]$/i.test(key)) return { type: 'letter', letter: key };
  return null;
}

function tileLabel(rowIndex: number, columnIndex: number, letter: string, feedback?: LetterFeedbackState): string {
  const position = `Row ${rowIndex + 1}, column ${columnIndex + 1}`;
  if (!letter) return `${position}, empty`;
  return feedback ? `${position}, ${letter.toUpperCase()}, ${feedback}` : `${position}, ${letter.toUpperCase()}`;
}

export function PracticeGame(): ReactElement {
  const [game, setGame] = useState<PracticeState | null>(null);

  useEffect(() => {
    setGame(createPracticeState(chooseAnswer()));
  }, []);

  const dispatch = useCallback((action: PracticeAction) => {
    setGame((current) => current ? practiceReducer(current, action) : current);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const action = keyAction(event.key);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  const keyStates = useMemo(() => aggregateKeyStates(game?.rows ?? []), [game?.rows]);
  const terminal = game?.status === 'won' || game?.status === 'lost';

  const playAgain = (): void => {
    const answer = chooseAnswer(game?.answer);
    if (game) dispatch({ type: 'reset', answer });
    else setGame(createPracticeState(answer));
  };

  return (
    <section className={styles.game} aria-labelledby="practice-heading">
      <header className={styles.header}>
        <div>
          <p className={styles.mode}>Practice · guest · not rated</p>
          <h1 id="practice-heading">Wordle Practice</h1>
          <p>Find the five-letter word in six guesses.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{game ? `${game.rows.length}/${STANDARD_MAX_GUESSES} guesses` : 'Starting game…'}</span>
          <a href="/play">Ranked play</a>
        </div>
      </header>

      <div className={styles.playArea} aria-busy={!game}>
        <div className={styles.message} role="status" aria-live="polite">
          {game?.message ?? 'Choosing a word…'}
        </div>

        <div className={styles.board} role="grid" aria-label="Wordle practice board" aria-rowcount={STANDARD_MAX_GUESSES} aria-colcount={STANDARD_WORD_LENGTH}>
          {Array.from({ length: STANDARD_MAX_GUESSES }, (_, rowIndex) => {
            const submitted = game?.rows[rowIndex];
            const isCurrent = game?.status === 'playing' && rowIndex === game.rows.length;
            const letters = submitted?.guess ?? (isCurrent ? game.currentGuess : '');
            return (
              <div className={styles.row} role="row" key={rowIndex} aria-label={`Guess ${rowIndex + 1}`}>
                {Array.from({ length: STANDARD_WORD_LENGTH }, (__, columnIndex) => {
                  const letter = letters[columnIndex] ?? '';
                  const feedback = submitted?.feedback[columnIndex]?.state;
                  return (
                    <div
                      className={styles.tile}
                      data-filled={Boolean(letter)}
                      data-state={feedback ?? 'empty'}
                      role="gridcell"
                      aria-label={tileLabel(rowIndex, columnIndex, letter, feedback)}
                      key={columnIndex}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {terminal && game ? (
          <div className={styles.result} data-result={game.status}>
            <strong>{game.status === 'won' ? 'You found it.' : 'Round over.'}</strong>
            <span>The word was <b>{game.answer.toUpperCase()}</b>.</span>
            <button type="button" onClick={playAgain}>Play again</button>
          </div>
        ) : null}

        <div className={styles.keyboard} aria-label="On-screen keyboard">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div className={styles.keyRow} key={rowIndex}>
              {row.map((key) => {
                const state = key.length === 1 ? keyStates.get(key) : undefined;
                const label = key === 'Backspace' ? 'Delete letter' : key === 'Enter' ? 'Submit guess' : `Letter ${key.toUpperCase()}`;
                return (
                  <button
                    className={styles.key}
                    data-state={state ?? 'unused'}
                    data-wide={key.length > 1}
                    disabled={!game || terminal}
                    aria-label={label}
                    type="button"
                    onClick={() => {
                      const action = keyAction(key);
                      if (action) dispatch(action);
                    }}
                    key={key}
                  >
                    {key === 'Backspace' ? '⌫' : key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.note}>This game stays in this tab. No account, storage, rating, or network request is used.</footer>
    </section>
  );
}
