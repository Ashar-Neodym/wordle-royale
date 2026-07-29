import {
  apiHealthPayloadSchema,
  apiReadinessPayloadSchema,
  rankedModesPayloadSchema,
} from '@wordle-royale/contracts';
import type { WebApiCoreSnapshot } from './api-client.ts';

export type ApiOriginEnvironment = Readonly<{
  NODE_ENV?: string;
  API_BASE_URL?: string;
  NEXT_PUBLIC_API_URL?: string;
  VERCEL_GIT_COMMIT_SHA?: string;
  GIT_COMMIT_SHA?: string;
  SOURCE_COMMIT_SHA?: string;
}>;

export type ApiOriginConfiguration = Readonly<{
  status: 'configured' | 'unavailable';
  origin: string | null;
  source: 'API_BASE_URL' | 'NEXT_PUBLIC_API_URL' | 'development_default' | 'conflict' | 'unavailable';
  reason: string | null;
}>;

export type WebApiAuthority = Readonly<{
  status: 'enabled' | 'disabled' | 'unavailable';
  availability: 'authoritative' | 'unavailable';
  apiOrigin: string | null;
  webRevision: string;
  apiRevision: string;
  reason: string | null;
}>;

const developmentApiOrigin = 'http://127.0.0.1:3001';

function normalizeOrigin(raw: string | undefined): string | null {
  const candidate = raw?.trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || (parsed.pathname !== '' && parsed.pathname !== '/')
      || parsed.search
      || parsed.hash) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveApiOriginConfiguration(environment: ApiOriginEnvironment = process.env): ApiOriginConfiguration {
  const serverRaw = environment.API_BASE_URL?.trim();
  const publicRaw = environment.NEXT_PUBLIC_API_URL?.trim();
  const serverOrigin = normalizeOrigin(serverRaw);
  const publicOrigin = normalizeOrigin(publicRaw);

  if ((serverRaw && !serverOrigin) || (publicRaw && !publicOrigin)) {
    return {
      status: 'unavailable', origin: null, source: 'unavailable',
      reason: 'The configured API origin must be one credential-free HTTP(S) origin without a path, query, or fragment.',
    };
  }
  if (environment.NODE_ENV === 'production'
    && ((serverOrigin && !serverOrigin.startsWith('https://'))
      || (publicOrigin && !publicOrigin.startsWith('https://')))) {
    return {
      status: 'unavailable', origin: null, source: 'unavailable',
      reason: 'The production API authority must use HTTPS.',
    };
  }
  if (serverOrigin && publicOrigin && serverOrigin !== publicOrigin) {
    return {
      status: 'unavailable', origin: null, source: 'conflict',
      reason: 'API_BASE_URL and NEXT_PUBLIC_API_URL identify different API origins.',
    };
  }
  if (serverOrigin) return { status: 'configured', origin: serverOrigin, source: 'API_BASE_URL', reason: null };
  if (publicOrigin) return { status: 'configured', origin: publicOrigin, source: 'NEXT_PUBLIC_API_URL', reason: null };
  if (environment.NODE_ENV !== 'production') {
    return { status: 'configured', origin: developmentApiOrigin, source: 'development_default', reason: null };
  }
  return {
    status: 'unavailable', origin: null, source: 'unavailable',
    reason: 'No authoritative API origin is configured for this production web process.',
  };
}

export function webDeploymentRevision(environment: ApiOriginEnvironment = process.env): string {
  for (const key of ['VERCEL_GIT_COMMIT_SHA', 'GIT_COMMIT_SHA', 'SOURCE_COMMIT_SHA'] as const) {
    const candidate = environment[key]?.trim();
    if (!candidate) continue;
    if (/^[a-f0-9]{7,64}$/i.test(candidate)) return candidate.toLowerCase();
    return 'unavailable';
  }
  return environment.NODE_ENV === 'production' ? 'unavailable' : 'development';
}

function safeResultOrigin(value: string): string | null {
  return normalizeOrigin(value);
}

function unavailable(
  apiOrigin: string | null,
  webRevision: string,
  apiRevision: string,
  reason: string,
): WebApiAuthority {
  return { status: 'unavailable', availability: 'unavailable', apiOrigin, webRevision, apiRevision, reason };
}

export function assessWebApiAuthority(
  snapshot: WebApiCoreSnapshot,
  webRevision = webDeploymentRevision(),
  configuredOrigin = resolveApiOriginConfiguration(process.env).origin,
): WebApiAuthority {
  const authorityReads = [snapshot.health, snapshot.readiness, snapshot.rankedModes];
  const origins = authorityReads.map((result) => safeResultOrigin(result.apiUrl));
  const apiOrigin = origins.find((origin): origin is string => origin !== null) ?? null;
  const rawHealthRevision = (snapshot.health.data as { revision?: unknown } | null)?.revision;
  const rawReadinessRevision = (snapshot.readiness.data as { revision?: unknown } | null)?.revision;
  const apiRevision = typeof rawHealthRevision === 'string'
    ? rawHealthRevision
    : typeof rawReadinessRevision === 'string' ? rawReadinessRevision : 'unavailable';

  if (authorityReads.some((result) => result.status !== 'connected' || result.data === null)) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'Health, readiness, and ranked-mode reads must all succeed before Speed availability is trusted.');
  }
  const health = apiHealthPayloadSchema.safeParse(snapshot.health.data);
  const readiness = apiReadinessPayloadSchema.safeParse(snapshot.readiness.data);
  const catalog = rankedModesPayloadSchema.safeParse(snapshot.rankedModes.data);
  if (!health.success || !readiness.success || !catalog.success) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'An authority response did not match the canonical runtime contract.');
  }
  const canonicalConfiguredOrigin = configuredOrigin ? normalizeOrigin(configuredOrigin) : null;
  if (!canonicalConfiguredOrigin || origins.some((origin) => origin === null || origin !== canonicalConfiguredOrigin)) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'Authoritative reads did not come from the configured canonical API origin.');
  }
  if (health.data.revision === 'unavailable' || health.data.revision !== readiness.data.revision) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'Health and readiness did not prove one API deployment revision.');
  }
  if (webRevision === 'unavailable' || health.data.revision !== webRevision) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'The web and API deployment revisions do not match.');
  }
  if (health.data.status !== 'ok' || readiness.data.status !== 'ok') {
    return unavailable(apiOrigin, webRevision, apiRevision, 'The authoritative API is not fully ready.');
  }
  if (readiness.data.dependencies.speedRuntime.status !== 'ok'
    || readiness.data.dependencies.speedLifecycleActivation.status !== 'ok') {
    return unavailable(apiOrigin, webRevision, apiRevision, 'Speed runtime and lifecycle readiness must both be authoritative and ready.');
  }

  const speedMode = catalog.data.modes.find((mode) => mode.id === 'speed_1v1');
  if (!speedMode) return unavailable(apiOrigin, webRevision, apiRevision, 'The authoritative catalog omitted Speed availability truth.');

  const explicitDisabled = speedMode.enabled === false
    && speedMode.queueEnabled === false
    && speedMode.unavailableReason === undefined
    && speedMode.readyLifecycleVersion === undefined
    && speedMode.timeControl === undefined;
  if (explicitDisabled) {
    return { status: 'disabled', availability: 'authoritative', apiOrigin, webRevision, apiRevision, reason: null };
  }

  const coherentEnabled = speedMode.enabled === true
    && speedMode.queueEnabled === true
    && speedMode.unavailableReason === undefined
    && speedMode.readyLifecycleVersion !== undefined
    && (speedMode.readyLifecycleVersion !== 'speed_ready_v2_first_ack_90s' || speedMode.timeControl !== undefined);
  if (!coherentEnabled) {
    return unavailable(apiOrigin, webRevision, apiRevision, 'Speed configuration is temporary, contradictory, or missing canonical authority fields.');
  }
  return { status: 'enabled', availability: 'authoritative', apiOrigin, webRevision, apiRevision, reason: null };
}
