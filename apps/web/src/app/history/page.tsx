import type { ReactElement } from 'react';
import { getMatchHistory } from '../../lib/api-client';
import { HistoryStatusPanel, MatchHistoryRows } from '../../components/ProfileHistory';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function HistoryPage(): Promise<ReactElement> {
  const history = await getMatchHistory(20);
  const matches = history.status === 'connected' ? history.data?.items ?? [] : [];
  return (
    <PageFrame>
      <PageHeader eyebrow="History" title="Match history">
        <p>Recent ranked matches for the local player. Active answers, hashes, salts, and hidden guesses stay out of this route.</p>
      </PageHeader>
      <section className={styles.section} aria-labelledby="history-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{history.status === 'connected' ? 'Live read model' : 'Offline'}</p>
          <h2 id="history-heading">Recent ranked games</h2>
          <p>{history.status === 'connected' ? `${matches.length} match row${matches.length === 1 ? '' : 's'} returned by the API.` : 'History is intentionally not replaced with fixture rows; this page is honest when offline.'}</p>
        </div>
        <HistoryStatusPanel history={history} />
        <MatchHistoryRows matches={matches} />
        {history.status === 'connected' && history.data?.pagination.nextCursor ? <p className={styles.muted}>More matches are available after cursor {history.data.pagination.nextCursor}.</p> : null}
      </section>
    </PageFrame>
  );
}
