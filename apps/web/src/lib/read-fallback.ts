export type ReadFallback = {
  title: string;
  message: string;
  retryLabel: string;
};

export function profileReadFallback(): ReadFallback {
  return {
    title: 'Profile unavailable',
    message: 'Live profile data could not be loaded. No fixture player is shown as your account.',
    retryLabel: 'Retry profile',
  };
}

export function leaderboardReadFallback(): ReadFallback {
  return {
    title: 'Live leaderboard unavailable',
    message: 'No fixture standings are mixed into this unavailable state.',
    retryLabel: 'Retry live leaderboard',
  };
}
