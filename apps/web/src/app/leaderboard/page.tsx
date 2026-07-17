import type { ReactElement } from 'react';
import { getLeaderboard, getWebApiSnapshot, type LeaderboardPayload } from '../../lib/api-client';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import { resolveSearchParams, searchValue, type SearchParamsInput } from '../page-helpers';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

type Props = { searchParams?: SearchParamsInput };

export default async function LeaderboardPage({ searchParams }: Props): Promise<ReactElement> {
  const params = await resolveSearchParams(searchParams);
  const requested = searchValue(params, 'mode');
  const mode: LeaderboardPayload['mode'] = requested === 'speed_1v1' ? 'speed_1v1' : 'standard_1v1';
  const [api, leaderboard] = await Promise.all([getWebApiSnapshot(), getLeaderboard(20, mode)]);
  const speedMode = api.rankedModes.data?.modes.find((entry) => entry.id === 'speed_1v1');
  const speedLive = api.rankedModes.status === 'connected' && speedMode?.enabled === true;
  return (
    <PageFrame>
      <PageHeader eyebrow="Ratings" title={`${mode === 'speed_1v1' ? 'Speed' : 'Standard'} leaderboard`}>
        <p>Mode-isolated rows and rating identities come from the live server. Fixture rows stay explicitly labeled and appear only after a connected empty read.</p>
      </PageHeader>
      <nav className={styles.modeTabs} aria-label="Leaderboard mode">
        <a className={mode === 'standard_1v1' ? styles.primaryButton : styles.secondaryButton} aria-current={mode === 'standard_1v1' ? 'page' : undefined} href="/leaderboard?mode=standard_1v1">Standard</a>
        {speedLive ? <a className={mode === 'speed_1v1' ? styles.primaryButton : styles.secondaryButton} aria-current={mode === 'speed_1v1' ? 'page' : undefined} href="/leaderboard?mode=speed_1v1">Speed</a> : <span className={styles.disabledMode} aria-disabled="true">Speed · Not live yet</span>}
        <span className={styles.disabledMode} aria-disabled="true">Classic · Not live yet</span>
        <span className={styles.disabledMode} aria-disabled="true">Multiplayer · Not live yet</span>
      </nav>
      <ProfileLeaderboard leaderboard={leaderboard} />
      <section className={styles.section} aria-labelledby="leaderboard-actions-heading">
        <article className={styles.panelWide}>
          <h2 id="leaderboard-actions-heading">Play for {mode === 'speed_1v1' ? 'Speed' : 'Standard'} rating</h2>
          <p className={styles.muted}>Queue for this exact mode, finish under server authority, then return for rating movement.</p>
          <div className={styles.actionRow}><a className={styles.primaryButton} href={mode === 'speed_1v1' ? '/play#speed-queue' : '/play#standard-queue'}>Play rated</a><a className={styles.secondaryButton} href="/profile">My profile</a></div>
        </article>
      </section>
    </PageFrame>
  );
}
