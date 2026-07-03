export const defaultMobileApiUrl = 'http://127.0.0.1:3001';

type MobileApiPath = '/healthz' | '/readyz' | '/lobbies' | '/leaderboard' | `/profiles/${string}/rating`;

export type MobileApiDependencyStatus = {
  status: string;
  message?: string;
};

export type MobileApiHealthPayload = {
  status: string;
  service?: string;
  environment?: string;
  timestamp?: string;
  checkedAt?: string;
  uptimeSeconds?: number;
  dependencies?: Record<string, MobileApiDependencyStatus | string | null | undefined>;
};

export type MobileLobbyMember = {
  userId: string;
  displayName?: string;
  handle?: string;
  role?: string;
  ready?: boolean;
  state?: string;
};

export type MobileLobbyPreview = {
  id: string;
  code: string;
  state: string;
  visibility: string;
  rankedCompatible?: boolean;
  settings?: {
    rated?: boolean;
    mode?: string;
    minPlayers?: number;
    maxPlayers?: number;
    roundsCount?: number;
    roundTimeSeconds?: number;
  };
  members?: MobileLobbyMember[];
};

export type MobileLobbyListPayload = {
  items: MobileLobbyPreview[];
  pagination?: { nextCursor: string | null };
};

export type MobileLeaderboardEntry = {
  rank: number;
  userId: string;
  handle: string | null;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
};

export type MobileLeaderboardPayload = {
  mode: string;
  algorithm: string;
  generatedAt: string;
  entries: MobileLeaderboardEntry[];
};

export type MobileRatedProfilePayload = {
  userId: string;
  handle: string;
  displayName: string;
  rating: number;
  matchesPlayed: number;
  provisional: boolean;
  provisionalRemaining: number;
};

export type MobileApiCheckStatus = 'connected' | 'unavailable';

export type MobileApiCheckResult<T> = {
  status: MobileApiCheckStatus;
  apiUrl: string;
  path: MobileApiPath;
  data: T | null;
  requestId: string | null;
  httpStatus: number | null;
  error: string | null;
};

export type MobileApiReadinessSnapshot = {
  apiUrl: string;
  source: 'env' | 'default';
  checkedAt: string;
  health: MobileApiCheckResult<MobileApiHealthPayload>;
  readiness: MobileApiCheckResult<MobileApiHealthPayload>;
  lobbies: MobileApiCheckResult<MobileLobbyListPayload>;
  leaderboard: MobileApiCheckResult<MobileLeaderboardPayload>;
  ratedProfile: MobileApiCheckResult<MobileRatedProfilePayload>;
};

type ApiEnvelope<T> =
  | { data: T; error: null; requestId: string }
  | { data: null; error: { code: string; message: string; details?: Record<string, unknown> }; requestId: string };

type ExpoProcess = {
  env?: Record<string, string | undefined>;
};

declare const process: ExpoProcess | undefined;

function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function getMobileApiBaseUrl(): { apiUrl: string; source: 'env' | 'default' } {
  const configured = process?.env?.EXPO_PUBLIC_API_URL?.trim();
  return configured ? { apiUrl: normalizeApiUrl(configured), source: 'env' } : { apiUrl: defaultMobileApiUrl, source: 'default' };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable<T>(apiUrl: string, path: MobileApiPath, error: unknown, httpStatus: number | null = null): MobileApiCheckResult<T> {
  return {
    status: 'unavailable',
    apiUrl,
    path,
    data: null,
    requestId: null,
    httpStatus,
    error: toErrorMessage(error),
  };
}

async function requestEnvelope<T>(path: MobileApiPath, timeoutMs = 1600): Promise<MobileApiCheckResult<T>> {
  const { apiUrl } = getMobileApiBaseUrl();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await Promise.race([
      fetch(`${apiUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`API request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.error) {
      return unavailable<T>(apiUrl, path, envelope.error?.message ?? `API request failed with HTTP ${response.status}`, response.status);
    }

    return {
      status: 'connected',
      apiUrl,
      path,
      data: envelope.data,
      requestId: envelope.requestId,
      httpStatus: response.status,
      error: null,
    };
  } catch (error) {
    return unavailable<T>(apiUrl, path, error);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkMobileHealth(): Promise<MobileApiCheckResult<MobileApiHealthPayload>> {
  return requestEnvelope<MobileApiHealthPayload>('/healthz');
}

export async function checkMobileReadiness(): Promise<MobileApiCheckResult<MobileApiHealthPayload>> {
  return requestEnvelope<MobileApiHealthPayload>('/readyz');
}

export async function getMobileLobbies(): Promise<MobileApiCheckResult<MobileLobbyListPayload>> {
  return requestEnvelope<MobileLobbyListPayload>('/lobbies');
}

export async function getMobileLeaderboard(): Promise<MobileApiCheckResult<MobileLeaderboardPayload>> {
  return requestEnvelope<MobileLeaderboardPayload>('/leaderboard');
}

export async function getMobileRatedProfile(): Promise<MobileApiCheckResult<MobileRatedProfilePayload>> {
  return requestEnvelope<MobileRatedProfilePayload>('/profiles/ashar/rating');
}

export async function getMobileApiReadinessSnapshot(): Promise<MobileApiReadinessSnapshot> {
  const { apiUrl, source } = getMobileApiBaseUrl();
  const [health, readiness, lobbies, leaderboard, ratedProfile] = await Promise.all([
    checkMobileHealth(),
    checkMobileReadiness(),
    getMobileLobbies(),
    getMobileLeaderboard(),
    getMobileRatedProfile(),
  ]);
  return {
    apiUrl,
    source,
    checkedAt: new Date().toISOString(),
    health,
    readiness,
    lobbies,
    leaderboard,
    ratedProfile,
  };
}
