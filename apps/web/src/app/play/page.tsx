import type { ReactElement } from 'react';
import { getRankedMatchResult, getRankedMatchState, getWebApiSnapshot } from '../../lib/api-client';
import { GameplayScreen } from '../../components/GameplayScreen';
import { LobbyBrowser } from '../../components/LobbyScreens';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { StatusStrip } from '../../components/StatusPanels';
import { PageFrame } from '../../components/PageFrame';
import { completeRankedMatchAction, createRankedLobbyAction, joinLobbyAction, joinLobbyByCodeAction, startPreviewDemoSessionAction, startRankedMatchAction, submitRankedGuessAction } from '../actions';
import { rankedActionState, resolveSearchParams, searchValue, type SearchParamsInput } from '../page-helpers';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

type PlayPageProps = {
  searchParams?: SearchParamsInput;
};

export default async function PlayPage({ searchParams }: PlayPageProps): Promise<ReactElement> {
  const params = await resolveSearchParams(searchParams);
  const api = await getWebApiSnapshot();
  const matchId = searchValue(params, 'matchId');
  const matchState = matchId ? await getRankedMatchState(matchId) : null;
  const matchResult = matchId ? await getRankedMatchResult(matchId) : null;
  const actionState = rankedActionState(params);
  const hasLiveMatch = Boolean(matchId);
  const liveMatchStateLabel = matchState?.data ? matchState.data.state : matchState?.status === 'unavailable' ? 'state unavailable' : 'loading';

  return (
    <PageFrame>
      {hasLiveMatch ? (
        <section className={styles.matchBanner} aria-labelledby="live-match-heading">
          <div>
            <p className={styles.eyebrow}>Live ranked match</p>
            <h1 id="live-match-heading">Board first. Result and ratings stay with the match.</h1>
            <p>Match {matchId?.slice(0, 8)} · {liveMatchStateLabel}. Practice fixtures are hidden from the live view unless the server is offline.</p>
          </div>
          <a className={styles.secondaryButton} href="/leaderboard">Ratings</a>
        </section>
      ) : (
        <section className={styles.matchBanner} aria-labelledby="play-heading">
          <div>
            <p className={styles.eyebrow}>Play</p>
            <h1 id="play-heading">Ranked match workspace</h1>
            <p>Create or join a lobby on the left, then play from the live board. Server state stays authoritative; answer/hash/salt never appear here.</p>
          </div>
          <a className={styles.primaryButton} href="/lobbies">Open lobbies</a>
        </section>
      )}

      <div className={styles.playLayout}>
        <div className={styles.leftRail}>
          <StatusStrip api={api} />
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
        <div className={styles.mainBoard}>
          <GameplayScreen
            matchState={matchState}
            matchResult={matchResult}
            actionState={actionState}
            submitRankedGuessAction={submitRankedGuessAction}
            completeRankedMatchAction={completeRankedMatchAction}
          />
        </div>
      </div>
      <ProfileLeaderboard leaderboard={api.leaderboard} ratedProfile={api.ratedProfile} compactForLiveMatch={hasLiveMatch} />
    </PageFrame>
  );
}
