import {
  apiHealthPayloadSchema,
  apiReadinessPayloadSchema,
  errorEnvelopeSchema,
  rankedMatchResultSummarySchema,
  rankedModesPayloadSchema,
  runtimeCompatibilityPayloadSchema,
  unknownSuccessEnvelopeSchema,
  type ApiHealthPayload,
  type ApiReadinessPayload,
  type RuntimeCompatibilityPayload,
  type RankedModesPayload,
  type CreateLobbyRequest,
  type CurrentUserDto,
  type JoinLobbyByCodeRequest,
  type LobbyDto,
  type PublicProfileDto,
  type RankedMatchStartResponseData,
  type StartRankedMatchRequest,
  type CurrentRankedMatchStateResponseData,
  type SubmitGuessRequest,
  type GuessResult,
  type CompleteRankedMatchRequest,
  type RankedMatchResultSummary,
  type CurrentProfileSummary,
  type PublicProfileSummary,
  type MatchHistoryList,
  type CreateSpeed1v1TicketRequest,
  type Speed1v1Ticket,
  type SpeedMatchSnapshot,
  type MarkSpeedMatchReadyRequest,
  type ForfeitSpeedMatchRequest,
} from '@wordle-royale/contracts';
import { cookies } from 'next/headers.js';
import { matchmakingDeadlinePolicyFor } from './matchmaking-deadline-policy.ts';
import { SPEED_MUTATION_POLICY } from './speed-mutation-policy.ts';
import type { LobbyBrowserQuery } from './lobby-pagination.ts';
import {
  assessWebApiAuthority,
  resolveApiOriginConfiguration,
  webDeploymentRevision,
  type WebApiAuthority,
} from './api-authority.ts';

export const defaultApiUrl = 'http://127.0.0.1:3001';
export type { ApiHealthPayload, ApiReadinessPayload, RankedModesPayload, RuntimeCompatibilityPayload };

export type ApiClientStatus = 'connected' | 'unavailable';

export type ApiClientResult<T> = {
  status: ApiClientStatus;
  apiUrl: string;
  data: T | null;
  requestId: string | null;
  error: string | null;
  errorCode?: string | null;
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
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | 'speed_1v1_glicko_v1' | null;
  algorithmConfigVersion: string | null;
};

export type LeaderboardPayload = {
  mode: 'standard_1v1' | 'speed_1v1' | 'classic_1v1' | 'multiplayer_lobby';
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | 'speed_1v1_glicko_v1' | null;
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
  algorithm: 'placement_mmr_v1' | 'standard_1v1_glicko_v1' | 'speed_1v1_glicko_v1' | null;
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

export type WebApiCoreSnapshot = {
  health: ApiClientResult<ApiHealthPayload>;
  readiness: ApiClientResult<ApiReadinessPayload>;
  runtimeCompatibility: ApiClientResult<RuntimeCompatibilityPayload>;
  currentUser: ApiClientResult<CurrentUserDto>;
  profile: ApiClientResult<PublicProfileDto>;
  lobbies: ApiClientResult<LobbyListPayload>;
  leaderboard: ApiClientResult<LeaderboardPayload>;
  rankedModes: ApiClientResult<RankedModesPayload>;
};

export type WebApiSnapshot = WebApiCoreSnapshot & { authority: WebApiAuthority };

type RuntimeSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

type RequestOptions = RequestInit & {
  timeoutMs?: number;
  responseSchema?: RuntimeSchema<unknown>;
  authorityRead?: boolean;
};

type ReadPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
};

export const HOSTED_READ_POLICY: ReadPolicy = Object.freeze({
  timeoutMs: 5_000,
  maxAttempts: 2,
  retryDelayMs: 200,
});

class ApiRequestFailure extends Error {
  readonly retryableRead: boolean;
  readonly code: string | null;

  constructor(message: string, retryableRead: boolean, code: string | null = null) {
    super(message);
    this.name = 'ApiRequestFailure';
    this.retryableRead = retryableRead;
    this.code = code;
  }
}

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
  return resolveApiOriginConfiguration(process.env).origin ?? '';
}

function unavailable<T>(apiUrl: string, error: unknown): ApiClientResult<T> {
  return {
    status: 'unavailable',
    apiUrl,
    data: null,
    requestId: null,
    error: error instanceof Error ? error.message : String(error),
    errorCode: error instanceof ApiRequestFailure ? error.code : null,
  };
}

type RequestAttempt<T> = {
  result: ApiClientResult<T>;
  retryableRead: boolean;
};

async function requestEnvelopeAttempt<T>(path: string, options: RequestOptions): Promise<RequestAttempt<T>> {
  const configuration = resolveApiOriginConfiguration(process.env);
  const configuredOrigin = configuration.origin ?? '';
  if (configuration.status === 'unavailable') {
    const failure = new ApiRequestFailure(
      configuration.reason ?? 'The authoritative API origin is unavailable.',
      false,
      'api_origin_unavailable',
    );
    return { result: unavailable<T>('', failure), retryableRead: false };
  }
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 1200;
  const { timeoutMs: _timeoutMs, responseSchema, authorityRead = false, ...fetchOptions } = options;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let responseOrigin = '';
  const cookie = await forwardedCookieHeader();

  try {
    const response = await Promise.race([
      fetch(`${configuredOrigin}${path}`, {
        ...fetchOptions,
        cache: 'no-store',
        redirect: 'manual',
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
          reject(new ApiRequestFailure(`API request timed out after ${timeoutMs}ms`, true));
        }, timeoutMs);
      }),
    ]);

    if (response.status >= 300 && response.status < 400) {
      throw new ApiRequestFailure('API redirects are not accepted for authoritative reads.', false, 'api_redirect_rejected');
    }
    if (response.url) {
      try { responseOrigin = new URL(response.url).origin; } catch { responseOrigin = ''; }
    }
    if (authorityRead && (!responseOrigin || responseOrigin !== configuredOrigin)) {
      throw new ApiRequestFailure('The authority response origin did not match the configured API origin.', false, 'api_response_origin_mismatch');
    }

    if (response.status === 204) {
      return {
        result: { status: 'connected', apiUrl: responseOrigin, data: null, requestId: response.headers.get('x-request-id'), error: null },
        retryableRead: false,
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ApiRequestFailure(`API returned an unreadable response with HTTP ${response.status}.`, true, 'api_response_malformed');
    }
    if (!response.ok) {
      const parsedError = errorEnvelopeSchema.safeParse(payload);
      if (!parsedError.success) {
        throw new ApiRequestFailure(`API request failed with HTTP ${response.status}.`, response.status === 408 || response.status === 429 || response.status >= 500, 'api_error_envelope_malformed');
      }
      throw new ApiRequestFailure(
        `${parsedError.data.error.code}: ${parsedError.data.error.message}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
        parsedError.data.error.code,
      );
    }

    const parsedEnvelope = unknownSuccessEnvelopeSchema.safeParse(payload);
    if (!parsedEnvelope.success) {
      throw new ApiRequestFailure('API returned a malformed success envelope.', true, 'api_success_envelope_malformed');
    }
    const parsedData = responseSchema?.safeParse(parsedEnvelope.data.data);
    if (responseSchema && (!parsedData || !parsedData.success)) {
      throw new ApiRequestFailure('API returned a noncanonical success payload.', true, 'api_success_payload_noncanonical');
    }
    const data = parsedData?.success ? parsedData.data as T : parsedEnvelope.data.data as T;

    return {
      result: { status: 'connected', apiUrl: responseOrigin, data, requestId: parsedEnvelope.data.requestId, error: null },
      retryableRead: false,
    };
  } catch (error) {
    return {
      result: unavailable<T>(responseOrigin, error),
      retryableRead: error instanceof ApiRequestFailure ? error.retryableRead : error instanceof TypeError || controller.signal.aborted,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiClientResult<T>> {
  return (await requestEnvelopeAttempt<T>(path, options)).result;
}

async function requestReadEnvelope<T>(path: string, options: RequestOptions = {}): Promise<ApiClientResult<T>> {
  for (let attempt = 1; attempt <= HOSTED_READ_POLICY.maxAttempts; attempt += 1) {
    const outcome = await requestEnvelopeAttempt<T>(path, {
      ...options,
      timeoutMs: HOSTED_READ_POLICY.timeoutMs,
    });
    if (outcome.result.status === 'connected'
      || !outcome.retryableRead
      || attempt === HOSTED_READ_POLICY.maxAttempts) return outcome.result;
    await new Promise((resolve) => setTimeout(resolve, HOSTED_READ_POLICY.retryDelayMs));
  }
  throw new Error('Hosted read attempt accounting failed.');
}

async function requestSpeedRecoveryReadEnvelope<T>(path: string): Promise<ApiClientResult<T>> {
  for (let attempt = 1; attempt <= SPEED_MUTATION_POLICY.recoveryReadAttempts; attempt += 1) {
    const outcome = await requestEnvelopeAttempt<T>(path, {
      timeoutMs: SPEED_MUTATION_POLICY.recoveryReadTimeoutMs,
    });
    if (outcome.result.status === 'connected'
      || !outcome.retryableRead
      || attempt === SPEED_MUTATION_POLICY.recoveryReadAttempts) return outcome.result;
    await new Promise((resolve) => setTimeout(resolve, SPEED_MUTATION_POLICY.recoveryRetryDelayMs));
  }
  throw new Error('Speed recovery read attempt accounting failed.');
}

export async function getHealth(): Promise<ApiClientResult<ApiHealthPayload>> {
  return requestReadEnvelope<ApiHealthPayload>('/healthz', { responseSchema: apiHealthPayloadSchema, authorityRead: true });
}

export async function getReadiness(): Promise<ApiClientResult<ApiReadinessPayload>> {
  return requestReadEnvelope<ApiReadinessPayload>('/readyz', { responseSchema: apiReadinessPayloadSchema, authorityRead: true });
}

export async function getRuntimeCompatibility(): Promise<ApiClientResult<RuntimeCompatibilityPayload>> {
  return requestReadEnvelope<RuntimeCompatibilityPayload>('/.well-known/wordle-runtime-compatibility', {
    responseSchema: runtimeCompatibilityPayloadSchema,
    authorityRead: true,
  });
}

export async function getCurrentUser(): Promise<ApiClientResult<CurrentUserDto>> {
  return requestReadEnvelope<CurrentUserDto>('/auth/me');
}

export async function getProfile(): Promise<ApiClientResult<PublicProfileDto>> {
  return requestReadEnvelope<PublicProfileDto>('/profile/me');
}

export async function listLobbies(query: LobbyBrowserQuery = { limit: 20 }): Promise<ApiClientResult<LobbyListPayload>> {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.mode) params.set('mode', query.mode);
  if (query.status) params.set('status', query.status);
  if (query.visibility) params.set('visibility', query.visibility);
  if (query.cursor) params.set('cursor', query.cursor);
  return requestReadEnvelope<LobbyListPayload>(`/lobbies?${params.toString()}`);
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

export async function createSpeed1v1Ticket(body: CreateSpeed1v1TicketRequest): Promise<ApiClientResult<Speed1v1Ticket>> {
  return requestEnvelope<Speed1v1Ticket>('/matchmaking/speed-1v1/tickets', { method: 'POST', body: JSON.stringify(body), timeoutMs: matchmakingDeadlinePolicyFor('join').apiProxyMs });
}

export async function getCurrentSpeed1v1Ticket(): Promise<ApiClientResult<Speed1v1Ticket>> {
  return requestEnvelope<Speed1v1Ticket>('/matchmaking/speed-1v1/tickets/current', { timeoutMs: matchmakingDeadlinePolicyFor('reconnect').apiProxyMs });
}

export async function getSpeed1v1Ticket(ticketId: string): Promise<ApiClientResult<Speed1v1Ticket>> {
  return requestEnvelope<Speed1v1Ticket>(`/matchmaking/speed-1v1/tickets/${encodeURIComponent(ticketId)}`, { timeoutMs: matchmakingDeadlinePolicyFor('current_ticket').apiProxyMs });
}

export async function cancelSpeed1v1Ticket(ticketId: string): Promise<ApiClientResult<Speed1v1Ticket>> {
  return requestEnvelope<Speed1v1Ticket>(`/matchmaking/speed-1v1/tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE', timeoutMs: matchmakingDeadlinePolicyFor('cancel').apiProxyMs });
}

export async function startRankedMatch(body: StartRankedMatchRequest): Promise<ApiClientResult<RankedMatchStartResponseData>> {
  return requestEnvelope<RankedMatchStartResponseData>('/matches/ranked/start', { method: 'POST', body: JSON.stringify(body) });
}

export type LiveMatchState = CurrentRankedMatchStateResponseData | SpeedMatchSnapshot;

export async function getRankedMatchState(matchId: string): Promise<ApiClientResult<LiveMatchState>> {
  return requestReadEnvelope<LiveMatchState>(`/matches/${encodeURIComponent(matchId)}/state`);
}

export async function getSpeedMatchStateForRecovery(matchId: string): Promise<ApiClientResult<LiveMatchState>> {
  return requestSpeedRecoveryReadEnvelope<LiveMatchState>(`/matches/${encodeURIComponent(matchId)}/state`);
}

export async function markSpeedMatchReady(matchId: string, body: MarkSpeedMatchReadyRequest): Promise<ApiClientResult<SpeedMatchSnapshot>> {
  return requestEnvelope<SpeedMatchSnapshot>(`/matches/${encodeURIComponent(matchId)}/ready`, { method: 'POST', body: JSON.stringify(body), timeoutMs: SPEED_MUTATION_POLICY.apiProxyMs });
}

export async function forfeitSpeedMatch(matchId: string, body: ForfeitSpeedMatchRequest): Promise<ApiClientResult<SpeedMatchSnapshot>> {
  return requestEnvelope<SpeedMatchSnapshot>(`/matches/${encodeURIComponent(matchId)}/forfeit`, { method: 'POST', body: JSON.stringify(body), timeoutMs: SPEED_MUTATION_POLICY.apiProxyMs });
}

export async function submitSpeedGuess(body: SubmitGuessRequest): Promise<ApiClientResult<GuessResult>> {
  return requestEnvelope<GuessResult>(`/matches/${encodeURIComponent(body.matchId)}/rounds/${encodeURIComponent(body.roundId)}/guesses`, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: SPEED_MUTATION_POLICY.apiProxyMs,
  });
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
    responseSchema: rankedMatchResultSummarySchema,
  });
}

export async function getRankedMatchResult(matchId: string): Promise<ApiClientResult<RankedMatchResultSummary>> {
  return requestReadEnvelope<RankedMatchResultSummary>(`/matches/${encodeURIComponent(matchId)}/result`, {
    responseSchema: rankedMatchResultSummarySchema,
  });
}

export async function getLeaderboard(limit = 20, mode: LeaderboardPayload['mode'] = 'standard_1v1'): Promise<ApiClientResult<LeaderboardPayload>> {
  return requestReadEnvelope<LeaderboardPayload>(`/leaderboard?limit=${encodeURIComponent(String(limit))}&mode=${encodeURIComponent(mode)}`);
}

export async function getRankedModes(): Promise<ApiClientResult<RankedModesPayload>> {
  return requestReadEnvelope<RankedModesPayload>('/ranked/modes', { responseSchema: rankedModesPayloadSchema, authorityRead: true });
}

export async function getRatedProfile(handle: string): Promise<ApiClientResult<RatedProfilePayload>> {
  return requestReadEnvelope<RatedProfilePayload>(`/profiles/${encodeURIComponent(handle)}/rating`);
}

export async function getCurrentProfileSummary(): Promise<ApiClientResult<CurrentProfileSummary>> {
  return requestReadEnvelope<CurrentProfileSummary>('/profiles/me/summary');
}

export async function getPublicProfileSummary(handle: string): Promise<ApiClientResult<PublicProfileSummary>> {
  return requestReadEnvelope<PublicProfileSummary>(`/profiles/${encodeURIComponent(handle)}/summary`);
}

export async function getMatchHistory(limit = 20, cursor?: string): Promise<ApiClientResult<MatchHistoryList>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return requestReadEnvelope<MatchHistoryList>(`/matches/history/me?${params.toString()}`);
}

export async function getWebApiSnapshot(lobbyQuery: LobbyBrowserQuery = { limit: 20 }): Promise<WebApiSnapshot> {
  const [health, readiness, runtimeCompatibility, currentUser, profile, lobbies, leaderboard, rankedModes] = await Promise.all([
    getHealth(),
    getReadiness(),
    getRuntimeCompatibility(),
    getCurrentUser(),
    getProfile(),
    listLobbies(lobbyQuery),
    getLeaderboard(20),
    getRankedModes(),
  ]);

  const core: WebApiCoreSnapshot = { health, readiness, runtimeCompatibility, currentUser, profile, lobbies, leaderboard, rankedModes };
  return { ...core, authority: assessWebApiAuthority(core, webDeploymentRevision()) };
}
