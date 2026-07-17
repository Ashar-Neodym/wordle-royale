import type { ReactElement } from 'react';
import type { RankedMatchResultSummary } from '@wordle-royale/contracts';
import { rank, score } from '../lib/tokens';
import { leaderboardReadFallback } from '../lib/read-fallback';
import { leaderboardDisplayMode } from '../lib/profile-read-presentation';
import { leaderboardFixtures, matchReportFixtures } from '../lib/fixtures';
import type { ApiClientResult, LeaderboardPayload } from '../lib/api-client';
import { userById } from './data';
import { TokenBadge } from './StatusPanels';
import { ServerReadRetryButton } from './ServerReadRetryButton';
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
              <p>{result.rankedMode === 'speed_1v1'
                ? `${standing.result ?? 'void'} · ${standing.guessesUsed ?? '—'} guesses · ${standing.solveElapsedMs === null || standing.solveElapsedMs === undefined ? 'no solve time' : `${(standing.solveElapsedMs / 1000).toFixed(1)}s`} · ${(standing.terminalReason ?? 'resolved').replaceAll('_', ' ')}`
                : `${standing.totalScore} pts · ${standing.totalValidGuesses} guesses · ${standing.roundsSolved} solved`}</p>
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
  compactForLiveMatch = false,
}: {
  leaderboard: ApiClientResult<LeaderboardPayload>;
  compactForLiveMatch?: boolean;
}): ReactElement {
  const liveRows = leaderboard.status === 'connected' ? leaderboard.data?.entries ?? [] : [];
  const fixtureRows = leaderboardFixtures.populated;
  const displayMode = leaderboardDisplayMode(leaderboard.status, liveRows.length);
  const readUnavailable = displayMode === 'unavailable';
  const speedLeaderboard = leaderboard.data?.mode === 'speed_1v1';
  const rows = readUnavailable ? [] : liveRows.length > 0 ? liveRows : speedLeaderboard ? [] : fixtureRows;
  const usingLiveRows = displayMode === 'live';
  const fallback = leaderboardReadFallback();
  return (
    <section id="leaderboard" className={compactForLiveMatch ? `${styles.section} ${styles.liveRatingsSection}` : styles.section} aria-labelledby="leaderboard-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{readUnavailable ? 'Live read unavailable' : usingLiveRows ? 'Live ratings' : compactForLiveMatch ? 'Ratings preview' : 'Leaderboard preview'}</p>
        <h2 id="leaderboard-heading">{compactForLiveMatch ? 'Ratings after this match' : `${speedLeaderboard ? 'Speed' : 'Standard'} leaderboard`}</h2>
        <p>{readUnavailable ? fallback.message : usingLiveRows ? `Generated ${leaderboard.data?.generatedAt ?? ''} · ${leaderboard.data?.algorithmConfigVersion ?? 'rating identity unavailable'}` : speedLeaderboard ? 'The live Speed read succeeded, but no players have a finalized Speed rating yet.' : compactForLiveMatch ? 'No finalized leaderboard rows yet; keeping the live match page focused and showing a clearly labeled fixture preview.' : 'Clearly labeled fixture rows are shown only because the live read succeeded with no ranked players.'}</p>
      </div>

      {readUnavailable ? (
        <article className={styles.errorPanel} aria-live="polite">
          <strong>{fallback.title}</strong>
          <p>{leaderboard.error ?? fallback.message}</p>
          <p className={styles.warningText}>{fallback.message}</p>
          <ServerReadRetryButton label={fallback.retryLabel} />
        </article>
      ) : null}
      {!readUnavailable && speedLeaderboard && rows.length === 0 ? <article className={styles.panelWide}><strong>No Speed ratings yet</strong><p className={styles.muted}>Complete a live rated Speed match to create authoritative mode-specific standings.</p></article> : null}
      {!readUnavailable && rows.length > 0 ? <div className={styles.leaderboard}>
        {rows.map((row) => {
          const displayName = 'displayName' in row ? row.displayName : userById(row.userId).displayName;
          const badge = row.provisional ? rank.color.provisional : rank.color.rated;
          return (
            <article className={styles.leaderRow} key={row.userId}>
              <span className={styles.placement}>{row.rank ? `#${row.rank}` : '—'}</span>
              <div>
                <strong>{'handle' in row && row.handle ? <a href={`/profile/${encodeURIComponent(row.handle)}`}>{displayName}</a> : displayName}</strong>
                <p>{'handle' in row && row.handle ? `@${row.handle} · ` : ''}{row.rating} rating · {'matchesPlayed' in row ? row.matchesPlayed : 0} games</p>
              </div>
              <TokenBadge label={badge.label} bg={badge.bg} border={badge.border} text={badge.text} />
            </article>
          );
        })}
      </div> : null}
    </section>
  );
}
