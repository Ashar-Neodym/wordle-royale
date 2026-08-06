import type { ReactElement } from 'react';
import { PageFrame } from './PageFrame';
import styles from './web-shell.module.css';

export function DisabledHome(): ReactElement {
  return (
    <PageFrame>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div>
          <p className={styles.eyebrow}>Browser practice</p>
          <h1 id="home-heading">A fresh Wordle round, ready now.</h1>
          <p>Play a new random word each round. You have six guesses, with clear letter feedback after every try.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="/practice">Start practice</a>
            <a className={styles.secondaryButton} href="/learn/rules">Rules</a>
          </div>
        </div>
        <aside className={styles.heroPreview} aria-labelledby="home-facts-heading">
          <p className={styles.eyebrow}>What you get</p>
          <strong id="home-facts-heading">Practice on your terms</strong>
          <p className={styles.muted}>Local and not rated</p>
          <p className={styles.muted}>Progress and stats stay in this browser</p>
          <p className={styles.muted}>No account or API request</p>
        </aside>
      </section>
      <section className={styles.section} aria-labelledby="home-how-heading">
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>How to play</p>
          <h2 id="home-how-heading">Three quick steps</h2>
        </div>
        <div className={styles.homeSteps}>
          <article className={styles.panel}><strong>1. Start a round</strong><p>A new random word is selected each round.</p></article>
          <article className={styles.panel}><strong>2. Make your guesses</strong><p>Find the word in six guesses.</p></article>
          <article className={styles.panel}><strong>3. Use the feedback</strong><p>Each letter is marked correct, present, or absent.</p></article>
        </div>
      </section>
    </PageFrame>
  );
}
