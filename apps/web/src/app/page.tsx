import { tileStates } from '../lib/tokens';
import { gameplayFixtures } from '../lib/fixtures';
import { GameplayScreen } from '../components/GameplayScreen';
import { LobbyBrowser, WaitingRoom } from '../components/LobbyScreens';
import { MatchReport, ProfileLeaderboard } from '../components/ReportAndProfile';
import { StatusStrip } from '../components/StatusPanels';
import { WordTile } from '../components/WordTile';
import styles from '../components/web-shell.module.css';

export default function HomePage() {
  const previewGuess = gameplayFixtures.solvedRound.players[0]?.guesses.at(-1);
  return (
    <main className={styles.shell}>
      <nav className={styles.nav} aria-label="Primary">
        <a className={styles.brand} href="#top" id="top">
          <span className={styles.logoMark} aria-hidden="true">♛</span>
          <span>Wordle Royale</span>
        </a>
        <div className={styles.navLinks}>
          <a href="#lobbies">Lobbies</a>
          <a href="#waiting-room">Room</a>
          <a href="#gameplay">Gameplay</a>
          <a href="#report">Report</a>
          <a href="#leaderboard">Leaderboard</a>
        </div>
      </nav>

      <section className={styles.hero} aria-labelledby="hero-heading">
        <div>
          <p className={styles.eyebrow}>Crown Grid Arena</p>
          <h1 id="hero-heading">Fixture-driven web shell for the first playable loop.</h1>
          <p>
            A local Next.js app shell using shared design tokens, lobby/gameplay/report fixtures, accessible tile markers, and reusable loading/error/reconnect states.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#gameplay">View gameplay board</a>
            <a className={styles.secondaryButton} href="#lobbies">Browse mock lobbies</a>
          </div>
        </div>
        <aside className={styles.heroPreview} aria-label="Tile feedback legend">
          <p className={styles.eyebrow}>Tile feedback</p>
          <div className={styles.wordRow}>
            {previewGuess?.feedback.map((state, index) => <WordTile key={`${state}-${index}`} letter={previewGuess.guess[index] ?? ''} state={state} />)}
          </div>
          <p className={styles.muted}>Correct, present, and absent use token colors plus non-color markers: {tileStates.correct.icon}, {tileStates.present.icon}, {tileStates.absent.icon}.</p>
        </aside>
      </section>

      <StatusStrip />
      <LobbyBrowser />
      <WaitingRoom />
      <GameplayScreen />
      <MatchReport />
      <ProfileLeaderboard />
    </main>
  );
}
