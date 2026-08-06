import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../lib/api-client';
import { gameplayFixtures } from '../lib/fixtures';
import { startPreviewDemoSessionAction } from './actions';
import { PageFrame } from '../components/PageFrame';
import { StatusStrip } from '../components/StatusPanels';
import styles from '../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../lib/auth-presentation';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<ReactElement> {
  const api = await getWebApiSnapshot();
  const presentation = requireAuthPresentationConfiguration();
  const localPlayer = gameplayFixtures.solvedRound.players[0];
  const currentUser = api.currentUser.status === 'connected' ? api.currentUser.data : null;
  return (
    <PageFrame>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div>
          <p className={styles.eyebrow}>Rated word games</p>
          <h1 id="home-heading">Play Wordle Royale.</h1>
          <p>Create or join a room, play a server-scored ranked round, and track rating without active-play spoilers.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="/practice">Play practice</a>
            <a className={styles.secondaryButton} href="/lobbies">Find lobby</a>
            <a className={styles.secondaryButton} href="/learn/rules">Rules</a>
          </div>
        </div>
        <aside className={styles.heroPreview} aria-label="Account access snapshot">
          <p className={styles.eyebrow}>{presentation.mode === 'preview_demo' ? (currentUser ? 'Preview demo session' : 'Preview access') : presentation.mode === 'durable' ? 'Account access' : 'Accounts unavailable'}</p>
          <strong>{presentation.mode === 'preview_demo'
            ? currentUser?.profile?.displayName ?? currentUser?.email ?? 'No current user yet'
            : presentation.mode === 'durable'
              ? currentUser?.profile?.displayName ?? currentUser?.email ?? 'Sign in to your account'
              : 'Account actions are disabled'}</strong>
          <p className={styles.muted}>{presentation.mode === 'preview_demo'
            ? currentUser
              ? 'Explicit demo session active. This is not a durable account; session and preview data may reset on restart or redeploy.'
              : `${localPlayer ? 'Practice fixtures are labeled separately.' : 'Public browsing is available.'} Start demo mode before current-player writes. No password or email is required.`
            : presentation.mode === 'durable'
              ? currentUser ? 'Your durable account session is active.' : 'Use the Account page to sign in with an existing account.'
              : 'Account access is disabled for this production deployment.'}</p>
          {presentation.mode === 'preview_demo' && !currentUser ? (
            <form action={startPreviewDemoSessionAction}>
              <input type="hidden" name="redirectTo" value="/" />
              <button className={styles.primaryButton} type="submit">Start preview demo</button>
            </form>
          ) : presentation.mode === 'durable' ? <a className={styles.primaryButton} href="/account">{currentUser ? 'View account' : 'Sign in'}</a> : null}
        </aside>
      </section>
      <section className={styles.section} aria-labelledby="home-routes-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Pages</p>
          <h2 id="home-routes-heading">Choose where to go</h2>
          <p>Wordle Royale now uses real routes instead of one long page. Live-vs-fixture state remains visible and secondary.</p>
        </div>
        <div className={styles.routeGrid}>
          <a className={styles.routeCard} href="/practice"><strong>Practice</strong><span>Play now · guest · not rated</span></a>
          <a className={styles.routeCard} href="/play"><strong>Play</strong><span>Board-first match workspace</span></a>
          <a className={styles.routeCard} href="/lobbies"><strong>Lobbies</strong><span>Create, join, and start rated rooms</span></a>
          <a className={styles.routeCard} href="/leaderboard"><strong>Leaderboard</strong><span>Ratings and provisional status</span></a>
          <a className={styles.routeCard} href="/profile"><strong>Profile</strong><span>{presentation.mode === 'preview_demo' ? 'Preview demo identity' : presentation.mode === 'durable' ? 'Account identity and ratings' : 'Public ratings view'}</span></a>
        </div>
      </section>
      <StatusStrip api={api} />
    </PageFrame>
  );
}
