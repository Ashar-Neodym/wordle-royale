export const matchStates = ['initializing', 'countdown', 'in_progress', 'round_intermission', 'finalizing', 'completed', 'abandoned', 'cancelled', 'voided'] as const;
export const roundStates = ['pending', 'countdown', 'active', 'finalizing', 'completed', 'voided'] as const;
export const playerRoundStates = ['not_started', 'active', 'solved', 'failed', 'timed_out', 'forfeited', 'disconnected', 'voided'] as const;
export const letterFeedbackStates = ['correct', 'present', 'absent'] as const;
export const guessRejectReasons = ['wrong_length', 'invalid_characters', 'not_in_dictionary', 'banned_word', 'round_not_active', 'already_solved', 'max_guesses_reached', 'deadline_passed', 'duplicate_request', 'idempotency_key_conflict', 'rate_limited'] as const;
export const scoringPresets = ['standard_v1'] as const;
