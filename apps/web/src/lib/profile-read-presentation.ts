export type ReadStatus = 'connected' | 'unavailable';

export type LeaderboardDisplayMode = 'unavailable' | 'live' | 'empty';

export function currentProfilePageTitle(
  profile: { displayName: string } | null,
  authLimited: boolean,
): string {
  if (profile) return profile.displayName;
  return authLimited ? 'Preview profile' : 'Preview player';
}

export function leaderboardDisplayMode(status: ReadStatus, liveRowCount: number): LeaderboardDisplayMode {
  if (status === 'unavailable') return 'unavailable';
  return liveRowCount > 0 ? 'live' : 'empty';
}
