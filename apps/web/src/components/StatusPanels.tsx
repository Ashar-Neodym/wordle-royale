import type { ReactElement } from 'react';
import { lobbyStates, rank, score } from '../lib/tokens';
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
  const ready = lobbyStates.ready;
  const isConnected = api.health.status === 'connected';
  const readinessStatus = api.readiness.data?.status ?? api.readiness.status;
  const dependencies = api.readiness.data?.dependencies ?? {};
  const dependencySummary = Object.entries(dependencies)
    .map(([name, value]) => {
      const status = typeof value === 'object' && value !== null && 'status' in value ? String(value.status) : 'unknown';
      return `${name}: ${status}`;
    })
    .join(' · ');

  return (
    <section className={styles.statusGrid} aria-label="Server and rating status">
      <div className={styles.statusCard} role={isConnected ? undefined : 'alert'}>
        <div>
          <strong>{isConnected ? `Server online · ${readinessStatus}` : 'Server offline · fixture mode'}</strong>
          <p>
            {isConnected
              ? dependencySummary || `${api.health.data?.service ?? 'API'} ready`
              : `Showing local fixtures because ${api.health.apiUrl} is unavailable${api.health.error ? `: ${api.health.error}` : '.'}`}
          </p>
        </div>
      </div>
      <div className={styles.statusCard}>
        <TokenBadge label={ready.label} bg={ready.bg} border={ready.border} text={ready.text} />
        <TokenBadge label={rank.color.provisional.label} bg={rank.color.provisional.bg} border={rank.color.provisional.border} text={rank.color.provisional.text} />
        <TokenBadge label="+36 MMR" bg={score.delta.positive.bg} border={score.delta.positive.text} text={score.delta.positive.text} title={score.delta.positive.label} />
      </div>
    </section>
  );
}
