import type { ReactElement } from 'react';
import { getRankedMatchResult, getRankedMatchState } from '../../../lib/api-client';
import { PageFrame, PageHeader } from '../../../components/PageFrame';
import { TokenBadge } from '../../../components/StatusPanels';
import { rank, score } from '../../../lib/tokens';
import styles from '../../../components/web-shell.module.css';

type MatchDetailPageProps = {
  params: Promise<{ matchId: string }> | { matchId: string };
};

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function absoluteShareUrl(path: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_WEB_URL?.trim().replace(/\/$/, '');
  return siteUrl ? `${siteUrl}${path}` : path;
}

export default async function MatchDetailPage({ params }: MatchDetailPageProps): Promise<ReactElement> {
  const { matchId } = await params;
  const [result, state] = await Promise.all([getRankedMatchResult(matchId), getRankedMatchState(matchId)]);
  const liveResult = result.status === 'connected' ? result.data : null;
  const liveState = state.status === 'connected' ? state.data : null;
  const status = liveResult ? 'completed' : liveState ? liveState.state : 'unavailable';
  const deltas = new Map(liveResult?.ratingEvent?.participants.map((participant) => [participant.userId, participant]) ?? []);
  const resultActions = liveResult?.resultActions ?? null;
  const shareSummary = resultActions ? `${resultActions.share.text} ${absoluteShareUrl(resultActions.share.path)}` : '';

  return (
    <PageFrame>
      <PageHeader eyebrow="Match" title={`Match ${matchId.slice(0, 8)}`}>
        <p>Spoiler-safe match detail. Completed results show rating movement; active state uses the server snapshot without exposing answer authority.</p>
      </PageHeader>
      <section className={styles.section} aria-labelledby="match-detail-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{status}</p>
          <h2 id="match-detail-heading">Result detail</h2>
          <p>{liveResult ? `Completed ${liveResult.completedAt}` : liveState ? 'Active server state is reachable. Result finalization is not ready yet.' : 'Match result/state is not reachable from the local API.'}</p>
        </div>
        {!liveResult && !liveState ? (
          <article className={styles.errorPanel} aria-live="polite">
            <strong>Match unavailable</strong>
            <p>{result.error ?? state.error ?? 'The match may not exist locally, or the API may be offline.'}</p>
            <a className={styles.secondaryButton} href="/history">Back to history</a>
          </article>
        ) : null}
        {liveResult ? (
          <article className={styles.panelWide}>
            {liveResult.finalStandings.map((standing) => {
              const delta = deltas.get(standing.userId);
              const token = delta && delta.ratingDelta > 0 ? score.delta.positive : delta && delta.ratingDelta < 0 ? score.delta.negative : score.delta.neutral;
              return (
                <div className={styles.reportRow} key={standing.userId}>
                  <span className={styles.placement}>{standing.placement ? `#${standing.placement}` : '—'}</span>
                  <div>
                    <strong>{standing.userId.slice(0, 8)}</strong>
                    <p>{standing.totalScore} pts · {standing.totalValidGuesses} valid guesses · {standing.roundsSolved} solved</p>
                  </div>
                  {delta ? <TokenBadge label={`${delta.ratingAfter} (${formatSigned(delta.ratingDelta)})`} bg={token.bg} border={token.text} text={token.text} /> : <TokenBadge label="No rating" bg={rank.color.provisional.bg} border={rank.color.provisional.border} text={rank.color.provisional.text} />}
                </div>
              );
            })}
          </article>
        ) : null}
        {resultActions ? (
          <section className={styles.resultActionsPanel} aria-labelledby="result-actions-heading">
            <div>
              <p className={styles.eyebrow}>Next</p>
              <h2 id="result-actions-heading">What now?</h2>
              <p className={styles.muted}>Spoiler-safe result actions from the server. Rematch is shown honestly as disabled until the backend supports creating same-settings rematch lobbies.</p>
            </div>
            <div className={styles.actionCardGrid}>
              <article className={styles.actionCard}>
                <h3>{resultActions.rematch.label}</h3>
                <p>{resultActions.rematch.available ? 'Rematch is ready.' : `Not available yet${resultActions.rematch.reason ? `: ${resultActions.rematch.reason.replace(/_/g, ' ')}` : ''}.`}</p>
                <a className={resultActions.rematch.available ? styles.primaryButton : styles.secondaryButton} aria-disabled={!resultActions.rematch.available} href={resultActions.links.nextRankedHref}>Play again</a>
              </article>
              <article className={styles.actionCard}>
                <h3>Share result</h3>
                <p>This text is generated from final placement and score only; no answer, hash, salt, or hidden guesses.</p>
                <textarea className={styles.shareTextArea} readOnly value={shareSummary} aria-label="Spoiler-safe share summary" />
              </article>
              <article className={styles.actionCard}>
                <h3>Review</h3>
                <div className={styles.actionRow}>
                  <a className={styles.secondaryButton} href={resultActions.links.historyHref}>History</a>
                  <a className={styles.secondaryButton} href={resultActions.links.leaderboardHref}>Leaderboard</a>
                  <a className={styles.secondaryButton} href="/profile">Profile</a>
                </div>
              </article>
            </div>
          </section>
        ) : liveResult ? (
          <article className={styles.errorPanel} aria-live="polite">
            <strong>Result actions unavailable</strong>
            <p>The completed result loaded, but the server did not include post-match actions. Use the fallback links below.</p>
            <div className={styles.actionRow}>
              <a className={styles.primaryButton} href="/lobbies?mode=ranked&status=waiting">Play again</a>
              <a className={styles.secondaryButton} href="/history">History</a>
            </div>
          </article>
        ) : null}
        {liveState && !liveResult ? (
          <article className={styles.panelWide}>
            <div className={styles.serverRows}>
              <div><strong>State</strong><span>{liveState.state}</span></div>
              <div><strong>Round</strong><span>{liveState.currentRound?.roundNumber ?? '—'}</span></div>
              <div><strong>Participants</strong><span>{liveState.standings.length}</span></div>
            </div>
            <p className={styles.warningText}>Active match detail intentionally omits answer/hash/salt and other hidden player authority.</p>
          </article>
        ) : null}
      </section>
    </PageFrame>
  );
}
