import type { ReactElement } from 'react';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';
import { requireAuthPresentationConfiguration } from '../../lib/auth-presentation';

export default function SettingsPage(): ReactElement {
  const presentation = requireAuthPresentationConfiguration();
  if (presentation.mode === 'disabled') return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Account settings are unavailable">
        <p>This browser-local Practice deployment has no account, ranked, or shared profile settings.</p>
      </PageHeader>
      <section className={styles.panelWide} aria-labelledby="local-settings-heading">
        <h2 id="local-settings-heading">Keep playing locally</h2>
        <p className={styles.muted}>Practice progress and stats stay in this browser when local storage is available.</p>
        <div className={styles.actionRow}><a className={styles.primaryButton} href="/practice">Play Practice</a><a className={styles.secondaryButton} href="/learn/rules">Read the rules</a><a className={styles.secondaryButton} href="/">Return home</a></div>
      </section>
    </PageFrame>
  );
  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Player settings">
        <p>Account access now has a dedicated server-mediated home. Notification, privacy, and accessibility preferences remain unavailable until their durable contracts are ready.</p>
      </PageHeader>
      <section className={styles.panelWide} aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">Account and session</h2>
        <p className={styles.muted}>Check whether durable accounts are available, sign in, create an account, or close the current session.</p>
        <div className={styles.actionRow}><a className={styles.primaryButton} href="/account">Open account</a><a className={styles.secondaryButton} href="/profile">View profile</a></div>
      </section>
    </PageFrame>
  );
}
