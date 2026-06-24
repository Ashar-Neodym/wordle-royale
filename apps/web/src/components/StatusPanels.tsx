import { connectionStates, lobbyStates, rank, score } from '../lib/tokens';
import { lobbyEnvelopes, statusFixtures } from '../lib/fixtures';
import styles from './web-shell.module.css';

type BadgeProps = { label: string; bg: string; border: string; text: string; title?: string };

export function TokenBadge({ label, bg, border, text, title }: BadgeProps) {
  return (
    <span className={styles.badge} style={{ backgroundColor: bg, borderColor: border, color: text }} title={title}>
      {label}
    </span>
  );
}

export function StatusStrip() {
  const reconnecting = connectionStates.reconnecting;
  const resyncing = connectionStates.resyncing;
  const ready = lobbyStates.ready;
  const joinError = lobbyEnvelopes.joinFull.error;
  return (
    <section className={styles.statusGrid} aria-label="Reusable loading, error, reconnect, and ranking states">
      <div className={styles.statusCard}>
        <span className={styles.spinner} aria-hidden="true" />
        <div>
          <strong>{statusFixtures.loading.label}</strong>
          <p>Stable loading card for screen shells and mock data transitions.</p>
        </div>
      </div>
      <div className={styles.statusCard} style={{ borderColor: reconnecting.border }} aria-live={reconnecting.ariaLive}>
        <strong style={{ color: reconnecting.text }}>{reconnecting.label}</strong>
        <p>Gameplay input pauses while the server state reconnects.</p>
      </div>
      <div className={styles.statusCard} style={{ borderColor: resyncing.border }} aria-live={resyncing.ariaLive}>
        <strong style={{ color: resyncing.text }}>{resyncing.label}</strong>
        <p>Fixture-driven state resync after connection recovery.</p>
      </div>
      <div className={styles.statusCard} role="alert">
        <strong>{joinError?.code ?? 'ERROR'}</strong>
        <p>{joinError?.message ?? 'Something went wrong.'}</p>
      </div>
      <div className={styles.statusCard}>
        <TokenBadge label={ready.label} bg={ready.bg} border={ready.border} text={ready.text} />
        <TokenBadge label={rank.color.provisional.label} bg={rank.color.provisional.bg} border={rank.color.provisional.border} text={rank.color.provisional.text} />
        <TokenBadge label="+36 MMR" bg={score.delta.positive.bg} border={score.delta.positive.text} text={score.delta.positive.text} title={score.delta.positive.label} />
      </div>
    </section>
  );
}
