import type { ReactElement } from 'react';
import type { WebApiSnapshot } from '../lib/api-client';
import styles from './web-shell.module.css';

type BadgeProps = { label: string; bg: string; border: string; text: string; title?: string };

export function TokenBadge({ label, bg, border, text, title }: BadgeProps): ReactElement {
  return (
    <span className={styles.badge} style={{ backgroundColor: bg, borderColor: border, color: text }} title={title}>
      {label}
    </span>
  );
}

export function StatusStrip({ api }: { api: WebApiSnapshot }): ReactElement {
  const isAuthoritative = api.authority.availability === 'authoritative';
  const readinessStatus = api.readiness.data?.status ?? api.readiness.status;
  const dependencies = api.readiness.data?.dependencies ?? {};
  const dependencySummary = Object.entries(dependencies)
    .map(([name, value]) => {
      const status = typeof value === 'object' && value !== null && 'status' in value ? String(value.status) : 'unknown';
      return `${name}: ${status}`;
    })
    .join(' · ');

  return (
    <section className={styles.statusGrid} aria-label="Server status">
      <div className={styles.statusCard} role={isAuthoritative ? undefined : 'alert'}>
        <div>
          <strong>{isAuthoritative ? `Authoritative API online · ${readinessStatus}` : 'Authoritative API truth unavailable'}</strong>
          <p>
            {isAuthoritative
              ? `${dependencySummary || `${api.health.data?.service ?? 'API'} ready`} · Origin ${api.authority.apiOrigin ?? 'unavailable'} · Revision ${api.authority.apiRevision.slice(0, 12)}`
              : `${api.authority.reason ?? 'Authoritative API evidence is incomplete.'} Origin ${api.authority.apiOrigin ?? 'unconfigured'} · Web ${api.authority.webRevision.slice(0, 12)} · API ${api.authority.apiRevision.slice(0, 12)}`}
          </p>
        </div>
      </div>
    </section>
  );
}
