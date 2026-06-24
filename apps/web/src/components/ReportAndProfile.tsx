import { rank, score } from '../lib/tokens';
import { leaderboardFixtures, matchReportFixtures } from '../lib/fixtures';
import { userById } from './data';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';

export function MatchReport() {
  const report = matchReportFixtures.rankedGain;
  return (
    <section id="report" className={styles.section} aria-labelledby="report-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>Match report fixture</p>
        <h2 id="report-heading">Spoiler-safe ranked report</h2>
        <p>Uses participant report fixture data and shows MMR text rather than relying on green/red alone.</p>
      </div>
      <article className={styles.panelWide}>
        {report.participants.map((participant) => {
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
                <p>{participant.totalScore} pts · {report.rated ? 'Rated' : 'Casual'} · spoilerSafe: {String(report.spoilerSafe)}</p>
              </div>
              {report.rated ? <TokenBadge label={`${delta >= 0 ? '+' : ''}${delta} MMR`} bg={deltaToken.bg} border={deltaToken.text} text={deltaToken.text} title={deltaToken.label} /> : null}
            </div>
          );
        })}
      </article>
    </section>
  );
}

export function ProfileLeaderboard() {
  const rows = leaderboardFixtures.populated;
  return (
    <section id="leaderboard" className={styles.section} aria-labelledby="leaderboard-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>Profile + leaderboard</p>
        <h2 id="leaderboard-heading">Ranked beta snapshot</h2>
        <p>Basic profile and leaderboard mock state, driven by the shared fixture catalog.</p>
      </div>
      <div className={styles.leaderboard}>
        {rows.map((row) => {
          const user = userById(row.userId);
          const badge = row.provisional ? rank.color.provisional : rank.color.rated;
          return (
            <article className={styles.leaderRow} key={row.userId}>
              <span className={styles.avatar} style={{ backgroundColor: user.avatarColor }}>{user.displayName.slice(0, 1)}</span>
              <div>
                <strong>{user.displayName}</strong>
                <p>{row.rank ? `Rank #${row.rank}` : 'Unranked'} · {row.rating} rating</p>
              </div>
              <TokenBadge label={badge.label} bg={badge.bg} border={badge.border} text={badge.text} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
