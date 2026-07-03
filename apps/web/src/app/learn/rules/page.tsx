import type { ReactElement } from 'react';
import { PageFrame, PageHeader } from '../../../components/PageFrame';
import styles from '../../../components/web-shell.module.css';

export default function RulesPage(): ReactElement {
  return (
    <PageFrame>
      <PageHeader eyebrow="Learn" title="Rules and fair play">
        <p>Short rules for ranked Wordle Royale. The game stays server-authoritative and active-play spoilers stay hidden.</p>
      </PageHeader>
      <section className={styles.rulesGrid} aria-label="Wordle Royale rules">
        <article className={styles.panel}>
          <h2>Match basics</h2>
          <p>Join or create a rated lobby, wait for enough players, then start a ranked match. Each round uses server state so players see feedback without receiving the answer.</p>
        </article>
        <article className={styles.panel}>
          <h2>Guessing</h2>
          <p>Submit valid five-letter guesses. Feedback marks correct, present, and absent letters. The UI sends guesses to the server; it does not score active rounds on the client.</p>
        </article>
        <article id="scoring" className={styles.panel}>
          <h2>Scoring and ratings</h2>
          <p>Faster solves, fewer guesses, and final standings feed the ranked result. Rating rows are marked provisional until enough games are played.</p>
        </article>
        <article id="fair-play" className={styles.panel}>
          <h2>Fair play</h2>
          <p>No active match page should expose plaintext answers, answer hashes, salts, or client-authoritative scoring. Fixture/demo state is labeled when the local API is offline.</p>
        </article>
      </section>
      <section className={styles.section} aria-labelledby="rules-next-heading">
        <article className={styles.panelWide}>
          <h2 id="rules-next-heading">Ready?</h2>
          <div className={styles.actionRow}>
            <a className={styles.primaryButton} href="/play">Play rated</a>
            <a className={styles.secondaryButton} href="/lobbies">Find lobby</a>
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
