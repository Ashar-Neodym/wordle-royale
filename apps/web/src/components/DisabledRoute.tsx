import type { ReactElement } from 'react';
import { PageFrame, PageHeader } from './PageFrame';
import styles from './web-shell.module.css';
import { RESTRICTED_ROUTE_CONTENT, type RestrictedRouteId } from '../lib/restricted-route-presentation';

export function DisabledRoute({ routeId }: { routeId: RestrictedRouteId }): ReactElement {
  const content = RESTRICTED_ROUTE_CONTENT[routeId];
  return (
    <PageFrame>
      <PageHeader eyebrow="Practice MVP" title={content.title}>
        <p>{content.description}</p>
      </PageHeader>
      <section className={styles.panelWide} aria-labelledby="disabled-route-heading">
        <h2 id="disabled-route-heading">Practice remains available</h2>
        <p>This production deployment is intentionally browser-local. Accounts, ranked play, shared ratings, and multiplayer server features are unavailable, but you can play a complete unrated Practice game without signing in.</p>
        <div className={styles.actionRow}>
          <a className={styles.primaryButton} href="/practice">Play Practice</a>
          <a className={styles.secondaryButton} href="/learn/rules">Read the rules</a>
          <a className={styles.secondaryButton} href="/">Return home</a>
        </div>
      </section>
    </PageFrame>
  );
}
