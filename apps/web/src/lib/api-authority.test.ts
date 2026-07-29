import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  ApiClientResult,
  ApiHealthPayload,
  ApiReadinessPayload,
  RankedModesPayload,
  WebApiCoreSnapshot,
} from './api-client.ts';
import { getHealth, getRankedModes } from './api-client.ts';
import {
  assessWebApiAuthority,
  resolveApiOriginConfiguration,
  type ApiOriginEnvironment,
} from './api-authority.ts';

const REVISION = '2262262262262262262262262262262262262262';
const ORIGIN = 'https://api.example.test';

function connected<T>(data: T, apiUrl = ORIGIN): ApiClientResult<T> {
  return { status: 'connected', apiUrl, data, requestId: 'ticket-226', error: null };
}

function unavailable<T>(apiUrl = ORIGIN): ApiClientResult<T> {
  return { status: 'unavailable', apiUrl, data: null, requestId: null, error: 'upstream unavailable' };
}

function health(revision = REVISION): ApiHealthPayload {
  return {
    status: 'ok', service: 'wordle-royale-api', environment: 'test',
    timestamp: '2026-07-28T12:00:00.000Z', uptimeSeconds: 10, revision,
  };
}

function readiness(revision = REVISION, runtimeStatus: 'ok' | 'degraded' | 'unavailable' | 'not_checked_stub' = 'ok'): ApiReadinessPayload {
  return {
    status: 'ok', service: 'wordle-royale-api', environment: 'test', revision,
    checkedAt: '2026-07-28T12:00:00.000Z',
    dependencies: {
      database: { status: 'ok' }, applicationSchema: { status: 'ok' }, durableAuth: { status: 'not_checked_stub' }, standardDictionary: { status: 'ok' },
      speedRuntime: { status: runtimeStatus }, speedLifecycleActivation: { status: 'ok' }, redis: { status: 'ok' },
    },
  };
}

function speedMode(enabled = true, queueEnabled = true): RankedModesPayload['modes'][number] {
  return {
    id: 'speed_1v1', label: 'Speed / Blitz', players: '1v1', rated: true, enabled, queueEnabled,
    rulesetVersion: 'speed_1v1_v1_75s', ratingAlgorithmConfigVersion: 'speed_1v1_glicko_v1',
    ...(enabled ? {
      readyLifecycleVersion: 'speed_ready_v2_first_ack_90s' as const,
      timeControl: {
        roundTimeSeconds: 75 as const, invitationWindowSeconds: 90 as const, readyWindowSeconds: 20 as const,
        readyWindowStartsOn: 'first_valid_ready_acknowledgement' as const, countdownSeconds: 3 as const,
        maxGuesses: 6 as const, solveTimeBucketMs: 100 as const, tieBreaker: 'server_solve_time_bucket' as const,
      },
    } : {}),
    provisionalGames: 5, defaultRating: 1500, defaultRatingDeviation: 350, notes: 'canonical fixture',
  };
}

function modes(speed = speedMode()): RankedModesPayload {
  return { modes: [
    { id: 'standard_1v1', label: 'Standard', players: '1v1', rated: true, enabled: true, provisionalGames: 5, defaultRating: 1500, defaultRatingDeviation: 350, notes: 'standard' },
    speed,
    { id: 'classic_1v1', label: 'Classic', players: '1v1', rated: true, enabled: false, provisionalGames: 5, defaultRating: 1500, defaultRatingDeviation: 350, notes: 'classic' },
    { id: 'multiplayer_lobby', label: 'Multiplayer / Lobby', players: '2-4', rated: true, enabled: false, provisionalGames: 5, defaultRating: 1500, defaultRatingDeviation: 350, notes: 'multiplayer' },
  ] };
}

function core(overrides: Partial<WebApiCoreSnapshot> = {}): WebApiCoreSnapshot {
  return {
    health: connected(health()), readiness: connected(readiness()), currentUser: unavailable(), profile: unavailable(),
    lobbies: unavailable(), leaderboard: unavailable(), rankedModes: connected(modes()), ...overrides,
  };
}

function assess(snapshot: WebApiCoreSnapshot): ReturnType<typeof assessWebApiAuthority> {
  return assessWebApiAuthority(snapshot, REVISION, ORIGIN);
}

function response(body: unknown, url = ORIGIN, status = 200): Response {
  const value = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  Object.defineProperty(value, 'url', { value: `${url}/authority`, configurable: true });
  return value;
}

function envelope(data: unknown): unknown {
  return { data, error: null, requestId: 'ticket-226' };
}

async function withApiEnvironment(run: () => Promise<void>): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, api: env.API_BASE_URL, public: env.NEXT_PUBLIC_API_URL };
  env.NODE_ENV = 'production'; env.API_BASE_URL = ORIGIN; delete env.NEXT_PUBLIC_API_URL;
  try { await run(); } finally {
    if (saved.node === undefined) delete env.NODE_ENV; else env.NODE_ENV = saved.node;
    if (saved.api === undefined) delete env.API_BASE_URL; else env.API_BASE_URL = saved.api;
    if (saved.public === undefined) delete env.NEXT_PUBLIC_API_URL; else env.NEXT_PUBLIC_API_URL = saved.public;
  }
}

describe('web/API authority contract', () => {
  it('prefers one credential-free server origin and fails closed on conflicts or production omission', () => {
    const serverOnly: ApiOriginEnvironment = { NODE_ENV: 'production', API_BASE_URL: `${ORIGIN}/`, NEXT_PUBLIC_API_URL: '' };
    assert.deepEqual(resolveApiOriginConfiguration(serverOnly), { status: 'configured', origin: ORIGIN, source: 'API_BASE_URL', reason: null });
    assert.equal(resolveApiOriginConfiguration({ ...serverOnly, NEXT_PUBLIC_API_URL: 'https://alternate.example.test' }).status, 'unavailable');
    assert.equal(resolveApiOriginConfiguration({ NODE_ENV: 'production' }).status, 'unavailable');
    assert.equal(resolveApiOriginConfiguration({ NODE_ENV: 'development' }).origin, 'http://127.0.0.1:3001');
  });

  it('proves enabled and only a coherent explicit configuration-disabled Speed identity', () => {
    assert.equal(assess(core()).status, 'enabled');
    assert.equal(assess(core({ rankedModes: connected(modes(speedMode(false, false))) })).status, 'disabled');
  });

  it('keeps configured temporary closure, reasons, contradictory booleans, and runtime/lifecycle non-OK unavailable', () => {
    const temporary = { ...speedMode(true, false), unavailableReason: 'speed_temporarily_unavailable' as const };
    const draining = { ...speedMode(true, false), unavailableReason: 'lifecycle_activation_draining' as const };
    assert.equal(assess(core({ rankedModes: connected(modes(temporary)) })).status, 'unavailable');
    assert.equal(assess(core({ rankedModes: connected(modes(draining)) })).status, 'unavailable');
    assert.equal(assess(core({ rankedModes: connected(modes(speedMode(false, true))) })).status, 'unavailable');
    assert.equal(assess(core({ readiness: connected(readiness(REVISION, 'degraded')) })).status, 'unavailable');
  });

  it('rejects malformed, minimal, duplicate, partial, wrong-service, and revision-skew payloads', () => {
    const minimal = { modes: [{ id: 'speed_1v1', enabled: true, queueEnabled: true }] } as unknown as RankedModesPayload;
    const duplicate = { modes: [speedMode(), speedMode(), modes().modes[0], modes().modes[2]] } as RankedModesPayload;
    const partialReadiness = { ...readiness(), dependencies: { speedRuntime: { status: 'ok' }, speedLifecycleActivation: { status: 'ok' } } } as unknown as ApiReadinessPayload;
    const wrongService = { ...health(), service: 'healthy-stub' } as unknown as ApiHealthPayload;
    assert.equal(assess(core({ rankedModes: connected(minimal) })).status, 'unavailable');
    assert.equal(assess(core({ rankedModes: connected(duplicate) })).status, 'unavailable');
    assert.equal(assess(core({ readiness: connected(partialReadiness) })).status, 'unavailable');
    assert.equal(assess(core({ health: connected(wrongService) })).status, 'unavailable');
    assert.equal(assessWebApiAuthority(core(), REVISION, 'https://other.example.test').status, 'unavailable');
    assert.equal(assessWebApiAuthority(core(), '3333333333333333333333333333333333333333', ORIGIN).status, 'unavailable');
  });

  it('rejects redirects and actual cross-origin authority responses without forwarding a second request', async () => {
    await withApiEnvironment(async () => {
      const originalFetch = globalThis.fetch;
      const calls: RequestInit[] = [];
      globalThis.fetch = async (_input, init) => {
        calls.push(init ?? {});
        return response(envelope(health()), 'https://redirected-stub.example');
      };
      try {
        const result = await getHealth();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.errorCode, 'api_response_origin_mismatch');
        assert.equal(result.apiUrl, 'https://redirected-stub.example');
        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.redirect, 'manual');
      } finally { globalThis.fetch = originalFetch; }
    });
  });

  it('runtime-parses canonical payloads and recovers once from malformed/partial successful reads', async () => {
    await withApiEnvironment(async () => {
      const originalFetch = globalThis.fetch;
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return response(envelope(calls === 1 ? { status: 'ok', service: 'wordle-royale-api' } : health()));
      };
      try {
        const result = await getHealth();
        assert.equal(result.status, 'connected');
        assert.equal(result.apiUrl, ORIGIN);
        assert.equal(calls, 2);
      } finally { globalThis.fetch = originalFetch; }
    });
  });

  it('fails closed with sanitized diagnostics for malformed envelopes and duplicate catalog rows', async () => {
    await withApiEnvironment(async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => response(envelope({ modes: [speedMode(), speedMode()] }));
      try {
        const result = await getRankedModes();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.errorCode, 'api_success_payload_noncanonical');
        assert.doesNotMatch(result.error ?? '', /canonical fixture|speed_1v1_v1_75s/);
      } finally { globalThis.fetch = originalFetch; }
    });
  });
});
