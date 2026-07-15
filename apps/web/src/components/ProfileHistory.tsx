import type { ReactElement } from 'react';
import type { ApiClientResult } from '../lib/api-client';
import type { CurrentProfileSummary, MatchHistoryList, MatchHistorySummary, PublicProfileSummary } from '@wordle-royale/contracts';
import { rank, score } from '../lib/tokens';
import { profileReadFallback } from '../lib/read-fallback';
import { TokenBadge } from './StatusPanels';
import styles from './web-shell.module.css';
import { ServerReadRetryButton } from './ServerReadRetryButton';

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

type PreviewDemoSessionAction = (formData: FormData) => Promise<void>;

export function isAuthLimited(error: string | null | undefined): boolean {
  return /not[_\s-]?authenticated|session required|auth/i.test(error ?? '');
}

export function AuthRequiredPanel({
  title = 'Sign in required',
  message,
  previewDemoSessionAction,
  redirectTo = '/profile',
}: {
  title?: string;
  message?: string;
  previewDemoSessionAction?: PreviewDemoSessionAction;
  redirectTo?: string;
}): ReactElement {
  return (
    <article className={styles.authPanel} aria-live="polite">
      <div>
        <p className={styles.eyebrow}>Preview auth</p>
        <h2>{title}</h2>
        <p>{message ?? 'Public preview does not silently sign you in as a fixture player. Until real sessions are enabled, this current-player view stays limited instead of showing fake account data.'}</p>
      </div>
      <div className={styles.actionRow}>
        {previewDemoSessionAction ? (
          <form action={previewDemoSessionAction}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button className={styles.primaryButton} type="submit">Start preview demo</button>
          </form>
        ) : null}
        <a className={previewDemoSessionAction ? styles.secondaryButton : styles.primaryButton} href="/lobbies">Browse lobbies</a>
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

type ModeCard = {
  id: 'standard_1v1' | 'speed_1v1' | 'classic_1v1' | 'multiplayer_lobby';
  label: string;
  subtitle: string;
  status: 'live' | 'prepared' | 'unavailable';
  rating: number | null;
  provisionalGamesPlayed: number | null;
  provisionalGamesTotal: number;
  gamesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  abandons: number | null;
  recentDelta: number | null;
  graph: number[] | null;
};

type ModeDefinition = Pick<ModeCard, 'id' | 'label' | 'subtitle' | 'status' | 'provisionalGamesTotal'>;

const modeFallbacks: ModeDefinition[] = [
  { id: 'standard_1v1', label: 'Standard', subtitle: '1v1 · fewer guesses wins; same guesses draw', status: 'unavailable', provisionalGamesTotal: 10 },
  { id: 'speed_1v1', label: 'Speed / Blitz', subtitle: '1v1 · same guesses use server solve time', status: 'prepared', provisionalGamesTotal: 10 },
  { id: 'classic_1v1', label: 'Classic', subtitle: '1v1 · calmer clock; draw on same guesses', status: 'prepared', provisionalGamesTotal: 10 },
  { id: 'multiplayer_lobby', label: 'Multiplayer', subtitle: '2–4 player lobby ladder; pairwise placement rating', status: 'prepared', provisionalGamesTotal: 10 },
];

function summarizeStandardMode(profile: ProfileSummary): Pick<ModeCard, 'wins' | 'losses' | 'draws' | 'abandons' | 'recentDelta' | 'graph'> {
  const recent = profile.recentMatches.slice(0, 8);
  const recentDelta = recent.find((match) => match.viewer?.ratingDelta !== null && match.viewer?.ratingDelta !== undefined)?.viewer?.ratingDelta ?? null;
  const deltas = recent.map((match) => match.viewer?.ratingDelta ?? 0).reverse();
  const graph = deltas.length > 0 ? deltas.reduce<number[]>((points, delta) => [...points, points[points.length - 1]! + delta], [profile.rating.rating - deltas.reduce((sum, delta) => sum + delta, 0)]).slice(-6) : [profile.rating.rating, profile.rating.rating, profile.rating.rating];
  return {
    wins: profile.rating.wins,
    losses: profile.rating.losses,
    draws: profile.rating.draws,
    abandons: profile.rating.abandons,
    recentDelta,
    graph,
  };
}

function emptyModeCard(mode: ModeDefinition): ModeCard {
  return {
    ...mode,
    rating: null,
    provisionalGamesPlayed: null,
    gamesPlayed: null,
    wins: null,
    losses: null,
    draws: null,
    abandons: null,
    recentDelta: null,
    graph: null,
  };
}

function modeCards(profile: ProfileSummary | null): ModeCard[] {
  return modeFallbacks.map((mode) => {
    if (profile && mode.id === 'standard_1v1') {
      const summary = summarizeStandardMode(profile);
      return {
        ...mode,
        rating: profile.rating.rating,
        gamesPlayed: profile.rating.matchesPlayed,
        provisionalGamesPlayed: Math.max(0, mode.provisionalGamesTotal - profile.rating.provisionalRemaining),
        status: 'live',
        ...summary,
      };
    }
    return emptyModeCard(mode);
  });
}

function graphBars(points: number[]): ReactElement {
  const min = Math.min(...points);
  const max = Math.max(...points);
  return (
    <div className={styles.ratingSparkline} aria-label="Rating history from live Standard read model">
      {points.map((point, index) => {
        const height = max === min ? 45 : 22 + ((point - min) / (max - min)) * 46;
        return <span key={`${point}-${index}`} style={{ height: `${height}px` }} title={`${point}`} />;
      })}
    </div>
  );
}

export function ModeRatingCards({ profile }: { profile: ProfileSummary | null }): ReactElement {
  return (
    <div className={styles.modeGrid}>
      {modeCards(profile).map((mode) => {
        const isLive = mode.status === 'live';
        const badgeLabel = isLive ? 'Live read model' : mode.status === 'prepared' ? 'Prepared' : 'Awaiting profile';
        const provisionalLabel = isLive && mode.provisionalGamesPlayed !== null
          ? `Provisional: ${mode.provisionalGamesPlayed}/${mode.provisionalGamesTotal} games complete`
          : null;
        return (
          <article className={styles.modeCard} key={mode.id}>
            <div className={styles.cardTopline}>
              <div>
                <p className={styles.eyebrow}>{mode.id}</p>
                <h3>{mode.label}</h3>
              </div>
              <TokenBadge
                label={badgeLabel}
                bg={isLive ? rank.color.rated.bg : rank.color.provisional.bg}
                border={isLive ? rank.color.rated.border : rank.color.provisional.border}
                text={isLive ? rank.color.rated.text : rank.color.provisional.text}
              />
            </div>
            <p className={styles.muted}>{mode.subtitle}</p>
            <div className={isLive ? styles.modeRatingRow : styles.modePlaceholderRow}>
              <strong>{isLive ? mode.rating : 'Not live yet'}</strong>
              <span>{isLive ? (mode.recentDelta === null ? 'No recent change' : `${formatSigned(mode.recentDelta)} recent`) : 'Prepared UI only'}</span>
            </div>
            <div className={styles.miniStats} aria-label={`${mode.label} rating counters`}>
              <span>W {isLive ? mode.wins : '—'}</span>
              <span>L {isLive ? mode.losses : '—'}</span>
              <span>D {isLive ? mode.draws : '—'}</span>
              <span>A {isLive ? mode.abandons : '—'}</span>
              <span>{isLive ? mode.gamesPlayed : '—'} games</span>
            </div>
            <p className={styles.warningText}>{provisionalLabel ?? (mode.status === 'prepared' ? 'Mode-specific backend data is not live yet; this card intentionally avoids placeholder ratings or fake charts.' : 'Start a preview demo session or open a public profile to load live Standard rating counters.')}</p>
            {isLive && mode.graph !== null ? graphBars(mode.graph) : <div className={styles.ratingPlaceholder} aria-label={`${mode.label} has no live rating chart`}>No live rating chart yet</div>}
          </article>
        );
      })}
    </div>
  );
}

export function ProfileSummaryCard({
  profile,
  fallbackMessage,
}: {
  profile: ProfileSummary | null;
  fallbackMessage?: string;
}): ReactElement {
  if (!profile) {
    const fallback = profileReadFallback();
    return (
      <article className={styles.panelWide}>
        <h2>{fallback.title}</h2>
        <p className={styles.muted}>{fallbackMessage ?? fallback.message}</p>
        <p className={styles.warningText}>{fallback.message}</p>
        <div className={styles.actionRow}>
          <ServerReadRetryButton label={fallback.retryLabel} />
          <a className={styles.secondaryButton} href="/play">Play rated</a>
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
      <ServerReadRetryButton label="Retry history" />
    </article>
  );
}
