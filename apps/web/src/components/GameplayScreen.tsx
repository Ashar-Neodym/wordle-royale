import type { ReactElement } from 'react';
import type { CurrentRankedMatchStateResponseData, RankedMatchResultSummary } from '@wordle-royale/contracts';
import type { ApiClientResult } from '../lib/api-client';
import { connectionStates } from '../lib/tokens';
import { gameplayFixtures } from '../lib/fixtures';
import { formatState, userById } from './data';
import { TokenBadge } from './StatusPanels';
import { EmptyTileRow, WordTile } from './WordTile';
import styles from './web-shell.module.css';

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
  matchState: ApiClientResult<CurrentRankedMatchStateResponseData> | null;
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
            <div className={styles.wordGrid} role="grid" aria-label="Live ranked word grid with server feedback">
              {(myState?.guesses ?? []).map((guess) => (
                <div className={styles.wordRow} role="row" key={`${guess.guess}-${guess.guessNumber}`}>
                  {guess.feedback.map((feedbackTile, tileIndex) => <WordTile key={`${guess.guess}-${tileIndex}`} letter={feedbackTile.letter} state={feedbackTile.state} />)}
                </div>
              ))}
              {Array.from({ length: Math.max(0, round.maxGuesses - (myState?.guesses.length ?? 0)) }, (_, index) => (
                <div className={styles.wordRow} role="row" key={`live-empty-${index}`}><EmptyTileRow count={round.wordLength} /></div>
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
                  <p>{standing.totalScore} pts · {standing.totalValidGuesses} guesses · {standing.roundsSolved} solved</p>
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
        <p className={styles.warningText}>Could not load ranked state from {matchState.apiUrl}: {matchState.error ?? 'state unavailable'}. Practice fixtures stay hidden in live match mode.</p>
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
    <article className={styles.panelWide}>
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
                <p>{standing.totalScore} pts · {standing.totalValidGuesses} guesses · {standing.roundsSolved} solved</p>
              </div>
              <span className={delta && delta.ratingDelta >= 0 ? styles.ratingDeltaPositive : styles.ratingDeltaNegative}>
                {delta ? `${delta.ratingBefore} → ${delta.ratingAfter} (${delta.ratingDelta >= 0 ? '+' : ''}${delta.ratingDelta})` : 'unrated'}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function GameplayScreen({ matchState, matchResult, actionState, submitRankedGuessAction, completeRankedMatchAction }: GameplayScreenProps): ReactElement {
  const gameplay = gameplayFixtures.solvedRound;
  const reconnect = gameplayFixtures.reconnecting;
  const localPlayer = gameplay.players.find((player) => player.userId === gameplay.localUserId) ?? gameplay.players[0];
  const connectionToken = connectionStates[gameplay.connection];
  const reconnectToken = connectionStates[reconnect.connection];
  const hasLiveMatch = Boolean(matchState);

  return (
    <section id="gameplay" className={styles.section} aria-labelledby="gameplay-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{hasLiveMatch ? 'Live board' : 'Board preview'}</p>
        <h2 id="gameplay-heading">Current game</h2>
        <p>{hasLiveMatch ? 'Server state is shown here when available. Practice boards are kept out of the live match view.' : 'Fixture preview. Live guesses and results appear here when a ranked match is open.'}</p>
      </div>
      {matchState ? <LiveGameplayPanel matchState={matchState} actionState={actionState} submitRankedGuessAction={submitRankedGuessAction} completeRankedMatchAction={completeRankedMatchAction} /> : null}
      <ResultPanel matchResult={matchResult} />
      {hasLiveMatch ? (
        <aside className={styles.practiceNote} aria-label="Practice preview hidden">
          <strong>Practice board hidden during live match.</strong>
          <p>Open the home page without a match link to see fixture/demo boards. This keeps the ranked game view focused on the server match.</p>
        </aside>
      ) : (
        <div className={styles.gameShell}>
          <article className={styles.boardPanel}>
            <div className={styles.cardTopline}>
              <TokenBadge label={connectionToken.label} bg={connectionToken.bg} border={connectionToken.border} text={connectionToken.text} />
              <span>Round {gameplay.round.roundNumber} · {formatState(gameplay.state)}</span>
            </div>
            <div className={styles.wordGrid} role="grid" aria-label="Fixture word grid with color and non-color indicators">
              {localPlayer.guesses.map((guess, rowIndex) => (
                <div className={styles.wordRow} role="row" key={`${guess.guess}-${rowIndex}`}>
                  {guess.feedback.map((state, tileIndex) => (
                    <WordTile key={`${guess.guess}-${tileIndex}`} letter={guess.guess[tileIndex] ?? ''} state={state} />
                  ))}
                </div>
              ))}
              {Array.from({ length: Math.max(0, gameplay.maxGuesses - localPlayer.guesses.length) }, (_, index) => (
                <div className={styles.wordRow} role="row" key={`empty-${index}`}><EmptyTileRow count={gameplay.wordLength} /></div>
              ))}
            </div>
          </article>
          <aside className={styles.sidePanel}>
            <h3>Practice players</h3>
            {gameplay.players.map((player) => {
              const user = userById(player.userId);
              return (
                <div className={styles.progressRow} key={player.userId}>
                  <span className={styles.avatar} style={{ backgroundColor: user.avatarColor }}>{user.displayName.slice(0, 1)}</span>
                  <div>
                    <strong>{user.displayName}</strong>
                    <p>{formatState(player.state)} · {player.score} pts · {player.validGuessCount} guesses</p>
                  </div>
                </div>
              );
            })}
            <div className={styles.reconnectBox} aria-live={reconnectToken.ariaLive}>
              <TokenBadge label={reconnectToken.label} bg={reconnectToken.bg} border={reconnectToken.border} text={reconnectToken.text} />
              <p>Input pauses until server resync completes.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
