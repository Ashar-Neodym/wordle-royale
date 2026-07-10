import type { ReactElement } from 'react';
import { getPublicProfileSummary } from '../../../lib/api-client';
import { MatchHistoryRows, ModeRatingCards, ProfileSummaryCard } from '../../../components/ProfileHistory';
import { PageFrame, PageHeader } from '../../../components/PageFrame';
import styles from '../../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

type PublicProfilePageProps = {
  params: Promise<{ handle: string }> | { handle: string };
};

export default async function PublicProfilePage({ params }: PublicProfilePageProps): Promise<ReactElement> {
  const { handle } = await params;
  const profileResult = await getPublicProfileSummary(handle);
  const profile = profileResult.status === 'connected' ? profileResult.data : null;
  return (
    <PageFrame>
      <PageHeader eyebrow="Profile" title={profile ? profile.displayName : `@${handle}`}>
        <p>{profile ? `@${profile.handle} · ${profile.rating.rating} rating` : 'Public profile summary is unavailable.'}</p>
      </PageHeader>
      <section className={styles.section} aria-labelledby="public-profile-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Public profile</p>
          <h2 id="public-profile-heading">Rated summary</h2>
          <p>Public profile data is rating and match-summary only. Private account fields are not shown.</p>
        </div>
        <ProfileSummaryCard profile={profile} fallbackMessage={profileResult.error ?? 'Profile summary API is offline.'} />
      </section>
      <section className={styles.section} aria-labelledby="public-mode-ratings-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Mode ratings</p>
          <h2 id="public-mode-ratings-heading">Per-mode rating cards</h2>
          <p>Public profiles present separate mode ladders. Non-Standard modes are marked as prepared UI until live mode-aware backend data is available.</p>
        </div>
        <ModeRatingCards profile={profile} />
      </section>
      <section className={styles.section} aria-labelledby="public-recent-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Recent</p>
          <h2 id="public-recent-heading">Recent matches</h2>
          <p>Spoiler-safe public summaries for this player.</p>
        </div>
        <MatchHistoryRows matches={profile?.recentMatches ?? []} emptyLabel={profile ? 'No public recent matches yet.' : 'Profile unavailable, so match rows are hidden rather than faked.'} />
      </section>
    </PageFrame>
  );
}
