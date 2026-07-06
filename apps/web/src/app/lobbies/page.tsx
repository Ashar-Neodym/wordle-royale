import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../../lib/api-client';
import { LobbyBrowser, WaitingRoom } from '../../components/LobbyScreens';
import { StatusStrip } from '../../components/StatusPanels';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import { createRankedLobbyAction, joinLobbyAction, joinLobbyByCodeAction, startPreviewDemoSessionAction, startRankedMatchAction } from '../actions';
import { rankedActionState, resolveSearchParams, type SearchParamsInput } from '../page-helpers';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

type LobbiesPageProps = {
  searchParams?: SearchParamsInput;
};

export default async function LobbiesPage({ searchParams }: LobbiesPageProps): Promise<ReactElement> {
  const params = await resolveSearchParams(searchParams);
  const api = await getWebApiSnapshot();
  const actionState = rankedActionState(params);
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
            startPreviewDemoSessionAction={startPreviewDemoSessionAction}
            createRankedLobbyAction={createRankedLobbyAction}
            joinLobbyByCodeAction={joinLobbyByCodeAction}
            joinLobbyAction={joinLobbyAction}
            startRankedMatchAction={startRankedMatchAction}
          />
        </div>
        <aside className={styles.sidePanel} aria-label="Lobby status">
          <StatusStrip api={api} />
          <p className={styles.muted}>When a ranked match starts, continue on the Play page. The lobby page does not expose the practice board or active-match answer data.</p>
          <a className={styles.primaryButton} href="/play">Go to Play</a>
        </aside>
      </div>
      <WaitingRoom />
    </PageFrame>
  );
}
