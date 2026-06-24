export const lobbyVisibilities = ['public', 'private'] as const;
export const lobbyStates = ['created', 'waiting', 'ready', 'starting', 'in_progress', 'completed', 'abandoned', 'cancelled', 'expired'] as const;
export const lobbyMemberRoles = ['host', 'player'] as const;
export const lobbyMemberStates = ['joined', 'disconnected', 'left', 'kicked'] as const;
export const gameModes = ['standard'] as const;
export const difficulties = ['easy', 'medium', 'hard'] as const;
export const matchmakingStates = ['queued', 'matched', 'cancelled', 'timed_out', 'failed'] as const;
export const disabledRatedLobbyReason = 'private_rated_lobbies_disabled_v1' as const;
