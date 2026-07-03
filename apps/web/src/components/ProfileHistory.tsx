import type { ReactElement } from 'react';
import type { ApiClientResult } from '../lib/api-client';
import type { CurrentProfileSummary, MatchHistoryList, MatchHistorySummary, PublicProfileSummary } from '@wordle-royale/contracts';
import { rank, score } from '../lib/tokens';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';

type ProfileSummary = CurrentProfileSummary | PublicProfileSummary;

function formatDate(value: string | null): string {
  if (!value) return 'not started';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatSigned(value: number | null): string {
  if (value === null) return 'unrated';
  return `${value >= 0 ? '+' : ''}${value}`;
}

function outcomeLabel(match: MatchHistorySummary): string {
  const viewer = match.viewer;
  if (!viewer) return match.status;
  const placement = viewer.placement ? `#${viewer.placement}` : '—';
  return `${placement} · ${viewer.outcome} · ${viewer.finalScore} pts`;
}

export function isAuthLimited(error: string | null | undefined): boolean {
  return /not[_\s-]?authenticated|session required|auth/i.test(error ?? '');
}

export function AuthRequiredPanel({ title = 'Sign in required', message }: { title?: string; message?: string }): ReactElement {
  return (
    <article className={styles.authPanel} aria-live="polite">
      <div>
        <p className={styles.eyebrow}>Preview auth</p>
        <h2>{title}</h2>
        <p>{message ?? 'Public preview does not silently sign you in as a fixture player. Until real sessions are enabled, this current-player view stays limited instead of showing fake account data.'}</p>
      </div>
      <div className={styles.actionRow}>
        <a className={styles.primaryButton} href="/lobbies">Browse lobbies</a>
        <a className={styles.secondaryButton} href="/leaderboard">View ratings</a>
      </div>
    </article>
  );
}

function ratingBadge(delta: number | null): ReactElement {
  if (delta === null) return <TokenBadge label="No rating" bg={rank.color.provisional.bg} border={rank.color.provisional.border} text={rank.color.provisional.text} />;
  const token = delta > 0 ? score.delta.positive : delta < 0 ? score.delta.negative : score.delta.neutral;
  return <TokenBadge label={`${formatSigned(delta)} MMR`} bg={token.bg} border={token.text} text={token.text} title={token.label} />;
}

export function ProfileSummaryCard({ profile, fallbackMessage }: { profile: ProfileSummary | null; fallbackMessage?: string }): ReactElement {
  if (!profile) {
    return (
      <article className={styles.panelWide}>
        <h2>Profile unavailable</h2>
        <p className={styles.muted}>{fallbackMessage ?? 'Live profile summary is not reachable. Showing navigation only.'}</p>
        <div className={styles.actionRow}>
          <a className={styles.primaryButton} href="/play">Play rated</a>
          <a className={styles.secondaryButton} href="/leaderboard">Ratings</a>
        </div>
      </article>
    );
  }

  const badge = profile.rating.provisional ? rank.color.provisional : rank.color.rated;
  return (
    <article className={styles.profileHeroCard}>
      <div>
        <p className={styles.eyebrow}>Player</p>
        <h2>{profile.displayName}</h2>
        <p className={styles.muted}>@{profile.handle} · {profile.rating.algorithm}</p>
      </div>
      <div className={styles.profileStatsGrid}>
        <div className={styles.metricCard}><span>Rating</span><strong>{profile.rating.rating}</strong></div>
        <div className={styles.metricCard}><span>Rank</span><strong>{profile.rating.rank ? `#${profile.rating.rank}` : '—'}</strong></div>
        <div className={styles.metricCard}><span>Games</span><strong>{profile.rating.matchesPlayed}</strong></div>
        <div className={styles.metricCard}><span>Status</span><TokenBadge label={profile.rating.unrated ? 'Unrated' : badge.label} bg={badge.bg} border={badge.border} text={badge.text} /></div>
      </div>
    </article>
  );
}

export function MatchHistoryRows({ matches, emptyLabel = 'No ranked matches yet.' }: { matches: MatchHistorySummary[]; emptyLabel?: string }): ReactElement {
  if (matches.length === 0) {
    return (
      <article className={styles.panelWide}>
        <h2>Empty history</h2>
        <p className={styles.muted}>{emptyLabel}</p>
        <a className={styles.primaryButton} href="/lobbies">Find a rated room</a>
      </article>
    );
  }

  return (
    <div className={styles.historyList}>
      {matches.map((match) => {
        const viewerDelta = match.viewer?.ratingDelta ?? null;
        return (
          <a className={styles.matchRow} href={`/matches/${encodeURIComponent(match.matchId)}`} key={match.matchId}>
            <span className={styles.placement}>{match.status === 'completed' ? 'Done' : match.status}</span>
            <div>
              <strong>{outcomeLabel(match)}</strong>
              <p>{match.mode} · {formatDate(match.completedAt ?? match.startedAt)} · {match.participants.length} players</p>
            </div>
            {ratingBadge(viewerDelta)}
          </a>
        );
      })}
    </div>
  );
}

export function HistoryStatusPanel({ history }: { history: ApiClientResult<MatchHistoryList> }): ReactElement | null {
  if (history.status === 'connected') return null;
  return (
    <article className={styles.errorPanel} aria-live="polite">
      <strong>History API unavailable</strong>
      <p>{history.error ?? 'The local API is offline. No fixture match history is shown here because history should not pretend to be real.'}</p>
    </article>
  );
}
