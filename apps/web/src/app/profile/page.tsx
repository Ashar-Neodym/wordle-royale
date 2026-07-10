import type { ReactElement } from 'react';
import { getCurrentProfileSummary, getWebApiSnapshot } from '../../lib/api-client';
import { AuthRequiredPanel, isAuthLimited, MatchHistoryRows, ModeRatingCards, ProfileSummaryCard } from '../../components/ProfileHistory';
import { startPreviewDemoSessionAction } from '../actions';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function ProfilePage(): Promise<ReactElement> {
  const [api, profileSummary] = await Promise.all([getWebApiSnapshot(), getCurrentProfileSummary()]);
  const profile = profileSummary.status === 'connected' ? profileSummary.data : null;
  const authLimited = isAuthLimited(profileSummary.error);
  const ratedFallback = api.ratedProfile.status === 'connected' ? api.ratedProfile.data : null;
  const title = profile?.displayName ?? ratedFallback?.displayName ?? (authLimited ? 'Preview profile' : 'Preview player');

  return (
    <PageFrame>
      <PageHeader eyebrow="Profile" title={title}>
        <p>{profile ? `@${profile.handle} · ${profile.rating.rating} rating · ${profile.rating.matchesPlayed} rated games` : authLimited ? 'Current-player profile requires a real session in preview; fixture sign-in is not silently assumed.' : 'Live profile summary appears here when the API read model is available.'}</p>
      </PageHeader>
      {authLimited ? <AuthRequiredPanel title="Profile requires a session" message="Preview mode does not impersonate the local stub user. Start an explicit preview demo session to create scoped demo profile data. Demo sessions are not durable accounts and may reset with preview data; public ratings and lobbies remain browseable without signing in." previewDemoSessionAction={startPreviewDemoSessionAction} redirectTo="/profile" /> : null}
      <section className={styles.section} aria-labelledby="profile-summary-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Rated identity</p>
          <h2 id="profile-summary-heading">Profile summary</h2>
          <p>Real rating and recent-match data when available; no account editing or private auth data is exposed.</p>
        </div>
        <ProfileSummaryCard profile={profile} fallbackMessage={profileSummary.error ?? 'Live profile summary is unavailable.'} />
        <div className={styles.actionRow}>
          <a className={styles.primaryButton} href="/play">Play rated</a>
          <a className={styles.secondaryButton} href="/history">Full history</a>
          <a className={styles.secondaryButton} href="/settings">Settings</a>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="mode-ratings-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Mode ratings</p>
          <h2 id="mode-ratings-heading">Separate ladders by format</h2>
          <p>Ratings are shown per mode like chess time controls. Only Standard uses today's live read model; Speed, Classic, and Multiplayer are clearly labeled UI-ready placeholders until backend mode data lands.</p>
        </div>
        <ModeRatingCards profile={profile} />
      </section>
      <section className={styles.section} aria-labelledby="recent-matches-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Recent</p>
          <h2 id="recent-matches-heading">Recent matches</h2>
          <p>Compact match rows link to spoiler-safe match detail pages.</p>
        </div>
        <MatchHistoryRows matches={profile?.recentMatches ?? []} emptyLabel={profile ? 'No rated matches for this profile yet.' : 'Profile summary unavailable, so recent matches are hidden rather than faked.'} />
      </section>
      <ProfileLeaderboard leaderboard={api.leaderboard} ratedProfile={api.ratedProfile} />
    </PageFrame>
  );
}
