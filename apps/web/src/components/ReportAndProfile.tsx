import type { ReactElement } from 'react';
import { rank } from '../lib/tokens';
import { leaderboardReadFallback } from '../lib/read-fallback';
import { leaderboardDisplayMode } from '../lib/profile-read-presentation';
import type { ApiClientResult, LeaderboardPayload } from '../lib/api-client';
import { TokenBadge } from './StatusPanels';
import { ServerReadRetryButton } from './ServerReadRetryButton';
import styles from './web-shell.module.css';


export function ProfileLeaderboard({
  leaderboard,
  compactForLiveMatch = false,
}: {
  leaderboard: ApiClientResult<LeaderboardPayload>;
  compactForLiveMatch?: boolean;
}): ReactElement {
  const liveRows = leaderboard.status === 'connected' ? leaderboard.data?.entries ?? [] : [];

  const displayMode = leaderboardDisplayMode(leaderboard.status, liveRows.length);
  const readUnavailable = displayMode === 'unavailable';
  const speedLeaderboard = leaderboard.data?.mode === 'speed_1v1';
  const rows = readUnavailable ? [] : liveRows;
  const usingLiveRows = displayMode === 'live';
  const fallback = leaderboardReadFallback();
  return (
    <section id="leaderboard" className={compactForLiveMatch ? `${styles.section} ${styles.liveRatingsSection}` : styles.section} aria-labelledby="leaderboard-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{readUnavailable ? 'Ratings unavailable' : usingLiveRows ? 'Ratings' : 'No standings yet'}</p>
        <h2 id="leaderboard-heading">{compactForLiveMatch ? 'Ratings after this match' : `${speedLeaderboard ? 'Speed' : 'Standard'} leaderboard`}</h2>
        <p>{readUnavailable ? fallback.message : usingLiveRows ? `Generated ${leaderboard.data?.generatedAt ?? ''} · ${leaderboard.data?.algorithmConfigVersion ?? 'rating identity unavailable'}` : `The standings read succeeded, but no players have a finalized ${speedLeaderboard ? 'Speed' : 'Standard'} rating yet.`}</p>
      </div>

      {readUnavailable ? (
        <article className={styles.errorPanel} aria-live="polite">
          <strong>{fallback.title}</strong>
          <p>{leaderboard.error ?? fallback.message}</p>
          <p className={styles.warningText}>{fallback.message}</p>
          <ServerReadRetryButton label={fallback.retryLabel} />
        </article>
      ) : null}
      {!readUnavailable && rows.length === 0 ? <article className={styles.panelWide}><strong>No {speedLeaderboard ? 'Speed' : 'Standard'} ratings yet</strong><p className={styles.muted}>No authoritative standings were returned for this mode.</p></article> : null}
      {!readUnavailable && rows.length > 0 ? <div className={styles.leaderboard}>
        {rows.map((row) => {
          const displayName = row.displayName;
          const badge = row.provisional ? rank.color.provisional : rank.color.rated;
          return (
            <article className={styles.leaderRow} key={row.userId}>
              <span className={styles.placement}>{row.rank ? `#${row.rank}` : '—'}</span>
              <div>
                <strong>{'handle' in row && row.handle ? <a href={`/profile/${encodeURIComponent(row.handle)}`}>{displayName}</a> : displayName}</strong>
                <p>{row.handle ? `@${row.handle} · ` : ''}{row.rating} rating · {row.matchesPlayed} games</p>
              </div>
              <TokenBadge label={badge.label} bg={badge.bg} border={badge.border} text={badge.text} />
            </article>
          );
        })}
      </div> : null}
    </section>
  );
}
