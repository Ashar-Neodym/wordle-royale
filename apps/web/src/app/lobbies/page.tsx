import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../../lib/api-client';
import { LobbyBrowser } from '../../components/LobbyScreens';
import { StatusStrip } from '../../components/StatusPanels';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import { createRankedLobbyAction, joinLobbyAction, joinLobbyByCodeAction, startPreviewDemoSessionAction, startRankedMatchAction } from '../actions';
import { rankedActionState, resolveSearchParams, searchValue, type SearchParamsInput } from '../page-helpers';
import styles from '../../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../../lib/auth-presentation';
import { DisabledRoute } from '../../components/DisabledRoute';
import { resolveRestrictedRoute } from '../../lib/restricted-route-presentation';
import { lobbyContinuationHref } from '../../lib/lobby-pagination';

export const dynamic = 'force-dynamic';

type LobbiesPageProps = {
  searchParams?: SearchParamsInput;
};

export default async function LobbiesPage({ searchParams }: LobbiesPageProps): Promise<ReactElement> {
  const route = await resolveRestrictedRoute('lobbies', async (presentation) => {
    const params = await resolveSearchParams(searchParams);
    const cursor = searchValue(params, 'cursor');
    const code = searchValue(params, 'code');
    const api = await getWebApiSnapshot(cursor);
    const actionState = rankedActionState(params);
    const standardAvailable = api.rankedModes.status === 'connected'
      && api.rankedModes.data?.modes.some((mode) => mode.id === 'standard_1v1' && mode.enabled) === true;
    return (
    <PageFrame>
      <PageHeader eyebrow="Lobbies" title="Create or join a rated room">
        <p>Room discovery is separated from the board so the product feels like a game site, not one long demo page.</p>
      </PageHeader>
      <div className={styles.lobbyPageGrid}>
        <div>
          <LobbyBrowser
            apiLobbies={api.lobbies}
            actionState={actionState}
            previewSessionActive={api.currentUser.status === 'connected'}
            authPresentationMode={presentation.mode}
            standardAvailable={standardAvailable}
            startPreviewDemoSessionAction={startPreviewDemoSessionAction}
            createRankedLobbyAction={createRankedLobbyAction}
            joinLobbyByCodeAction={joinLobbyByCodeAction}
            joinLobbyAction={joinLobbyAction}
            startRankedMatchAction={startRankedMatchAction}
          />
          {api.lobbies.status === 'connected' && api.lobbies.data?.pagination.nextCursor ? (
            <p><a href={lobbyContinuationHref(api.lobbies.data.pagination.nextCursor, code)}>More lobbies</a></p>
          ) : null}
        </div>
        <aside className={styles.sidePanel} aria-label="Lobby status">
          <StatusStrip api={api} />
          <p className={styles.muted}>When a ranked match starts, continue on the Play page. The lobby page does not expose the practice board or active-match answer data.</p>
          <a className={styles.primaryButton} href="/play">Go to Play</a>
        </aside>
      </div>

    </PageFrame>
    );
  }, requireAuthPresentationConfiguration);
  return route.kind === 'disabled' ? <DisabledRoute routeId="lobbies" /> : route.value;
}
