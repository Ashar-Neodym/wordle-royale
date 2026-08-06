import type { ReactElement, ReactNode } from 'react';
import { SiteNav } from './SiteNav';
import styles from './web-shell.module.css';
import { publicAuthPresentation, requireAuthPresentationConfiguration, type AuthPresentationPublic } from '../lib/auth-presentation';

export function PageFrame({ children, showEnvironmentNotice = true }: { children: ReactNode; showEnvironmentNotice?: boolean }): ReactElement {
  const presentation = publicAuthPresentation(requireAuthPresentationConfiguration());
  return (
    <main className={styles.shell}>
      <SiteNav presentation={presentation} />
      {showEnvironmentNotice ? <EnvironmentNotice presentation={presentation} /> : null}
      {children}
    </main>
  );
}

function EnvironmentNotice({ presentation }: { presentation: AuthPresentationPublic }): ReactElement {
  if (presentation.mode === 'preview_demo') {
    return (
      <aside className={styles.previewNotice} aria-label="Public preview limitations">
        <strong>Public preview</strong>
        <span>Demo sessions only — no durable accounts in this deployment. Sessions, ratings, lobbies, match history, and demo profiles may reset. Mobile remains experimental until physical Expo Go smoke is complete.</span>
      </aside>
    );
  }
  if (presentation.mode === 'disabled') {
    return (
      <aside className={styles.previewNotice} aria-label="Account availability">
        <strong>Production</strong>
        <span>Account access is currently unavailable. Sign-in and registration are disabled for this deployment.</span>
      </aside>
    );
  }
  return (
    <aside className={styles.previewNotice} aria-label="Account availability">
      <strong>Production</strong>
      <span>Durable account access is active. {presentation.registrationMode === 'open'
        ? 'Public registration is open.'
        : presentation.registrationMode === 'canary'
          ? 'Registration is limited to a controlled canary; public signup is not open.'
          : 'Registration is closed; existing accounts may sign in.'}</span>
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
