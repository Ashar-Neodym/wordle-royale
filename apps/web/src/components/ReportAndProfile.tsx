import type { ReactElement } from 'react';
import type { RankedMatchResultSummary } from '@wordle-royale/contracts';
import { rank, score } from '../lib/tokens';
import { leaderboardFixtures, matchReportFixtures } from '../lib/fixtures';
import type { ApiClientResult, LeaderboardPayload, RatedProfilePayload } from '../lib/api-client';
import { userById } from './data';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';

type ActionState = {
  action: string | undefined;
  status: string | undefined;
  message: string | undefined;
  matchId: string | undefined;
};

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function LiveResultRows({ result }: { result: RankedMatchResultSummary }): ReactElement {
  const deltas = new Map(result.ratingEvent?.participants.map((participant) => [participant.userId, participant]) ?? []);
  return (
    <>
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
              {delta ? `${delta.ratingAfter} (${formatSigned(delta.ratingDelta)})` : 'unrated'}
            </span>
          </div>
        );
      })}
    </>
  );
}

export function MatchReport({ matchResult, actionState }: { matchResult: ApiClientResult<RankedMatchResultSummary> | null; actionState: ActionState }): ReactElement {
  const report = matchReportFixtures.rankedGain;
  const liveResult = matchResult?.status === 'connected' ? matchResult.data : null;
  return (
    <section id="report" className={styles.section} aria-labelledby="report-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{liveResult ? 'Rated result' : 'Result preview'}</p>
        <h2 id="report-heading">Match result</h2>
        <p>{liveResult ? 'Final standings and rating movement from the server.' : 'Fixture result preview. Final ratings appear here after the match completes.'}</p>
      </div>
      {actionState.action === 'complete_match' && actionState.status === 'error' ? (
        <article className={styles.errorPanel} aria-live="polite">
          <strong>Result not ready</strong>
          <p>{actionState.message ?? 'Finish all players before rating finalization.'}</p>
        </article>
      ) : null}
      <article className={styles.panelWide}>
        {liveResult ? (
          <LiveResultRows result={liveResult} />
        ) : (
          report.participants.map((participant) => {
            const user = userById(participant.userId);
            const ratingAfter = 'ratingAfter' in participant ? participant.ratingAfter : undefined;
            const ratingBefore = 'ratingBefore' in participant ? participant.ratingBefore : undefined;
            const delta = (ratingAfter ?? 0) - (ratingBefore ?? 0);
            const deltaToken = delta > 0 ? score.delta.positive : delta < 0 ? score.delta.negative : score.delta.neutral;
            return (
              <div className={styles.reportRow} key={participant.userId}>
                <span className={styles.placement}>#{participant.placement}</span>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>{participant.totalScore} pts · {report.rated ? 'Rated' : 'Casual'} · spoiler-safe</p>
                </div>
                {report.rated ? <TokenBadge label={`${formatSigned(delta)} MMR`} bg={deltaToken.bg} border={deltaToken.text} text={deltaToken.text} title={deltaToken.label} /> : null}
              </div>
            );
          })
        )}
      </article>
    </section>
  );
}

export function ProfileLeaderboard({
  leaderboard,
  ratedProfile,
  compactForLiveMatch = false,
}: {
  leaderboard: ApiClientResult<LeaderboardPayload>;
  ratedProfile: ApiClientResult<RatedProfilePayload>;
  compactForLiveMatch?: boolean;
}): ReactElement {
  const liveRows = leaderboard.status === 'connected' ? leaderboard.data?.entries ?? [] : [];
  const fixtureRows = leaderboardFixtures.populated;
  const rows = liveRows.length > 0 ? liveRows : fixtureRows;
  const usingLiveRows = liveRows.length > 0;
  const liveProfile = ratedProfile.status === 'connected' ? ratedProfile.data : null;
  return (
    <section id="leaderboard" className={compactForLiveMatch ? `${styles.section} ${styles.liveRatingsSection}` : styles.section} aria-labelledby="leaderboard-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{usingLiveRows ? 'Live ratings' : compactForLiveMatch ? 'Ratings preview' : 'Leaderboard preview'}</p>
        <h2 id="leaderboard-heading">{compactForLiveMatch ? 'Ratings after this match' : 'Leaderboard'}</h2>
        <p>{usingLiveRows ? `Generated ${leaderboard.data?.generatedAt ?? ''}` : compactForLiveMatch ? 'No finalized leaderboard rows yet; keeping the live match page focused and showing a quiet preview.' : 'Fixture rows shown until the local rating read model has ranked players.'}</p>
      </div>
      {liveProfile ? (
        <article className={styles.profileCard}>
          <div>
            <p className={styles.eyebrow}>Profile</p>
            <strong>{liveProfile.displayName}</strong>
            <p className={styles.muted}>@{liveProfile.handle} · {liveProfile.rating} rating · {liveProfile.matchesPlayed} rated games</p>
          </div>
          <TokenBadge label={liveProfile.provisional ? `${liveProfile.provisionalRemaining} provisional` : 'Rated'} bg={liveProfile.provisional ? rank.color.provisional.bg : rank.color.rated.bg} border={liveProfile.provisional ? rank.color.provisional.border : rank.color.rated.border} text={liveProfile.provisional ? rank.color.provisional.text : rank.color.rated.text} />
        </article>
      ) : null}
      {leaderboard.status === 'unavailable' ? <p className={styles.warningText}>Leaderboard API unavailable: {leaderboard.error ?? 'offline'}. Showing fixture preview.</p> : null}
      <div className={styles.leaderboard}>
        {rows.map((row) => {
          const displayName = 'displayName' in row ? row.displayName : userById(row.userId).displayName;
          const badge = row.provisional ? rank.color.provisional : rank.color.rated;
          return (
            <article className={styles.leaderRow} key={row.userId}>
              <span className={styles.placement}>{row.rank ? `#${row.rank}` : '—'}</span>
              <div>
                <strong>{displayName}</strong>
                <p>{'handle' in row && row.handle ? `@${row.handle} · ` : ''}{row.rating} rating · {'matchesPlayed' in row ? row.matchesPlayed : 0} games</p>
              </div>
              <TokenBadge label={badge.label} bg={badge.bg} border={badge.border} text={badge.text} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
