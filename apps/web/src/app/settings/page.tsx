import type { ReactElement } from 'react';
import { DisplaySettings } from '../../components/DisplaySettings';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import styles from '../../components/web-shell.module.css';

export default function SettingsPage(): ReactElement {
  return (
    <PageFrame>
      <PageHeader eyebrow="Settings" title="Player settings">
        <p>Adjust accessibility and display preferences for this browser. Account and session controls are separate.</p>
      </PageHeader>
      <DisplaySettings />
      <section className={styles.panelWide} aria-labelledby="account-settings-heading">
        <h2 id="account-settings-heading">Account and session</h2>
        <p className={styles.muted}>Display preferences are not account-synced. Open the separate account page to check account availability or manage a session.</p>
        <div className={styles.actionRow}><a className={styles.secondaryButton} href="/account">Open account and session</a></div>
      </section>
    </PageFrame>
  );
}
