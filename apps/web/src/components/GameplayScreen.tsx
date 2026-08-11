import type { ReactElement } from 'react';
import type { CurrentRankedMatchStateResponseData, RankedMatchResultSummary } from '@wordle-royale/contracts';
import type { ApiClientResult, LiveMatchState } from '../lib/api-client';
import { connectionStates } from '../lib/tokens';
import { TokenBadge } from './StatusPanels';
import { EmptyTileRow, WordTile } from './WordTile';
import { SpeedGameplayPanel } from './SpeedGameplayPanel';
import styles from './web-shell.module.css';

const formatState = (state: string): string => state.replaceAll('_', ' ');

type GameplayActionState = {
  action: string | undefined;
  status: string | undefined;
  message: string | undefined;
  matchId: string | undefined;
  roundId: string | undefined;
  guessStatus: string | undefined;
};

type FormAction = (formData: FormData) => Promise<void>;

type GameplayScreenProps = {
  matchState: ApiClientResult<LiveMatchState> | null;
  matchResult: ApiClientResult<RankedMatchResultSummary> | null;
  actionState: GameplayActionState;
  submitRankedGuessAction: FormAction;
  completeRankedMatchAction: FormAction;
};

function actionFeedback(actionState: GameplayActionState): { tone: 'success' | 'error'; message: string } | null {
  if (!actionState.status || !['submit_guess', 'complete_match'].includes(actionState.action ?? '')) return null;
  return {
    tone: actionState.status === 'error' ? 'error' : 'success',
    message: actionState.message ?? (actionState.status === 'error' ? 'Action failed.' : 'Action complete.'),
  };
}

function LiveGameplayPanel({
  matchState,
  actionState,
  submitRankedGuessAction,
  completeRankedMatchAction,
}: {
  matchState: ApiClientResult<CurrentRankedMatchStateResponseData>;
  actionState: GameplayActionState;
  submitRankedGuessAction: FormAction;
  completeRankedMatchAction: FormAction;
}): ReactElement {
  const snapshot = matchState.data;
  const round = snapshot?.currentRound;
  const myState = snapshot?.myState;
  const liveToken = connectionStates.live;
  const feedback = actionFeedback(actionState);
  const canSubmitGuess = matchState.status === 'connected' && Boolean(snapshot && round && round.state === 'active' && myState && myState.playerRoundState === 'active');
  const canTryComplete = matchState.status === 'connected' && Boolean(snapshot);

  return (
    <article className={styles.panelWide}>
      <div className={styles.cardTopline}>
        <TokenBadge label={matchState.status === 'connected' ? 'Server game' : 'State unavailable'} bg={matchState.status === 'connected' ? liveToken.bg : '#3A1F0B'} border={matchState.status === 'connected' ? liveToken.border : '#F59E0B'} text={matchState.status === 'connected' ? liveToken.text : '#FED7AA'} />
        <span>{snapshot ? formatState(snapshot.state) : 'fallback'}</span>
      </div>
      {feedback ? (
        <div className={feedback.tone === 'error' ? styles.errorPanel : styles.successPanel} aria-live="polite">
          <strong>{feedback.tone === 'error' ? 'Move not accepted' : 'Move accepted'}</strong>
          <p>{feedback.message}</p>
        </div>
      ) : null}
      {snapshot && round ? (
        <div className={styles.gameShellCompact}>
          <div>
            <h3>Match {snapshot.matchId.slice(0, 8)}</h3>
            <p className={styles.muted}>Round {round.roundNumber} · {formatState(round.state)} · {round.wordLength} letters · max {round.maxGuesses} guesses</p>
            <div className={styles.wordGrid} role="grid" aria-label="Live ranked word grid with server feedback" aria-rowcount={round.maxGuesses} aria-colcount={round.wordLength}>
              {(myState?.guesses ?? []).map((guess, rowIndex) => (
                <div className={styles.wordRow} role="row" aria-rowindex={rowIndex + 1} key={`${guess.guess}-${guess.guessNumber}`}>
                  {guess.feedback.map((feedbackTile, tileIndex) => <WordTile key={`${guess.guess}-${tileIndex}`} letter={feedbackTile.letter} state={feedbackTile.state} row={rowIndex + 1} column={tileIndex + 1} />)}
                </div>
              ))}
              {Array.from({ length: Math.max(0, round.maxGuesses - (myState?.guesses.length ?? 0)) }, (_, index) => (
                <div className={styles.wordRow} role="row" aria-rowindex={(myState?.guesses.length ?? 0) + index + 1} key={`live-empty-${index}`}><EmptyTileRow count={round.wordLength} row={(myState?.guesses.length ?? 0) + index + 1} /></div>
              ))}
            </div>
            <form action={submitRankedGuessAction} className={styles.guessForm}>
              <input type="hidden" name="matchId" value={snapshot.matchId} />
              <input type="hidden" name="roundId" value={round.roundId} />
              <label htmlFor="ranked-guess">Your word</label>
              <div className={styles.guessInputRow}>
                <input id="ranked-guess" name="guess" inputMode="text" autoComplete="off" maxLength={5} minLength={5} pattern="[A-Za-z]{5}" placeholder="crane" disabled={!canSubmitGuess} />
                <button className={styles.primaryButton} type="submit" disabled={!canSubmitGuess}>Submit</button>
              </div>
              {!canSubmitGuess ? <p className={styles.warningText}>Guessing opens only while your server round is active.</p> : null}
            </form>
          </div>
          <aside className={styles.sidePanel}>
            <h3>Standings</h3>
            {snapshot.standings.map((standing) => (
              <div className={styles.progressRow} key={standing.userId}>
                <span className={styles.placement}>{standing.placement ? `#${standing.placement}` : '—'}</span>
                <div>
                  <strong>{standing.userId.slice(0, 8)}</strong>
                  <p>{standing.totalScore} pts</p>
                </div>
              </div>
            ))}
            <form action={completeRankedMatchAction}>
              <input type="hidden" name="matchId" value={snapshot.matchId} />
              <button className={styles.secondaryButton} type="submit" disabled={!canTryComplete}>Finalize ratings</button>
            </form>
            <p className={styles.muted}>No answer, hash, or salt is exposed during play.</p>
          </aside>
        </div>
      ) : (
        <p className={styles.warningText}>Could not load ranked state from the match service: {matchState.error ?? 'state unavailable'}. No substitute board is shown.</p>
      )}
    </article>
  );
}

function ResultPanel({ matchResult }: { matchResult: ApiClientResult<RankedMatchResultSummary> | null }): ReactElement | null {
  if (!matchResult) return null;
  if (matchResult.status !== 'connected' || !matchResult.data) {
    return (
      <article className={styles.panelWide}>
        <div className={styles.cardTopline}>
          <strong>Result</strong>
          <span>not ready</span>
        </div>
        <p className={styles.warningText}>{matchResult.error ?? 'Complete the match before final rating results are available.'}</p>
      </article>
    );
  }

  const result = matchResult.data;
  const deltas = new Map(result.ratingEvent?.participants.map((participant) => [participant.userId, participant]) ?? []);
  return (
    <article id="report" className={styles.panelWide}>
      <div className={styles.cardTopline}>
        <strong>Result</strong>
        <span>{new Date(result.completedAt).toLocaleString()}</span>
      </div>
      <div className={styles.resultTable}>
        {result.finalStandings.map((standing) => {
          const delta = deltas.get(standing.userId);
          return (
            <div className={styles.reportRow} key={standing.userId}>
              <span className={styles.placement}>{standing.placement ? `#${standing.placement}` : '—'}</span>
              <div>
                <strong>{standing.userId.slice(0, 8)}</strong>
                <p>{result.rankedMode === 'speed_1v1'
                  ? `${standing.result ?? 'void'} · ${standing.guessesUsed ?? '—'} guesses · ${standing.solveElapsedMs === null || standing.solveElapsedMs === undefined ? 'no solve time' : `${(standing.solveElapsedMs / 1000).toFixed(1)}s`} · ${(standing.terminalReason ?? 'resolved').replaceAll('_', ' ')}`
                  : `${standing.totalScore} pts`}</p>
              </div>
              <span className={delta && delta.ratingDelta >= 0 ? styles.ratingDeltaPositive : styles.ratingDeltaNegative}>
                {delta ? `${delta.ratingBefore} → ${delta.ratingAfter} (${delta.ratingDelta >= 0 ? '+' : ''}${delta.ratingDelta})` : 'unrated'}
              </span>
            </div>
          );
        })}
      </div>
      {result.rankedMode === 'standard_1v1' ? (
        <div className={styles.actionRow} aria-label="Result actions">
          <a className={styles.secondaryButton} href={result.resultActions.links.matchHref}>View full result</a>
          <a className={styles.primaryButton} href={result.resultActions.links.nextRankedHref}>Play again</a>
        </div>
      ) : null}
    </article>
  );
}

export function GameplayScreen({ matchState, matchResult, actionState, submitRankedGuessAction, completeRankedMatchAction }: GameplayScreenProps): ReactElement {
  const hasLiveMatch = Boolean(matchState);
  const speedMatch = (matchState?.data as { mode?: string } | null)?.mode === 'speed_1v1';

  return (
    <section id="gameplay" className={styles.section} aria-labelledby="gameplay-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{hasLiveMatch ? 'Live board' : 'No live match'}</p>
        <h2 id="gameplay-heading">Current game</h2>
        <p>{hasLiveMatch ? 'Server state is shown here when available. Practice boards are kept out of the live match view.' : 'Open a server-provided match link to load a ranked board, or use Practice for a browser-local game.'}</p>
      </div>
      {matchState ? speedMatch
        ? <SpeedGameplayPanel initialState={matchState} />
        : <LiveGameplayPanel matchState={matchState as ApiClientResult<CurrentRankedMatchStateResponseData>} actionState={actionState} submitRankedGuessAction={submitRankedGuessAction} completeRankedMatchAction={completeRankedMatchAction} />
        : null}
      <ResultPanel matchResult={matchResult} />
      {hasLiveMatch ? (
        <aside className={styles.practiceNote} aria-label="Practice preview hidden">
          <strong>Practice board hidden during live match.</strong>
          <p>Use Practice for a separate browser-local game. This ranked view remains focused on server match state.</p>
        </aside>
      ) : (
        <article className={styles.panelWide}>
          <h3>No ranked match open</h3>
          <p className={styles.muted}>This page does not invent a board or result when no live match was requested.</p>
          <a className={styles.primaryButton} href="/practice">Play practice</a>
        </article>
      )}
    </section>
  );
}
