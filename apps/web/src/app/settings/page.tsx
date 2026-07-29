import type { ReactElement } from 'react';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export default function SettingsPage(): ReactElement {
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
