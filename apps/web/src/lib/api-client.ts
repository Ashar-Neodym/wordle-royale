import type {
  CreateLobbyRequest,
  CurrentUserDto,
  JoinLobbyByCodeRequest,
  LobbyDto,
  PublicProfileDto,
  RankedMatchStartResponseData,
  StartRankedMatchRequest,
  CurrentRankedMatchStateResponseData,
  SubmitGuessRequest,
  GuessResult,
  CompleteRankedMatchRequest,
  RankedMatchResultSummary,
  SuccessEnvelope,
  CurrentProfileSummary,
  PublicProfileSummary,
  MatchHistoryList,
} from '@wordle-royale/contracts';
import { cookies } from 'next/headers';
import { matchmakingDeadlinePolicyFor } from './matchmaking-deadline-policy';

export const defaultApiUrl = 'http://127.0.0.1:3001';

export type ApiHealthPayload = {
  status: 'ok';
  service: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
  dependencies?: Record<string, unknown>;
};

export type ApiClientStatus = 'connected' | 'unavailable';

export type ApiClientResult<T> = {
  status: ApiClientStatus;
  apiUrl: string;
  data: T | null;
  requestId: string | null;
  error: string | null;
};

export type LobbyListPayload = {
  items: LobbyDto[];
  pagination: { nextCursor: string | null };
};

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  handle: string | null;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | null;
  algorithmConfigVersion: string | null;
};

export type LeaderboardPayload = {
  mode: 'standard_1v1' | 'speed_1v1' | 'classic_1v1' | 'multiplayer_lobby';
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | null;
  algorithmConfigVersion: string | null;
  generatedAt: string;
  entries: LeaderboardEntry[];
};

export type RatedProfilePayload = {
  userId: string;
  handle: string;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | null;
  algorithmConfigVersion: string | null;
  unrated: boolean;
};

export type Standard1v1TicketState = 'queued' | 'matched' | 'cancelled' | 'timed_out' | 'failed';

export type Standard1v1Ticket = {
  ticketId: string;
  state: Standard1v1TicketState;
  mode: 'standard_1v1';
  rated: true;
  userId: string;
  ratingAtQueue: number;
  provisional: boolean;
  searchWindow: {
    minRating: number;
    maxRating: number;
    expansionStep: 0 | 1 | 2 | 3 | 4;
  };
  estimatedWaitSeconds: number | null;
  matchedMatchId: string | null;
  matchedOpponent?: {
    userId: string;
    displayName: string;
    handle: string | null;
    ratingAtQueue: number;
    provisional: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  cancelledAt: string | null;
  timedOutAt: string | null;
};

export type CreateStandard1v1TicketRequest = {
  clientRequestId: string;
  mode: 'standard_1v1';
  rated: true;
  allowProvisionalOpponent?: boolean;
};

export type WebApiSnapshot = {
  health: ApiClientResult<ApiHealthPayload>;
  readiness: ApiClientResult<ApiHealthPayload>;
  currentUser: ApiClientResult<CurrentUserDto>;
  profile: ApiClientResult<PublicProfileDto>;
  lobbies: ApiClientResult<LobbyListPayload>;
  leaderboard: ApiClientResult<LeaderboardPayload>;
  ratedProfile: ApiClientResult<RatedProfilePayload>;
};

type ApiEnvelope<T> = SuccessEnvelope<T> | { data: null; error: { code: string; message: string; details?: Record<string, unknown> }; requestId: string };

type RequestOptions = RequestInit & { timeoutMs?: number };

async function forwardedCookieHeader(): Promise<string | undefined> {
  try {
    const store = await cookies();
    const serialized = store.getAll().map(({ name, value }) => `${name}=${encodeURIComponent(value)}`).join('; ');
    return serialized || undefined;
  } catch {
    return undefined;
  }
}

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || defaultApiUrl).replace(/\/$/, '');
}

function unavailable<T>(apiUrl: string, error: unknown): ApiClientResult<T> {
  return {
    status: 'unavailable',
    apiUrl,
    data: null,
    requestId: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiClientResult<T>> {
  const apiUrl = getApiBaseUrl();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 1200;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cookie = await forwardedCookieHeader();

  try {
    const response = await Promise.race([
      fetch(`${apiUrl}${path}`, {
        ...options,
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...options.headers,
        },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`API request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    if (response.status === 204) {
      return { status: 'connected', apiUrl, data: null, requestId: response.headers.get('x-request-id'), error: null };
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.error) {
      const code = envelope.error?.code ? `${envelope.error.code}: ` : '';
      throw new Error(`${code}${envelope.error?.message ?? `API request failed with HTTP ${response.status}`}`);
    }

    return { status: 'connected', apiUrl, data: envelope.data, requestId: envelope.requestId, error: null };
  } catch (error) {
    return unavailable<T>(apiUrl, error);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getHealth(): Promise<ApiClientResult<ApiHealthPayload>> {
  return requestEnvelope<ApiHealthPayload>('/healthz');
}

export async function getReadiness(): Promise<ApiClientResult<ApiHealthPayload>> {
  return requestEnvelope<ApiHealthPayload>('/readyz');
}

export async function getCurrentUser(): Promise<ApiClientResult<CurrentUserDto>> {
  return requestEnvelope<CurrentUserDto>('/auth/me');
}

export async function getProfile(): Promise<ApiClientResult<PublicProfileDto>> {
  return requestEnvelope<PublicProfileDto>('/profile/me');
}

export async function listLobbies(): Promise<ApiClientResult<LobbyListPayload>> {
  return requestEnvelope<LobbyListPayload>('/lobbies');
}

export async function createLobby(body: CreateLobbyRequest): Promise<ApiClientResult<LobbyDto>> {
  return requestEnvelope<LobbyDto>('/lobbies', { method: 'POST', body: JSON.stringify(body) });
}

export async function joinLobbyByCode(body: JoinLobbyByCodeRequest): Promise<ApiClientResult<LobbyDto>> {
  return requestEnvelope<LobbyDto>('/lobbies/join-code', { method: 'POST', body: JSON.stringify(body) });
}

export async function joinLobby(lobbyId: string, clientRequestId: string): Promise<ApiClientResult<LobbyDto>> {
  return requestEnvelope<LobbyDto>(`/lobbies/${encodeURIComponent(lobbyId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ clientRequestId }),
  });
}

export async function createStandard1v1Ticket(body: CreateStandard1v1TicketRequest): Promise<ApiClientResult<Standard1v1Ticket>> {
  return requestEnvelope<Standard1v1Ticket>('/matchmaking/standard-1v1/tickets', {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: matchmakingDeadlinePolicyFor('join').apiProxyMs,
  });
}

export async function getCurrentStandard1v1Ticket(): Promise<ApiClientResult<Standard1v1Ticket>> {
  return requestEnvelope<Standard1v1Ticket>('/matchmaking/standard-1v1/tickets/current', {
    timeoutMs: matchmakingDeadlinePolicyFor('reconnect').apiProxyMs,
  });
}

export async function getStandard1v1Ticket(ticketId: string): Promise<ApiClientResult<Standard1v1Ticket>> {
  return requestEnvelope<Standard1v1Ticket>(`/matchmaking/standard-1v1/tickets/${encodeURIComponent(ticketId)}`, {
    timeoutMs: matchmakingDeadlinePolicyFor('current_ticket').apiProxyMs,
  });
}

export async function cancelStandard1v1Ticket(ticketId: string): Promise<ApiClientResult<Standard1v1Ticket>> {
  return requestEnvelope<Standard1v1Ticket>(`/matchmaking/standard-1v1/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'DELETE',
    timeoutMs: matchmakingDeadlinePolicyFor('cancel').apiProxyMs,
  });
}

export async function startRankedMatch(body: StartRankedMatchRequest): Promise<ApiClientResult<RankedMatchStartResponseData>> {
  return requestEnvelope<RankedMatchStartResponseData>('/matches/ranked/start', { method: 'POST', body: JSON.stringify(body) });
}

export async function getRankedMatchState(matchId: string): Promise<ApiClientResult<CurrentRankedMatchStateResponseData>> {
  return requestEnvelope<CurrentRankedMatchStateResponseData>(`/matches/${encodeURIComponent(matchId)}/state`);
}

export async function submitGuess(body: SubmitGuessRequest): Promise<ApiClientResult<GuessResult>> {
  return requestEnvelope<GuessResult>(`/matches/${encodeURIComponent(body.matchId)}/rounds/${encodeURIComponent(body.roundId)}/guesses`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function completeRankedMatch(body: CompleteRankedMatchRequest): Promise<ApiClientResult<RankedMatchResultSummary>> {
  return requestEnvelope<RankedMatchResultSummary>(`/matches/${encodeURIComponent(body.matchId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRankedMatchResult(matchId: string): Promise<ApiClientResult<RankedMatchResultSummary>> {
  return requestEnvelope<RankedMatchResultSummary>(`/matches/${encodeURIComponent(matchId)}/result`);
}

export async function getLeaderboard(limit = 20): Promise<ApiClientResult<LeaderboardPayload>> {
  return requestEnvelope<LeaderboardPayload>(`/leaderboard?limit=${encodeURIComponent(String(limit))}`);
}

export async function getRatedProfile(handle = 'alice'): Promise<ApiClientResult<RatedProfilePayload>> {
  return requestEnvelope<RatedProfilePayload>(`/profiles/${encodeURIComponent(handle)}/rating`);
}

export async function getCurrentProfileSummary(): Promise<ApiClientResult<CurrentProfileSummary>> {
  return requestEnvelope<CurrentProfileSummary>('/profiles/me/summary');
}

export async function getPublicProfileSummary(handle: string): Promise<ApiClientResult<PublicProfileSummary>> {
  return requestEnvelope<PublicProfileSummary>(`/profiles/${encodeURIComponent(handle)}/summary`);
}

export async function getMatchHistory(limit = 20, cursor?: string): Promise<ApiClientResult<MatchHistoryList>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return requestEnvelope<MatchHistoryList>(`/matches/history/me?${params.toString()}`);
}

export async function getWebApiSnapshot(): Promise<WebApiSnapshot> {
  const [health, readiness, currentUser, profile, lobbies, leaderboard, ratedProfile] = await Promise.all([
    getHealth(),
    getReadiness(),
    getCurrentUser(),
    getProfile(),
    listLobbies(),
    getLeaderboard(20),
    getRatedProfile('alice'),
  ]);

  return { health, readiness, currentUser, profile, lobbies, leaderboard, ratedProfile };
}
