import { connectionStates } from '../lib/tokens';
import { gameplayFixtures } from '../lib/fixtures';
import { formatState, userById } from './data';
import { TokenBadge } from './StatusPanels';
import { EmptyTileRow, WordTile } from './WordTile';
import styles from './web-shell.module.css';

export function GameplayScreen() {
  const gameplay = gameplayFixtures.solvedRound;
  const reconnect = gameplayFixtures.reconnecting;
  const localPlayer = gameplay.players.find((player) => player.userId === gameplay.localUserId) ?? gameplay.players[0];
  const connectionToken = connectionStates[gameplay.connection];
  const reconnectToken = connectionStates[reconnect.connection];

  return (
    <section id="gameplay" className={styles.section} aria-labelledby="gameplay-heading">
      <div className={styles.sectionHeader}>
        <p className={styles.eyebrow}>Gameplay fixture</p>
        <h2 id="gameplay-heading">Server-shaped gameplay board</h2>
        <p>Renders accepted feedback from fixtures only. No answer validation, scoring authority, or timer authority is implemented client-side.</p>
      </div>
      <div className={styles.gameShell}>
        <article className={styles.boardPanel}>
          <div className={styles.cardTopline}>
            <TokenBadge label={connectionToken.label} bg={connectionToken.bg} border={connectionToken.border} text={connectionToken.text} />
            <span>Round {gameplay.round.roundNumber} · {formatState(gameplay.state)}</span>
          </div>
          <div className={styles.wordGrid} role="grid" aria-label="Fixture word grid with color and non-color indicators">
            {localPlayer.guesses.map((guess, rowIndex) => (
              <div className={styles.wordRow} role="row" key={`${guess.guess}-${rowIndex}`}>
                {guess.feedback.map((state, tileIndex) => (
                  <WordTile key={`${guess.guess}-${tileIndex}`} letter={guess.guess[tileIndex] ?? ''} state={state} />
                ))}
              </div>
            ))}
            {Array.from({ length: Math.max(0, gameplay.maxGuesses - localPlayer.guesses.length) }, (_, index) => (
              <div className={styles.wordRow} role="row" key={`empty-${index}`}><EmptyTileRow count={gameplay.wordLength} /></div>
            ))}
          </div>
        </article>
        <aside className={styles.sidePanel}>
          <h3>Players</h3>
          {gameplay.players.map((player) => {
            const user = userById(player.userId);
            return (
              <div className={styles.progressRow} key={player.userId}>
                <span className={styles.avatar} style={{ backgroundColor: user.avatarColor }}>{user.displayName.slice(0, 1)}</span>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>{formatState(player.state)} · {player.score} pts · {player.validGuessCount} guesses</p>
                </div>
              </div>
            );
          })}
          <div className={styles.reconnectBox} aria-live={reconnectToken.ariaLive}>
            <TokenBadge label={reconnectToken.label} bg={reconnectToken.bg} border={reconnectToken.border} text={reconnectToken.text} />
            <p>Reusable reconnect state pauses input until server resync completes.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
