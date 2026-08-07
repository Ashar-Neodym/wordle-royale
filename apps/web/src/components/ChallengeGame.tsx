'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { STANDARD_MAX_GUESSES, STANDARD_WORD_LENGTH, type LetterFeedbackState } from '@wordle-royale/game-engine';
import { parseChallengeId } from '../lib/challenge-id';
import {
  createChallengeSession,
  deriveChallengeCompletion,
  formatChallengeShare,
  getChallengeBrowserStorage,
  loadChallengeSession,
  saveChallengeSession,
  challengeRoundStorageKey,
  type ChallengeSession,
} from '../lib/challenge-persistence';
import { aggregateKeyStates, practiceReducer, type PracticeAction } from '../lib/practice-game';
import { copyPracticeResultOutcome, type StorageLike } from '../lib/practice-persistence';
import {
  advancePracticeAnnouncement,
  EMPTY_PRACTICE_ANNOUNCEMENT,
  practiceAnnouncementForTransition,
  practiceKeyLabel,
} from './practice-accessibility';
import { practiceActionForKey, shouldHandlePracticeKeydown } from './practice-keyboard';
import styles from './practice.module.css';

const KEYBOARD_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Backspace'],
] as const;

function tileLabel(rowIndex: number, columnIndex: number, letter: string, feedback?: LetterFeedbackState): string {
  const position = `Row ${rowIndex + 1}, column ${columnIndex + 1}`;
  if (!letter) return `${position}, empty`;
  return feedback ? `${position}, ${letter.toUpperCase()}, ${feedback}` : `${position}, ${letter.toUpperCase()}`;
}

export function ChallengeGame({ challengeId }: Readonly<{ challengeId: string }>): ReactElement {
  const decoded = useMemo(() => parseChallengeId(challengeId), [challengeId]);
  const canonicalId = decoded.ok ? decoded.challengeId : null;
  const [session, setSession] = useState<ChallengeSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(EMPTY_PRACTICE_ANNOUNCEMENT);
  const storageRef = useRef<StorageLike | null>(null);
  const didHydrate = useRef(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement | null>(null);

  const announce = useCallback((message: string): void => {
    setAnnouncement((current) => advancePracticeAnnouncement(current, message));
  }, []);

  useEffect(() => {
    if (didHydrate.current || !canonicalId) return;
    didHydrate.current = true;
    const storage = getChallengeBrowserStorage(window);
    storageRef.current = storage;
    if (!storage) setMemoryOnly(true);
    let hadStoredValue = false;
    const key = challengeRoundStorageKey(canonicalId);
    if (storage && key) {
      try { hadStoredValue = storage.getItem(key) !== null; } catch { setMemoryOnly(true); }
    }
    const restored = loadChallengeSession(storage, canonicalId);
    const next = restored ?? createChallengeSession(canonicalId);
    setSession(next);
    if (next && !restored && !saveChallengeSession(storage, next)) setMemoryOnly(true);
    setHydrated(true);
    if (restored) {
      announce(`Challenge restored: ${restored.game.rows.length} submitted ${restored.game.rows.length === 1 ? 'guess' : 'guesses'}; ${restored.game.currentGuess.length} letters in the current guess.`);
    } else if (hadStoredValue) {
      const message = 'Saved challenge progress was corrupted and has been reset. You are still playing the same challenge.';
      setRestoreNotice(message);
      announce(message);
    } else {
      announce('Challenge ready. No guesses submitted.');
    }
  }, [announce, canonicalId]);

  useEffect(() => { if (manualCopyText !== null) manualCopyRef.current?.focus(); }, [manualCopyText]);

  const dispatch = useCallback((action: PracticeAction): void => {
    if (!session || session.game.status !== 'playing') return;
    const game = practiceReducer(session.game, action);
    const transition = practiceAnnouncementForTransition(session.game, game, action);
    if (transition !== null) announce(transition);
    const next = { ...session, game, completion: deriveChallengeCompletion(session.challengeId, game) };
    setSession(next);
    if (!saveChallengeSession(storageRef.current, next)) setMemoryOnly(true);
  }, [announce, session]);

  const game = session?.game ?? null;
  const terminal = game?.status === 'won' || game?.status === 'lost';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const targetIsElement = event.target instanceof Element;
      const targetIsInteractive = targetIsElement && Boolean(event.target.closest('a, button, input, textarea, select, summary, [contenteditable]'));
      if (!shouldHandlePracticeKeydown({
        key: event.key, gamePlaying: game?.status === 'playing', targetIsElement, targetIsInteractive,
        defaultPrevented: event.defaultPrevented, isComposing: event.isComposing, altKey: event.altKey,
        ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
      })) return;
      const action = practiceActionForKey(event.key);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, game?.status]);

  const keyStates = useMemo(() => aggregateKeyStates(game?.rows ?? []), [game?.rows]);
  const shareText = useMemo(() => terminal && session && typeof window !== 'undefined'
    ? formatChallengeShare(session, window.location.origin)
    : null, [session, terminal]);

  const copyResult = async (): Promise<void> => {
    if (!shareText) return;
    setCopyStatus('Copying…');
    setManualCopyText(null);
    let clipboard: Clipboard | undefined;
    try { clipboard = navigator.clipboard; } catch { clipboard = undefined; }
    const outcome = await copyPracticeResultOutcome(clipboard, shareText);
    setCopyStatus(outcome.status);
    setManualCopyText(outcome.manualCopyText);
  };

  if (!decoded.ok) return (
    <ChallengeUnavailable />
  );

  return (
    <section className={styles.game} aria-labelledby="challenge-game-heading">
      <header className={styles.header}>
        <div>
          <p className={styles.mode}>Challenge · async · browser-local · unrated</p>
          <h1 id="challenge-game-heading" ref={headingRef} tabIndex={-1}>Same-Puzzle Challenge</h1>
          <p>Everyone with this ID gets the same puzzle.</p>
        </div>
        <div className={styles.headerActions}>
          <span>{game ? `${game.rows.length}/${STANDARD_MAX_GUESSES} guesses` : 'Restoring game…'}</span>
          <a href="/challenge">Create another</a>
        </div>
      </header>

      <div className={styles.playArea} aria-busy={!hydrated}>
        <p className={styles.visuallyHidden} role="status" aria-live="polite" aria-atomic="true"><span key={announcement.revision}>{announcement.message}</span></p>
        {restoreNotice ? <div className={styles.storageWarning} role="status">{restoreNotice}</div> : null}
        {memoryOnly ? <div className={styles.storageWarning} role="status" aria-live="polite">Browser storage is unavailable. This challenge remains playable in memory, but progress will not survive a reload.</div> : null}
        <div className={styles.message}>{game?.message ?? 'Restoring your challenge…'}</div>

        <div className={styles.board} role="grid" aria-label="Wordle challenge board" aria-rowcount={STANDARD_MAX_GUESSES} aria-colcount={STANDARD_WORD_LENGTH}>
          {Array.from({ length: STANDARD_MAX_GUESSES }, (_, rowIndex) => {
            const submitted = game?.rows[rowIndex];
            const isCurrent = game?.status === 'playing' && rowIndex === game.rows.length;
            const letters = submitted?.guess ?? (isCurrent ? game.currentGuess : '');
            return <div className={styles.row} role="row" key={rowIndex} aria-label={`Guess ${rowIndex + 1}`}>
              {Array.from({ length: STANDARD_WORD_LENGTH }, (__, columnIndex) => {
                const letter = letters[columnIndex] ?? '';
                const feedback = submitted?.feedback[columnIndex]?.state;
                return <div className={styles.tile} data-filled={Boolean(letter)} data-state={feedback ?? 'empty'} role="gridcell" aria-label={tileLabel(rowIndex, columnIndex, letter, feedback)} key={columnIndex}>
                  <span>{letter}</span>{feedback ? <span className={styles.stateMark} aria-hidden="true">{feedback === 'correct' ? '✓' : feedback === 'present' ? '◇' : '—'}</span> : null}
                </div>;
              })}
            </div>;
          })}
        </div>

        {terminal && game ? <div className={styles.result} data-result={game.status}>
          <div><strong>{game.status === 'won' ? 'You found it.' : 'Challenge over.'}</strong> <span>The word was <b>{game.answer.toUpperCase()}</b>.</span></div>
          <div className={styles.resultActions}><button type="button" onClick={() => void copyResult()}>Copy result</button></div>
        </div> : null}
        <div className={styles.copyStatus} role="status" aria-live="polite">{copyStatus}</div>
        {manualCopyText !== null ? <div className={styles.manualCopy}>
          <label htmlFor="challenge-result-manual-copy">Copy result manually</label>
          <p id="challenge-result-copy-instructions">Select the text below, then use your device&apos;s copy command.</p>
          <textarea id="challenge-result-manual-copy" ref={manualCopyRef} aria-describedby="challenge-result-copy-instructions" readOnly value={manualCopyText} />
        </div> : null}

        <div className={styles.keyboard} aria-label="On-screen keyboard">
          {KEYBOARD_ROWS.map((row, rowIndex) => <div className={styles.keyRow} key={rowIndex}>
            {row.map((key) => {
              const state = key.length === 1 ? keyStates.get(key) : undefined;
              return <button className={styles.key} data-state={state ?? 'unused'} data-wide={key.length > 1} disabled={!game || terminal} aria-label={practiceKeyLabel(key, state ?? 'unused')} type="button" onClick={() => {
                const action = practiceActionForKey(key); if (action) dispatch(action);
              }} key={key}><span>{key === 'Backspace' ? '⌫' : key}</span>{state ? <span className={styles.keyStateMark} aria-hidden="true">{state === 'correct' ? '✓' : state === 'present' ? '◇' : '—'}</span> : null}</button>;
            })}
          </div>)}
        </div>
      </div>
      <footer className={styles.note}>This asynchronous challenge is local, unrated, and not authoritative or cheat-resistant. Progress stays in this browser when storage is available. No account or API requests are made. <a href="/practice">Practice</a> · <a href="/learn/rules">Rules</a></footer>
    </section>
  );
}

export function ChallengeUnavailable(): ReactElement {
  return <section className={styles.game} aria-labelledby="challenge-unavailable-heading">
    <header className={styles.header}><div><p className={styles.mode}>Challenge unavailable</p><h1 id="challenge-unavailable-heading">Challenge link unavailable</h1><p>This link is invalid, damaged, or uses an unsupported challenge version. Check the complete link with its sender.</p></div></header>
    <div className={styles.resultActions}><a href="/practice">Practice</a><a href="/challenge">Challenges</a><a href="/learn/rules">Rules</a></div>
  </section>;
}
