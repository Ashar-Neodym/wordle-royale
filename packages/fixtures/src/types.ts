export type ApiEnvelope<T> = {
  data: T | null;
  error: FixtureApiError | null;
  requestId: string;
};

export type FixtureApiError = {
  code: string;
  message: string;
  field?: string;
  retryable: boolean;
};

export type ConsentScope = 'necessary_gameplay' | 'product_analytics' | 'training_insights_opt_in';
export type LobbyState = 'created' | 'waiting' | 'ready' | 'starting' | 'in_progress' | 'completed' | 'abandoned' | 'cancelled' | 'expired' | 'full' | 'locked' | 'host_left' | 'settings_changed';
export type MatchState = 'initializing' | 'countdown' | 'in_progress' | 'round_intermission' | 'finalizing' | 'completed' | 'abandoned' | 'cancelled' | 'voided';
export type RoundState = 'pending' | 'countdown' | 'active' | 'finalizing' | 'completed' | 'voided';
export type PlayerRoundState = 'not_started' | 'active' | 'solved' | 'failed' | 'timed_out' | 'forfeited' | 'disconnected' | 'voided';
export type ConnectionState = 'live' | 'unstable' | 'reconnecting' | 'resyncing' | 'reconnected' | 'offline' | 'failed';
export type TileFeedbackState = 'empty' | 'filled' | 'pending' | 'submitted' | 'correct' | 'present' | 'absent' | 'invalid' | 'locked' | 'disabled';

export type FixtureUser = {
  id: string;
  handle: string;
  displayName: string;
  avatarColor: string;
  rating: number;
  provisional: boolean;
};

export type LobbyMemberFixture = {
  userId: string;
  role: 'host' | 'player';
  ready: boolean;
  connected: boolean;
};

export type LobbyFixture = {
  id: string;
  code: string;
  state: LobbyState;
  visibility: 'public' | 'private';
  rated: boolean;
  rankedCompatible: boolean;
  minPlayers: number;
  maxPlayers: number;
  roundsCount: number;
  roundTimeSeconds: number;
  scoringPreset: 'standard_v1';
  members: LobbyMemberFixture[];
  disabledStartReason?: string;
};

export type GuessFixture = {
  guess: string;
  state: 'accepted' | 'rejected' | 'pending';
  feedback: TileFeedbackState[];
  errorCode?: string;
};

export type PlayerRoundFixture = {
  userId: string;
  state: PlayerRoundState;
  guesses: GuessFixture[];
  score: number;
  validGuessCount: number;
  solveTimeMs?: number;
};

export type GameplayFixture = {
  matchId: string;
  state: MatchState;
  round: {
    id: string;
    roundNumber: number;
    state: RoundState;
    startsAt: string;
    endsAt: string;
    serverNow: string;
    dictionaryVersion: string;
  };
  connection: ConnectionState;
  maxGuesses: number;
  wordLength: number;
  players: PlayerRoundFixture[];
  localUserId: string;
};

export type MatchReportFixture = {
  matchId: string;
  rated: boolean;
  shareCardEnabled: boolean;
  spoilerSafe: true;
  participants: Array<{
    userId: string;
    placement: number;
    totalScore: number;
    ratingBefore?: number;
    ratingAfter?: number;
    provisionalBefore?: boolean;
    provisionalAfter?: boolean;
  }>;
};
