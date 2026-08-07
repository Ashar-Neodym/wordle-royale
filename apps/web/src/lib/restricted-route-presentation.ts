import {
  requireAuthPresentationConfiguration,
  publicAuthPresentation,
  type AuthPresentationPublic,
} from './auth-presentation.ts';

export const RESTRICTED_ROUTE_CONTENT = {
  lobbies: {
    pattern: '/lobbies',
    title: 'Ranked lobbies are unavailable',
    description: 'Creating, finding, and joining ranked rooms requires account and ranked services that are not active in this deployment.',
  },
  leaderboard: {
    pattern: '/leaderboard',
    title: 'The ranked leaderboard is unavailable',
    description: 'Ratings and ranked standings require account and ranked services that are not active in this deployment.',
  },
  profile: {
    pattern: '/profile',
    title: 'Player profiles are unavailable',
    description: 'Account profiles, ratings, and recent ranked matches are not available while account access is disabled.',
  },
  publicProfile: {
    pattern: '/profile/[handle]',
    title: 'Public profiles are unavailable',
    description: 'Public rating profiles and ranked match summaries are not available while ranked services are dormant.',
  },
  history: {
    pattern: '/history',
    title: 'Ranked match history is unavailable',
    description: 'Account-backed ranked history is not available while account access and ranked services are disabled.',
  },
  match: {
    pattern: '/matches/[matchId]',
    title: 'Ranked match details are unavailable',
    description: 'Ranked results and active match details are not available while ranked services are dormant.',
  },
  server: {
    pattern: '/server',
    title: 'Server status is unavailable',
    description: 'This browser-local Practice deployment does not expose ranked service status or diagnostics.',
  },
} as const;

export type RestrictedRouteId = keyof typeof RESTRICTED_ROUTE_CONTENT;

export const LOCAL_PUBLIC_PAGE_PATTERNS = [
  '/',
  '/practice',
  '/challenge',
  '/challenge/[challengeId]',
  '/learn/rules',
  '/play',
  '/account',
  '/settings',
] as const;

export const GATED_PUBLIC_PAGE_ROUTES = (Object.keys(RESTRICTED_ROUTE_CONTENT) as RestrictedRouteId[]).map((id) => ({
  id,
  pattern: RESTRICTED_ROUTE_CONTENT[id].pattern,
  apiBacked: true as const,
}));

export type RestrictedRoutePresentation<T> =
  | Readonly<{ kind: 'disabled'; routeId: RestrictedRouteId; presentation: AuthPresentationPublic }>
  | Readonly<{ kind: 'operational'; routeId: RestrictedRouteId; presentation: AuthPresentationPublic; value: T }>;

/**
 * Resolve the strict build-time account presentation before touching any request
 * input or operational dependency. The loader is deliberately lazy and is
 * invoked exactly once only for preview-demo and durable deployments.
 */
export async function resolveRestrictedRoute<T>(
  routeId: RestrictedRouteId,
  loadOperational: (presentation: AuthPresentationPublic) => Promise<T>,
  resolveConfiguration = requireAuthPresentationConfiguration,
): Promise<RestrictedRoutePresentation<T>> {
  const presentation = publicAuthPresentation(resolveConfiguration());
  if (presentation.mode === 'disabled') return { kind: 'disabled', routeId, presentation };
  const value = await loadOperational(presentation);
  return { kind: 'operational', routeId, presentation, value };
}
