import type { ReactElement, ReactNode } from 'react';
import { SiteNav } from './SiteNav';
import styles from './web-shell.module.css';

export function PageFrame({ children }: { children: ReactNode }): ReactElement {
  return (
    <main className={styles.shell}>
      <SiteNav />
      <PreviewNotice />
      {children}
    </main>
  );
}

function PreviewNotice(): ReactElement {
  return (
    <aside className={styles.previewNotice} aria-label="Public preview limitations">
      <strong>Public preview</strong>
      <span>Demo sessions only — no durable accounts yet. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.</span>
    </aside>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }): ReactElement {
  return (
    <section className={styles.pageHeader} aria-labelledby="page-heading">
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 id="page-heading">{title}</h1>
      <div>{children}</div>
    </section>
  );
}

export function PlaceholderPage({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }): ReactElement {
  return (
    <PageFrame>
      <PageHeader eyebrow={eyebrow} title={title}>{children}</PageHeader>
      <section className={styles.section} aria-labelledby="placeholder-next-heading">
        <article className={styles.panelWide}>
          <h2 id="placeholder-next-heading">Not production account state yet</h2>
          <p className={styles.muted}>This page is part of the route shell so navigation has a stable home. It does not add auth, history APIs, hidden match data, or client-side scoring authority.</p>
          <div className={styles.actionRow}>
            <a className={styles.primaryButton} href="/play">Play rated</a>
            <a className={styles.secondaryButton} href="/leaderboard">Ratings</a>
          </div>
        </article>
      </section>
    </PageFrame>
  );
}
