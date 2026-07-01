import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../lib/api-client';
import { gameplayFixtures } from '../lib/fixtures';
import { PageFrame } from '../components/PageFrame';
import { StatusStrip } from '../components/StatusPanels';
import styles from '../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<ReactElement> {
  const api = await getWebApiSnapshot();
  const localPlayer = gameplayFixtures.solvedRound.players[0];
  return (
    <PageFrame>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div>
          <p className={styles.eyebrow}>Rated word games</p>
          <h1 id="home-heading">Play Wordle Royale.</h1>
          <p>Create or join a room, play a server-scored ranked round, and track rating without active-play spoilers.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="/play">Play rated</a>
            <a className={styles.secondaryButton} href="/lobbies">Find lobby</a>
            <a className={styles.secondaryButton} href="/learn/rules">Rules</a>
          </div>
        </div>
        <aside className={styles.heroPreview} aria-label="Current player snapshot">
          <p className={styles.eyebrow}>Local profile</p>
          <strong>{localPlayer ? 'Player One' : 'Guest'}</strong>
          <p className={styles.muted}>1200 provisional · local demo profile</p>
        </aside>
      </section>
      <section className={styles.section} aria-labelledby="home-routes-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Pages</p>
          <h2 id="home-routes-heading">Choose where to go</h2>
          <p>Wordle Royale now uses real routes instead of one long page. Live-vs-fixture state remains visible and secondary.</p>
        </div>
        <div className={styles.routeGrid}>
          <a className={styles.routeCard} href="/play"><strong>Play</strong><span>Board-first match workspace</span></a>
          <a className={styles.routeCard} href="/lobbies"><strong>Lobbies</strong><span>Create, join, and start rated rooms</span></a>
          <a className={styles.routeCard} href="/leaderboard"><strong>Leaderboard</strong><span>Ratings and provisional status</span></a>
          <a className={styles.routeCard} href="/profile"><strong>Profile</strong><span>Current local player identity</span></a>
        </div>
      </section>
      <StatusStrip api={api} />
    </PageFrame>
  );
}
