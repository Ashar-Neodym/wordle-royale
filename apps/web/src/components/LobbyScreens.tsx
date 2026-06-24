import { lobbyStates } from '../lib/tokens';
import { lobbyEnvelopes, lobbyFixtures } from '../lib/fixtures';
import { formatState, userById } from './data';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';

export function LobbyBrowser() {
  const lobbies = lobbyEnvelopes.listOpen.data ?? [];
  return (
    <section id="lobbies" className={styles.section} aria-labelledby="lobby-browser-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>Fixture route</p>
        <h2 id="lobby-browser-heading">Lobby browser + quick join</h2>
        <p>Uses shared lobby envelopes instead of backend calls. The quick join panel is mock-only and does not create client-authoritative state.</p>
      </div>
      <div className={styles.splitGrid}>
        <article className={styles.panel}>
          <h3>Quick join</h3>
          <p className={styles.muted}>Standard 5-letter, 6 guesses, 120s timer.</p>
          <div className={styles.joinBox}>GRID22</div>
          <button className={styles.primaryButton} type="button">Find fixture match</button>
        </article>
        <div className={styles.cardGrid}>
          {lobbies.map((lobby) => {
            const token = lobbyStates[lobby.state];
            return (
              <article className={styles.panel} key={lobby.id}>
                <div className={styles.cardTopline}>
                  <TokenBadge label={token.label} bg={token.bg} border={token.border} text={token.text} />
                  <span>{lobby.visibility}</span>
                </div>
                <h3>{lobby.code}</h3>
                <p>{lobby.members.length}/{lobby.maxPlayers} players · {lobby.roundsCount} rounds · {lobby.roundTimeSeconds}s</p>
                <p className={styles.muted}>{lobby.rated ? 'Rated' : 'Casual'} · {lobby.rankedCompatible ? 'Ranked-compatible' : 'Casual settings'}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WaitingRoom() {
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
