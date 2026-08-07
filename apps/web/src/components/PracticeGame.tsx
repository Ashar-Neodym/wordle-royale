'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { STANDARD_MAX_GUESSES, STANDARD_WORD_LENGTH, type LetterFeedbackState } from '@wordle-royale/game-engine';
import {
  aggregateKeyStates,
  createPracticeState,
  PRACTICE_ANSWERS,
  practiceReducer,
  type PracticeAction,
} from '../lib/practice-game';
import {
  allocatePracticeRound,
  copyPracticeResultOutcome,
  emptyPracticeStats,
  formatPracticeShare,
  getBrowserStorage,
  hydratePracticeContinuity,
  practiceWinPercentage,
  reduceStartOverConfirmation,
  recordPracticeResult,
  resetPracticeStats,
  savePracticeSession,
  savePracticeStats,
  type PracticeSession,
  type PracticeStats,
  type StartOverConfirmation,
  type StorageLike,
} from '../lib/practice-persistence';
import styles from './practice.module.css';
import {
  FRESH_ROUND_ANNOUNCEMENT,
  MEMORY_ONLY_WARNING,
  practiceAnnouncementForTransition,
  practiceKeyLabel,
  restoredRoundAnnouncement,
} from './practice-accessibility';
import { practiceActionForKey, shouldHandlePracticeKeydown } from './practice-keyboard';

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

function createRoundId(): string {
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(8, '0')).join('');
}

function newSession(roundSequence: number, previousAnswer?: string): PracticeSession {
  return { game: createPracticeState(chooseAnswer(previousAnswer)), roundId: createRoundId(), roundSequence, recorded: false };
}

function tileLabel(rowIndex: number, columnIndex: number, letter: string, feedback?: LetterFeedbackState): string {
  const position = `Row ${rowIndex + 1}, column ${columnIndex + 1}`;
  if (!letter) return `${position}, empty`;
  return feedback ? `${position}, ${letter.toUpperCase()}, ${feedback}` : `${position}, ${letter.toUpperCase()}`;
}

export function PracticeGame(): ReactElement {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [stats, setStats] = useState<PracticeStats>(emptyPracticeStats);
  const [hydrated, setHydrated] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [startOverConfirm, setStartOverConfirm] = useState<StartOverConfirmation>('idle');
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [memoryOnly, setMemoryOnly] = useState(false);
  const didHydrate = useRef(false);
  const storageRef = useRef<StorageLike | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const startOverRef = useRef<HTMLButtonElement | null>(null);
  const confirmStartOverRef = useRef<HTMLButtonElement | null>(null);
  const statsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const resetStatsRef = useRef<HTMLButtonElement | null>(null);
  const confirmResetRef = useRef<HTMLButtonElement | null>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement | null>(null);
  const copyAttemptRef = useRef(0);
  const restoreStartOverFocus = useRef(false);
  const focusHeadingAfterStartOver = useRef(false);
  const restoreStatsFocus = useRef(false);
  const restoreResetFocus = useRef(false);

  const noteStorageFailure = useCallback((saved: boolean): boolean => {
    if (!saved) setMemoryOnly(true);
    return saved;
  }, []);

  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const storage = getBrowserStorage(window);
    storageRef.current = storage;
    if (!storage) setMemoryOnly(true);
    const restored = hydratePracticeContinuity(storage);
    if (restored.session) {
      setStats(restored.stats);
      setSession(restored.session);
      if (restored.session.game.status === 'playing') {
        setAnnouncement(restoredRoundAnnouncement(restored.session.game.rows.length, restored.session.game.currentGuess.length));
      }
    } else {
      const allocated = allocatePracticeRound(restored.stats);
      if (allocated) {
        const fresh = newSession(allocated.roundSequence);
        setStats(allocated.stats);
        setSession(fresh);
        noteStorageFailure(savePracticeStats(storage, allocated.stats));
        noteStorageFailure(savePracticeSession(storage, fresh));
      }
    }
    setHydrated(true);
  }, [noteStorageFailure]);

  useEffect(() => {
    if (hydrated && session) noteStorageFailure(savePracticeSession(storageRef.current, session));
  }, [hydrated, noteStorageFailure, session]);

  const dispatch = useCallback((action: PracticeAction) => {
    if (!session) return;
    const game = practiceReducer(session.game, action);
    const nextAnnouncement = practiceAnnouncementForTransition(session.game, game, action);
    if (nextAnnouncement !== null) setAnnouncement(nextAnnouncement);
    setSession({ ...session, game });
  }, [session]);

  const game = session?.game ?? null;
  const terminal = game?.status === 'won' || game?.status === 'lost';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const targetIsElement = event.target instanceof Element;
      const targetIsInteractive = targetIsElement && Boolean(event.target.closest('a, button, input, textarea, select, summary, [contenteditable]'));
      if (!shouldHandlePracticeKeydown({
        key: event.key,
        gamePlaying: game?.status === 'playing',
        targetIsElement,
        targetIsInteractive,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      })) return;
      const action = practiceActionForKey(event.key);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, game?.status]);

  useEffect(() => {
    if (startOverConfirm === 'confirming') confirmStartOverRef.current?.focus();
    if (startOverConfirm === 'idle' && restoreStartOverFocus.current) {
      restoreStartOverFocus.current = false;
      startOverRef.current?.focus();
    } else if (startOverConfirm === 'idle' && focusHeadingAfterStartOver.current) {
      focusHeadingAfterStartOver.current = false;
      headingRef.current?.focus();
    }
  }, [startOverConfirm]);

  useEffect(() => {
    if (focusHeadingAfterStartOver.current) {
      focusHeadingAfterStartOver.current = false;
      headingRef.current?.focus();
    }
  }, [session?.roundId]);

  useEffect(() => {
    if (statsOpen) statsHeadingRef.current?.focus();
    if (!statsOpen && restoreStatsFocus.current) {
      restoreStatsFocus.current = false;
      statsTriggerRef.current?.focus();
    }
  }, [statsOpen]);

  useEffect(() => {
    if (resetConfirm) confirmResetRef.current?.focus();
    if (!resetConfirm && restoreResetFocus.current) {
      restoreResetFocus.current = false;
      resetStatsRef.current?.focus();
    }
  }, [resetConfirm]);

  useEffect(() => {
    if (manualCopyText !== null) manualCopyRef.current?.focus();
  }, [manualCopyText]);

  useEffect(() => {
    if (!hydrated || !session || !terminal || session.recorded) return;
    const nextStats = recordPracticeResult(stats, session.roundId, session.roundSequence, session.game.status as 'won' | 'lost', session.game.rows.length);
    if (nextStats !== stats) noteStorageFailure(savePracticeStats(storageRef.current, nextStats));
    if (nextStats !== stats) setStats(nextStats);
    setSession((current) => current?.roundId === session.roundId ? { ...current, recorded: true } : current);
  }, [hydrated, noteStorageFailure, session, stats, terminal]);

  const keyStates = useMemo(() => aggregateKeyStates(game?.rows ?? []), [game?.rows]);
  const shareText = useMemo(() => game ? formatPracticeShare(game) : null, [game]);
  const showStats = statsOpen || Boolean(terminal);

  const playAgain = (): void => {
    const allocated = allocatePracticeRound(stats);
    if (!allocated) return;
    const fresh = newSession(allocated.roundSequence, game?.answer);
    focusHeadingAfterStartOver.current = true;
    setStats(allocated.stats);
    setSession(fresh);
    noteStorageFailure(savePracticeStats(storageRef.current, allocated.stats));
    noteStorageFailure(savePracticeSession(storageRef.current, fresh));
    copyAttemptRef.current += 1;
    setCopyStatus('');
    setManualCopyText(null);
    setAnnouncement(FRESH_ROUND_ANNOUNCEMENT);
    setResetConfirm(false);
    setStartOverConfirm('idle');
  };

  const confirmStartOver = (): void => {
    const allocated = allocatePracticeRound(stats);
    if (!allocated) return;
    const fresh = newSession(allocated.roundSequence, game?.answer);
    focusHeadingAfterStartOver.current = true;
    setStats(allocated.stats);
    setSession(fresh);
    noteStorageFailure(savePracticeStats(storageRef.current, allocated.stats));
    noteStorageFailure(savePracticeSession(storageRef.current, fresh));
    copyAttemptRef.current += 1;
    setCopyStatus('');
    setManualCopyText(null);
    setAnnouncement(FRESH_ROUND_ANNOUNCEMENT);
    setStartOverConfirm((state) => reduceStartOverConfirmation(state, 'complete'));
  };

  const copyResult = async (): Promise<void> => {
    if (!shareText) return;
    const attempt = ++copyAttemptRef.current;
    setCopyStatus('Copying…');
    setManualCopyText(null);
    let clipboard: Clipboard | undefined;
    try {
      clipboard = navigator.clipboard;
    } catch {
      clipboard = undefined;
    }
    const outcome = await copyPracticeResultOutcome(clipboard, shareText);
    if (attempt !== copyAttemptRef.current) return;
    setCopyStatus(outcome.status);
    setManualCopyText(outcome.manualCopyText);
  };

  const resetStats = (): void => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setCopyStatus('Confirm reset of all practice stats.');
      return;
    }
    const cleared = resetPracticeStats(stats, terminal && session ? session.roundSequence : stats.highestRecordedSequence);
    noteStorageFailure(savePracticeStats(storageRef.current, cleared));
    setStats(cleared);
    setResetConfirm(false);
    if (terminal) setSession((current) => current ? { ...current, recorded: true } : current);
    setCopyStatus('Practice stats reset.');
  };

  return (
    <section className={styles.game} aria-labelledby="practice-heading">
      <header className={styles.header}>
        <div>
          <p className={styles.mode}>Practice · guest · not rated</p>
          <h1 id="practice-heading" ref={headingRef} tabIndex={-1}>Wordle Practice</h1>
          <p>A new random word each round—not a daily puzzle.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{game ? `${game.rows.length}/${STANDARD_MAX_GUESSES} guesses` : 'Restoring game…'}</span>
          {terminal ? <span className={styles.statsLabel}>Stats shown below</span> : (
            <button ref={statsTriggerRef} type="button" className={styles.textButton} aria-expanded={statsOpen} aria-controls="practice-stats" onClick={() => setStatsOpen((open) => !open)}>Stats</button>
          )}
          <a href="/play">Play options</a>
        </div>
      </header>

      <div className={styles.playArea} aria-busy={!game}>
        <p className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
        {memoryOnly ? <div className={styles.storageWarning} role="status" aria-live="polite">{MEMORY_ONLY_WARNING}</div> : null}
        <div className={styles.message}>
          {game?.message ?? 'Restoring your practice round…'}
        </div>

        {game?.status === 'playing' ? (
          <div className={styles.startOver} aria-label="Start over controls">
            {startOverConfirm === 'confirming' ? (
              <>
                <span role="status">Start a fresh round? Your current guesses will be cleared.</span>
                <button ref={confirmStartOverRef} type="button" onClick={confirmStartOver}>Confirm start over</button>
                <button type="button" onClick={() => {
                  restoreStartOverFocus.current = true;
                  setStartOverConfirm((state) => reduceStartOverConfirmation(state, 'cancel'));
                }}>Cancel</button>
              </>
            ) : (
              <button ref={startOverRef} type="button" onClick={() => setStartOverConfirm((state) => reduceStartOverConfirmation(state, 'request'))}>Start over</button>
            )}
          </div>
        ) : null}

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
                    <div className={styles.tile} data-filled={Boolean(letter)} data-state={feedback ?? 'empty'} role="gridcell" aria-label={tileLabel(rowIndex, columnIndex, letter, feedback)} key={columnIndex}>
                      <span>{letter}</span>
                      {feedback ? <span className={styles.stateMark} aria-hidden="true">{feedback === 'correct' ? '✓' : feedback === 'present' ? '◇' : '—'}</span> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {terminal && game ? (
          <div className={styles.result} data-result={game.status}>
            <div><strong>{game.status === 'won' ? 'You found it.' : 'Round over.'}</strong> <span>The word was <b>{game.answer.toUpperCase()}</b>.</span></div>
            <div className={styles.resultActions}>
              <button type="button" onClick={() => void copyResult()}>Copy result</button>
              <button type="button" onClick={playAgain}>Play again</button>
            </div>
          </div>
        ) : null}

        <div className={styles.copyStatus} role="status" aria-live="polite">{copyStatus}</div>

        {manualCopyText !== null ? (
          <div className={styles.manualCopy}>
            <label htmlFor="practice-manual-copy">Copy result manually</label>
            <p id="practice-manual-copy-instructions">Select the text below, then use your device's copy command.</p>
            <textarea
              id="practice-manual-copy"
              ref={manualCopyRef}
              aria-describedby="practice-manual-copy-instructions"
              readOnly
              value={manualCopyText}
            />
          </div>
        ) : null}

        {showStats ? (
          <section className={styles.stats} id="practice-stats" aria-labelledby="practice-stats-heading">
            <div className={styles.statsHeading}>
              <h2 id="practice-stats-heading" ref={statsHeadingRef} tabIndex={-1}>Practice stats</h2>
              {!terminal ? <button type="button" className={styles.closeStats} onClick={() => {
                restoreStatsFocus.current = true;
                setStatsOpen(false);
              }} aria-label="Hide practice stats">×</button> : null}
            </div>
            <div className={styles.statGrid} aria-label="Practice statistics">
              <div><strong>{stats.gamesPlayed}</strong><span>Played</span></div>
              <div><strong>{practiceWinPercentage(stats)}%</strong><span>Won</span></div>
              <div><strong>{stats.currentStreak}</strong><span>Win streak</span></div>
              <div><strong>{stats.bestStreak}</strong><span>Best</span></div>
            </div>
            <div className={styles.distribution}>
              <h3>Guesses in wins</h3>
              <div>{([1, 2, 3, 4, 5, 6] as const).map((guess) => <span key={guess}><b>{guess}</b> {stats.distribution[String(guess) as '1' | '2' | '3' | '4' | '5' | '6']}</span>)}</div>
            </div>
            <div className={styles.resetRow}>
              {resetConfirm ? <span role="status">Reset all practice stats?</span> : null}
              <button ref={resetConfirm ? confirmResetRef : resetStatsRef} type="button" onClick={resetStats}>{resetConfirm ? 'Yes, reset' : 'Reset stats'}</button>
              {resetConfirm ? <button type="button" onClick={() => {
                restoreResetFocus.current = true;
                setResetConfirm(false);
                setCopyStatus('Stats reset canceled.');
              }}>Cancel</button> : null}
            </div>
          </section>
        ) : null}

        <div className={styles.keyboard} aria-label="On-screen keyboard">
          {KEYBOARD_ROWS.map((row, rowIndex) => (
            <div className={styles.keyRow} key={rowIndex}>
              {row.map((key) => {
                const state = key.length === 1 ? keyStates.get(key) : undefined;
                const label = practiceKeyLabel(key, state ?? 'unused');
                return (
                  <button className={styles.key} data-state={state ?? 'unused'} data-wide={key.length > 1} disabled={!game || terminal} aria-label={label} type="button" onClick={() => {
                    const action = practiceActionForKey(key);
                    if (action) dispatch(action);
                  }} key={key}>
                    <span>{key === 'Backspace' ? '⌫' : key}</span>
                    {state ? <span className={styles.keyStateMark} aria-hidden="true">{state === 'correct' ? '✓' : state === 'present' ? '◇' : '—'}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className={styles.note}>{memoryOnly ? 'Progress and stats are memory-only for this visit.' : 'Progress and stats stay in this browser across reloads.'} Practice gameplay sends no account or API requests.</footer>
    </section>
  );
}
