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

export default async function MatchDetailPage({ params }: MatchDetailPageProps): Promise<ReactElement> {
  const { matchId } = await params;
  const [result, state] = await Promise.all([getRankedMatchResult(matchId), getRankedMatchState(matchId)]);
  const liveResult = result.status === 'connected' ? result.data : null;
  const liveState = state.status === 'connected' ? state.data : null;
  const status = liveResult ? 'completed' : liveState ? liveState.state : 'unavailable';
  const deltas = new Map(liveResult?.ratingEvent?.participants.map((participant) => [participant.userId, participant]) ?? []);

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
