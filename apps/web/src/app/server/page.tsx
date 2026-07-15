import type { ReactElement } from 'react';
import { getWebApiSnapshot } from '../../lib/api-client';
import { PageFrame, PageHeader } from '../../components/PageFrame';
import { StatusStrip } from '../../components/StatusPanels';
import styles from '../../components/web-shell.module.css';

export const dynamic = 'force-dynamic';

export default async function ServerPage(): Promise<ReactElement> {
  const api = await getWebApiSnapshot();
  const dependencies = api.readiness.data?.dependencies ?? {};
  return (
    <PageFrame>
      <PageHeader eyebrow="Server" title="Live and fallback state">
        <p>This page keeps local demo health visible without making every product page feel technical.</p>
      </PageHeader>
      <StatusStrip api={api} />
      <section className={styles.section} aria-labelledby="server-details-heading">
        <article className={styles.panelWide}>
          <h2 id="server-details-heading">Connection details</h2>
          <div className={styles.serverRows}>
            <div><strong>API URL</strong><span>{api.health.apiUrl}</span></div>
            <div><strong>Health</strong><span>{api.health.status}</span></div>
            <div><strong>Readiness</strong><span>{api.readiness.data?.status ?? api.readiness.status}</span></div>
            <div><strong>Lobbies</strong><span>{api.lobbies.status}</span></div>
            <div><strong>Leaderboard</strong><span>{api.leaderboard.status}</span></div>
            <div><strong>Current profile</strong><span>{api.profile.status}</span></div>
          </div>
          {Object.keys(dependencies).length > 0 ? (
            <div className={styles.serverRows} aria-label="Dependency status">
              {Object.entries(dependencies).map(([name, value]) => {
                const status = typeof value === 'object' && value !== null && 'status' in value ? String(value.status) : String(value ?? 'unknown');
                return <div key={name}><strong>{name}</strong><span>{status}</span></div>;
              })}
            </div>
          ) : null}
          {api.health.status === 'unavailable' ? <p className={styles.warningText}>Server unavailable. Pages continue with fixture fallback where safe.</p> : null}
        </article>
      </section>
    </PageFrame>
  );
}
