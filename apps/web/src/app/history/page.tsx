import type { ReactElement } from 'react';
import { getMatchHistory } from '../../lib/api-client';
import { AuthRequiredPanel, HistoryStatusPanel, isAuthLimited, MatchHistoryRows } from '../../components/ProfileHistory';
import { startPreviewDemoSessionAction } from '../actions';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../../lib/auth-presentation';
import { DisabledRoute } from '../../components/DisabledRoute';
import { resolveRestrictedRoute } from '../../lib/restricted-route-presentation';
import { historyContinuationHref } from '../../lib/history-pagination';

export const dynamic = 'force-dynamic';

type HistoryPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function HistoryPage({ searchParams }: HistoryPageProps): Promise<ReactElement> {
  const rawCursor = (await searchParams)?.cursor;
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined;
  const route = await resolveRestrictedRoute('history', async (presentation) => {
    const history = await getMatchHistory(20, cursor);
    const matches = history.status === 'connected' ? history.data?.items ?? [] : [];
    const authLimited = isAuthLimited(history.error);
    return (
    <PageFrame>
      <PageHeader eyebrow="History" title="Match history">
        <p>{authLimited ? presentation.mode === 'preview_demo' ? 'Your history requires a real session in preview. Public match detail links remain spoiler-safe when shared.' : presentation.mode === 'durable' ? 'Your history requires a durable account session. Public match detail links remain spoiler-safe when shared.' : 'Current-player history is unavailable because accounts are disabled. Public match detail links remain spoiler-safe when shared.' : 'Recent ranked matches for the local player. Active answers, hashes, salts, and hidden guesses stay out of this route.'}</p>
      </PageHeader>
      {authLimited ? <AuthRequiredPanel surface="History" authPresentationMode={presentation.mode} previewMessage="Preview mode does not show fixture-user history as if it were your account. Start an explicit preview demo session to make current-player history available, or keep browsing public match links." previewDemoSessionAction={startPreviewDemoSessionAction} redirectTo="/history" /> : null}
      <section className={styles.section} aria-labelledby="history-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{history.status === 'connected' ? 'Live read model' : 'Offline'}</p>
          <h2 id="history-heading">Recent ranked games</h2>
          <p>{history.status === 'connected' ? `${matches.length} match row${matches.length === 1 ? '' : 's'} returned by the API.` : 'History is intentionally not replaced with fixture rows; this page is honest when offline.'}</p>
        </div>
        <HistoryStatusPanel history={history} />
        <MatchHistoryRows matches={matches} />
        {history.status === 'connected' && history.data?.pagination.nextCursor ? (
          <p><a href={historyContinuationHref(history.data.pagination.nextCursor)}>More matches</a></p>
        ) : null}
      </section>
    </PageFrame>
    );
  }, requireAuthPresentationConfiguration);
  return route.kind === 'disabled' ? <DisabledRoute routeId="history" /> : route.value;
}
