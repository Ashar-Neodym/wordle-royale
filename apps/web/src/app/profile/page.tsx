import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../../lib/api-client';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function ProfilePage(): Promise<ReactElement> {
  const api = await getWebApiSnapshot();
  const profile = api.ratedProfile.status === 'connected' ? api.ratedProfile.data : null;
  return (
    <PageFrame>
      <PageHeader eyebrow="Profile" title={profile ? profile.displayName : 'Local player'}>
        <p>{profile ? `@${profile.handle} · ${profile.rating} rating · ${profile.matchesPlayed} rated games` : 'Local/stub profile preview. Live rating data appears here when the API is available.'}</p>
      </PageHeader>
      <section className={styles.section} aria-labelledby="profile-summary-heading">
        <article className={styles.panelWide}>
          <h2 id="profile-summary-heading">Rating identity</h2>
          <p className={styles.muted}>Profiles are visible for navigation and rating context. Account auth, editing display names, and privacy settings stay placeholders for now.</p>
          <div className={styles.actionRow}>
            <a className={styles.primaryButton} href="/play">Play rated</a>
            <a className={styles.secondaryButton} href="/history">History</a>
            <a className={styles.secondaryButton} href="/settings">Settings</a>
          </div>
        </article>
      </section>
      <ProfileLeaderboard leaderboard={api.leaderboard} ratedProfile={api.ratedProfile} />
    </PageFrame>
  );
}
