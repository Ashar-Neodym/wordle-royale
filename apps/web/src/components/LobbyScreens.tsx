import type { ReactElement } from 'react';
import { lobbyStates } from '../lib/tokens';
import { lobbyEnvelopes, lobbyFixtures } from '../lib/fixtures';
import type { ApiClientResult, LobbyListPayload } from '../lib/api-client';
import { formatState, userById } from './data';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';

type DisplayLobby = {
  id: string;
  code: string;
  state: keyof typeof lobbyStates;
  visibility: string;
  membersCount: number;
  maxPlayers: number;
  roundsCount: number;
  roundTimeSeconds: number;
  rated: boolean;
  rankedCompatible: boolean;
};

type LobbyActionState = {
  action: string | undefined;
  status: string | undefined;
  message: string | undefined;
  lobbyId: string | undefined;
  lobbyCode: string | undefined;
  matchId: string | undefined;
  roundId: string | undefined;
};

type FormAction = (formData: FormData) => Promise<void>;
type ButtonAction = () => Promise<void>;

type LobbyBrowserProps = {
  apiLobbies: ApiClientResult<LobbyListPayload>;
  actionState: LobbyActionState;
  createRankedLobbyAction: ButtonAction;
  joinLobbyByCodeAction: FormAction;
  joinLobbyAction: FormAction;
  startRankedMatchAction: FormAction;
};

function fixtureLobbyToDisplay(lobby: NonNullable<typeof lobbyEnvelopes.listOpen.data>[number]): DisplayLobby {
  return {
    id: lobby.id,
    code: lobby.code,
    state: lobby.state,
    visibility: lobby.visibility,
    membersCount: lobby.members.length,
    maxPlayers: lobby.maxPlayers,
    roundsCount: lobby.roundsCount,
    roundTimeSeconds: lobby.roundTimeSeconds,
    rated: lobby.rated,
    rankedCompatible: lobby.rankedCompatible,
  };
}

function apiLobbyToDisplay(lobby: LobbyListPayload['items'][number]): DisplayLobby {
  return {
    id: lobby.id,
    code: lobby.code,
    state: lobby.state,
    visibility: lobby.settings.visibility,
    membersCount: lobby.members.length,
    maxPlayers: lobby.settings.maxPlayers,
    roundsCount: lobby.settings.roundsCount,
    roundTimeSeconds: lobby.settings.roundTimeSeconds,
    rated: lobby.settings.rated,
    rankedCompatible: lobby.rankedCompatible,
  };
}

function actionCopy(actionState: LobbyActionState): string | null {
  if (!actionState.status) return null;
  if (actionState.status === 'error') return actionState.message ?? 'Action failed.';
  if (actionState.action === 'create_lobby') return `Created live ranked lobby ${actionState.lobbyCode ?? actionState.lobbyId}. Join it once to add the local guest, then start ranked.`;
  if (actionState.action === 'join_code' || actionState.action === 'join_lobby') return `Joined live lobby ${actionState.lobbyCode ?? actionState.lobbyId}.`;
  if (actionState.action === 'start_ranked') return `Started ranked match ${actionState.matchId}; round ${actionState.roundId}.`;
  return 'Action completed.';
}

function lobbyInviteText(lobby: DisplayLobby): string {
  const base = process.env.NEXT_PUBLIC_WEB_URL?.trim().replace(/\/$/, '') ?? '';
  const path = `/lobbies?code=${encodeURIComponent(lobby.code)}`;
  return `Join my Wordle Royale room ${lobby.code}: ${base}${path}`;
}

export function LobbyBrowser({ apiLobbies, actionState, createRankedLobbyAction, joinLobbyByCodeAction, joinLobbyAction, startRankedMatchAction }: LobbyBrowserProps): ReactElement {
  const fixtureLobbies = lobbyEnvelopes.listOpen.data ?? [];
  const apiLobbyData = apiLobbies.status === 'connected' ? apiLobbies.data : null;
  const usingApiLobbies = apiLobbyData !== null;
  const lobbies = apiLobbyData ? apiLobbyData.items.map(apiLobbyToDisplay) : fixtureLobbies.map(fixtureLobbyToDisplay);
  const sourceLabel = apiLobbies.status === 'connected' ? 'Local API route' : 'Fixture fallback';
  const feedback = actionCopy(actionState);

  return (
    <section id="lobbies" className={styles.section} aria-labelledby="lobby-browser-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>{sourceLabel}</p>
        <h2 id="lobby-browser-heading">Lobbies</h2>
        <p>
          {usingApiLobbies
            ? `${lobbies.length} open room(s) on the local server. Create a rated room, join it once for the local guest, then start.`
            : `Server offline at ${apiLobbies.apiUrl}. Showing fixture rooms; live actions are disabled.`}
        </p>
      </div>
      {feedback ? (
        <article className={actionState.status === 'error' ? styles.errorPanel : styles.successPanel} aria-live="polite">
          <strong>{actionState.status === 'error' ? 'Action needs attention' : 'Live action complete'}</strong>
          <p>{feedback}</p>
        </article>
      ) : null}
      <div className={styles.splitGrid}>
        <article className={styles.panel}>
          <h3>Play rated</h3>
          <p className={styles.muted}>Create a public rated room. For the local smoke flow, join the room once to add the guest before starting.</p>
          <form action={createRankedLobbyAction}>
            <button className={styles.primaryButton} type="submit" disabled={!usingApiLobbies}>Create rated room</button>
          </form>
          <form action={joinLobbyByCodeAction} className={styles.inlineForm}>
            <label htmlFor="join-code">Join by code</label>
            <input id="join-code" name="code" placeholder="ABC123" maxLength={12} />
            <button className={styles.secondaryButton} type="submit" disabled={!usingApiLobbies}>Join live code</button>
          </form>
          {!usingApiLobbies ? <p className={styles.warningText}>Server offline. Fixture rooms are view-only.</p> : null}
        </article>
        <div className={styles.cardGrid}>
          {usingApiLobbies && lobbies.length === 0 ? (
            <article className={styles.panel}>
              <div className={styles.cardTopline}>
                <TokenBadge label="Live API" bg={lobbyStates.ready.bg} border={lobbyStates.ready.border} text={lobbyStates.ready.text} />
                <span>empty</span>
              </div>
              <h3>No open lobbies</h3>
              <p>The API responded successfully; create a ranked lobby to populate this list.</p>
            </article>
          ) : null}
          {lobbies.map((lobby) => {
            const token = lobbyStates[lobby.state];
            const canStartRanked = usingApiLobbies && lobby.rankedCompatible && lobby.membersCount >= 2;
            return (
              <article className={styles.panel} key={lobby.id}>
                <div className={styles.cardTopline}>
                  <TokenBadge label={token.label} bg={token.bg} border={token.border} text={token.text} />
                  <span>{lobby.visibility}</span>
                </div>
                <h3>{lobby.code}</h3>
                <p>{lobby.membersCount}/{lobby.maxPlayers} players · {lobby.roundsCount} rounds · {lobby.roundTimeSeconds}s</p>
                <p className={styles.muted}>{lobby.rated ? 'Rated' : 'Casual'} · {lobby.rankedCompatible ? 'Ranked-compatible' : 'Casual settings'}</p>
                <details className={styles.shareDetails}>
                  <summary>Invite / share</summary>
                  <label htmlFor={`invite-${lobby.id}`}>Safe invite copy</label>
                  <textarea id={`invite-${lobby.id}`} className={styles.shareTextArea} readOnly value={lobbyInviteText(lobby)} />
                  <p>Contains only the room code and lobby link; no account data or answers.</p>
                </details>
                {usingApiLobbies ? (
                  <div className={styles.actionRow}>
                    <form action={joinLobbyAction}>
                      <input type="hidden" name="lobbyId" value={lobby.id} />
                      <button className={styles.secondaryButton} type="submit">Join</button>
                    </form>
                    <form action={startRankedMatchAction}>
                      <input type="hidden" name="lobbyId" value={lobby.id} />
                      <button className={styles.primaryButton} type="submit" disabled={!canStartRanked}>Start ranked</button>
                    </form>
                  </div>
                ) : null}
                {usingApiLobbies && !canStartRanked ? <p className={styles.warningText}>Ranked start guarded: needs a live ranked-compatible lobby with at least 2 members.</p> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WaitingRoom(): ReactElement {
  const lobby = lobbyFixtures.privateWaiting;
  const token = lobbyStates[lobby.state];
  return (
    <section id="waiting-room" className={styles.section} aria-labelledby="waiting-room-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>Lobby waiting room</p>
        <h2 id="waiting-room-heading">Crown room {lobby.code}</h2>
        <p>Host/readiness UI comes from fixture lobby state and tokenized badges.</p>
      </div>
      <article className={styles.panelWide}>
        <div className={styles.roomSummary}>
          <TokenBadge label={token.label} bg={token.bg} border={token.border} text={token.text} />
          <span>{formatState(lobby.disabledStartReason ?? 'ready')}</span>
          <button className={styles.secondaryButton} type="button" disabled>Start disabled</button>
        </div>
        <div className={styles.memberGrid}>
          {lobby.members.map((member) => {
            const user = userById(member.userId);
            const readyToken = lobbyStates[member.ready ? 'ready' : 'waiting'];
            return (
              <div className={styles.memberRow} key={member.userId}>
                <span className={styles.avatar} style={{ backgroundColor: user.avatarColor }}>{user.displayName.slice(0, 1)}</span>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>{member.role === 'host' ? '♛ Host' : 'Player'} · {member.connected ? 'Connected' : 'Disconnected'}</p>
                </div>
                <TokenBadge label={readyToken.label} bg={readyToken.bg} border={readyToken.border} text={readyToken.text} />
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
