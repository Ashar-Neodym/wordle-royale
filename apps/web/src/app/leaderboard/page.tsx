import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../../lib/api-client';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage(): Promise<ReactElement> {
  const api = await getWebApiSnapshot();
  return (
    <PageFrame>
      <PageHeader eyebrow="Ratings" title="Leaderboard">
        <p>Ranked rows come from the local server when available. Fixture rows stay labeled as preview data when the server/read model has no live ratings.</p>
      </PageHeader>
      <ProfileLeaderboard leaderboard={api.leaderboard} ratedProfile={api.ratedProfile} />
      <section className={styles.section} aria-labelledby="leaderboard-actions-heading">
        <article className={styles.panelWide}>
          <h2 id="leaderboard-actions-heading">Play for rating</h2>
          <p className={styles.muted}>Create a rated lobby, finish a ranked match, then return here to see rating movement once finalization is available.</p>
          <div className={styles.actionRow}>
            <a className={styles.primaryButton} href="/play">Play rated</a>
            <a className={styles.secondaryButton} href="/profile">My profile</a>
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
