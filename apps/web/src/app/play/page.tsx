import type { ReactElement } from 'react';
import { getRankedMatchResult, getRankedMatchState, getWebApiSnapshot } from '../../lib/api-client';
import { GameplayScreen } from '../../components/GameplayScreen';
import { LobbyBrowser } from '../../components/LobbyScreens';
import { ProfileLeaderboard } from '../../components/ReportAndProfile';
import { StandardQueuePanel } from '../../components/StandardQueuePanel';
import { SpeedQueuePanel } from '../../components/SpeedQueuePanel';
import { isAuthLimited } from '../../components/ProfileHistory';
import { StatusStrip } from '../../components/StatusPanels';
import { PageFrame } from '../../components/PageFrame';
import { completeRankedMatchAction, createRankedLobbyAction, joinLobbyAction, joinLobbyByCodeAction, startPreviewDemoSessionAction, startRankedMatchAction, submitRankedGuessAction } from '../actions';
import { rankedActionState, resolveSearchParams, searchValue, type SearchParamsInput } from '../page-helpers';
import styles from '../../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../../lib/auth-presentation';
import { resolvePlayPagePresentation } from './play-page-presentation';

export const dynamic = 'force-dynamic';
// Next route-segment config requires a statically analyzable literal. The policy test
// asserts this value equals MATCHMAKING_DEADLINE_POLICY.serverActionMaxDurationSeconds.
export const maxDuration = 100;

const rankedModeChoices = [
  { label: 'Standard', mode: 'standard_1v1', detail: 'Live automatic rated 1v1 queue with server-owned pairing and match creation.', availability: 'Live queue' },
  { label: 'Speed / Blitz', mode: 'speed_1v1', detail: '75-second shared puzzle; same guesses break by server solve time.', availability: 'Live when enabled' },
  { label: 'Classic', mode: 'classic_1v1', detail: 'Lower-pressure 1v1. Same-guess solves draw.', availability: 'Not live yet' },
  { label: 'Multiplayer', mode: 'multiplayer_lobby', detail: '2–4 player lobby ladder; rating separate from 1v1 modes.', availability: 'Not live yet' },
] as const;

type PlayPageProps = {
  searchParams?: SearchParamsInput;
};

export default async function PlayPage({ searchParams }: PlayPageProps): Promise<ReactElement> {
  const presentation = requireAuthPresentationConfiguration();
  const pagePresentation = await resolvePlayPagePresentation(presentation.mode, {
    resolveSearchParams: () => resolveSearchParams(searchParams),
    readRankedWorkspace: async (params) => {
      const api = await getWebApiSnapshot();
      const matchId = searchValue(params, 'matchId');
      const matchState = matchId ? await getRankedMatchState(matchId) : null;
      const matchResult = matchId ? await getRankedMatchResult(matchId) : null;
      return { api, matchId, matchState, matchResult, params };
    },
  });

  if (pagePresentation.kind === 'practice') {
    const { content } = pagePresentation;
    return (
      <PageFrame>
        <section className={styles.matchBanner} aria-labelledby="practice-play-heading">
          <div>
            <p className={styles.eyebrow}>{content.eyebrow}</p>
            <h1 id="practice-play-heading">{content.title}</h1>
            <p>{content.description}</p>
            <ul>
              {content.facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
            <div className={styles.actionRow}>
              <a className={styles.primaryButton} href={content.primaryAction.href}>{content.primaryAction.label}</a>
              {content.secondaryActions.map((action) => (
                <a className={styles.secondaryButton} href={action.href} key={action.href}>{action.label}</a>
              ))}
            </div>
          </div>
        </section>
      </PageFrame>
    );
  }

  const { api, matchId, matchState, matchResult, params } = pagePresentation.workspace;
  const actionState = rankedActionState(params);
  const hasLiveMatch = Boolean(matchId);
  const speedQueueEnabled = api.authority.status === 'enabled';
  const speedCatalogAvailable = api.authority.availability === 'authoritative';
  const speedAvailabilityLabel = api.authority.status === 'enabled'
    ? 'Live queue'
    : api.authority.status === 'disabled'
      ? 'Not live yet'
      : 'Live status unavailable';
  const liveMatchStateLabel = matchState?.data ? matchState.data.state : matchState?.status === 'unavailable' ? 'state unavailable' : 'loading';
  const queueSessionState = presentation.mode === 'disabled'
    ? 'signed_out'
    : api.currentUser.status === 'connected'
      ? 'active'
      : isAuthLimited(api.currentUser.error)
        ? 'signed_out'
        : 'unavailable';

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

      {!hasLiveMatch ? (
        <aside className={styles.practiceCta} aria-label="Guest practice">
          <div>
            <strong>Play now without an account</strong>
            <span>Practice · guest · not rated. A complete local game with no server writes.</span>
          </div>
          <a className={styles.primaryButton} href="/practice">Play practice</a>
        </aside>
      ) : null}

      <section className={styles.section} aria-labelledby="ranked-mode-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>Ranked modes</p>
          <h2 id="ranked-mode-heading">Choose a rated format</h2>
          <p>Standard and catalog-enabled Speed use separate live automatic queues. Classic and Multiplayer remain unavailable.</p>
        </div>
        <StandardQueuePanel sessionState={queueSessionState} sessionError={api.currentUser.error} authPresentationMode={presentation.mode} />
        <SpeedQueuePanel sessionState={queueSessionState} queueEnabled={speedQueueEnabled} catalogAvailable={speedCatalogAvailable} authPresentationMode={presentation.mode} />
        <div className={styles.modeChoiceGrid}>
          {rankedModeChoices.map((choice) => (
            <article className={styles.modeChoiceCard} key={choice.mode}>
              <div className={styles.cardTopline}>
                <h3>{choice.label}</h3>
                <span>{choice.mode === 'speed_1v1' ? speedAvailabilityLabel : choice.availability}</span>
              </div>
              <p className={styles.eyebrow}>{choice.mode}</p>
              <p className={styles.muted}>{choice.detail}</p>
              <div className={styles.actionRow}>
                <a className={choice.mode === 'standard_1v1' || (choice.mode === 'speed_1v1' && speedQueueEnabled) ? styles.primaryButton : styles.secondaryButton} href={choice.mode === 'standard_1v1' ? '#standard-queue' : choice.mode === 'speed_1v1' && speedQueueEnabled ? '#speed-queue' : '/profile#mode-ratings-heading'}>{choice.mode === 'standard_1v1' || (choice.mode === 'speed_1v1' && speedQueueEnabled) ? 'Find match' : 'View prepared mode'}</a>
              </div>
            </article>
          ))}
        </div>
        <article className={styles.practiceNote}>
          <strong>Ranked vs unranked</strong>
          <p>Standard and enabled Speed queues are rated and mode-isolated. Existing public lobbies remain a separate fallback; Classic, Multiplayer, and automatic unranked matchmaking are not live yet.</p>
        </article>
      </section>

      <div className={styles.playLayout}>
        <div className={styles.leftRail}>
          <StatusStrip api={api} />
          <LobbyBrowser
            apiLobbies={api.lobbies}
            actionState={actionState}
            previewSessionActive={api.currentUser.status === 'connected'}
            authPresentationMode={presentation.mode}
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
      <ProfileLeaderboard leaderboard={api.leaderboard} compactForLiveMatch={hasLiveMatch} />
    </PageFrame>
  );
}
