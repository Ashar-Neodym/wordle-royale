#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const apiBaseUrl = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const hostUserId = '11111111-1111-4111-8111-111111111111';
const guestUserId = '22222222-2222-4222-8222-222222222222';
const spoilerFields = ['answerWordHash', 'answerWordSaltRef', 'normalizedWord', 'answerWord'];

function id() {
  return randomUUID();
}

function fail(message, details) {
  console.error(message);
  if (details) console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  process.exit(1);
}

async function requestJson(method, path, body, headers = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, json };
}

function expectStatus(name, result, expectedStatus) {
  if (result.status !== expectedStatus || result.json?.error) {
    fail(`Ranked demo E2E failed at ${name}: expected HTTP ${expectedStatus}, got ${result.status}.`, result.json);
  }
}

const lobbyPayload = {
  clientRequestId: id(),
  visibility: 'public',
  rated: true,
  mode: 'standard',
  language: 'en',
  wordLength: 5,
  difficulty: 'medium',
  minPlayers: 2,
  maxPlayers: 4,
  roundsCount: 1,
  roundTimeSeconds: 120,
  scoringPreset: 'standard_v1',
};

try {
  const ready = await requestJson('GET', '/readyz');
  if (!ready.ok || ready.json?.data?.status !== 'ok') {
    fail(`Ranked demo E2E failed: API at ${apiBaseUrl} is not ready.`, ready.json);
  }

  const create = await requestJson('POST', '/lobbies', lobbyPayload);
  expectStatus('create lobby', create, 201);
  const lobbyId = create.json.data?.id;
  const lobbyCode = create.json.data?.code;
  if (!lobbyId) fail('Ranked demo E2E failed: create lobby response did not include a lobby id.', create.json);

  const join = await requestJson('POST', `/lobbies/${lobbyId}/join`, { clientRequestId: id() });
  expectStatus('join lobby', join, 201);

  const start = await requestJson('POST', '/matches/ranked/start', { clientRequestId: id(), lobbyId, source: 'lobby' });
  expectStatus('start ranked match', start, 201);
  const matchId = start.json.data?.matchId;
  const roundId = start.json.data?.roundId;
  if (!matchId || !roundId) fail('Ranked demo E2E failed: start response did not include matchId/roundId.', start.json);

  const hostGuess = await requestJson(
    'POST',
    `/matches/${matchId}/rounds/${roundId}/guesses`,
    { clientRequestId: id(), matchId, roundId, guess: 'crane' },
    { 'x-wordle-dev-user-id': hostUserId },
  );
  expectStatus('host guess', hostGuess, 201);

  const guestState = await requestJson('GET', `/matches/${matchId}/state`, undefined, { 'x-wordle-dev-user-id': guestUserId });
  expectStatus('guest state', guestState, 200);

  const terminalizeHost = await requestJson('POST', `/matches/dev/${matchId}/users/${hostUserId}/terminalize`, {
    outcome: 'solved',
    finalScore: 960,
  });
  expectStatus('terminalize host', terminalizeHost, 201);

  const terminalizeGuest = await requestJson('POST', `/matches/dev/${matchId}/users/${guestUserId}/terminalize`, {
    outcome: 'failed',
    finalScore: 120,
  });
  expectStatus('terminalize guest', terminalizeGuest, 201);

  const complete = await requestJson('POST', `/matches/${matchId}/complete`, {
    clientRequestId: id(),
    matchId,
    reason: 'all_players_final',
  });
  expectStatus('complete match', complete, 201);

  const repeatComplete = await requestJson('POST', `/matches/${matchId}/complete`, {
    clientRequestId: id(),
    matchId,
    reason: 'all_players_final',
  });
  expectStatus('repeat complete match', repeatComplete, 201);

  const result = await requestJson('GET', `/matches/${matchId}/result`);
  expectStatus('match result', result, 200);

  const leaderboard = await requestJson('GET', '/leaderboard?limit=5');
  expectStatus('leaderboard', leaderboard, 200);

  const serialized = JSON.stringify({ start, hostGuess, guestState, terminalizeHost, terminalizeGuest, complete, repeatComplete, result, leaderboard });
  const leaks = spoilerFields.filter((field) => serialized.includes(field));
  if (leaks.length > 0) {
    fail('Ranked demo E2E failed: response payload included spoiler-sensitive fields.', { leaks });
  }

  const ratingParticipants = complete.json.data?.ratingEvent?.participants ?? [];
  const summary = {
    result: 'ok',
    apiBaseUrl,
    note: 'Ranked demo E2E completed through HTTP only; no manual DB edits required.',
    statuses: {
      ready: ready.status,
      createLobby: create.status,
      joinLobby: join.status,
      startMatch: start.status,
      hostGuess: hostGuess.status,
      guestState: guestState.status,
      terminalizeHost: terminalizeHost.status,
      terminalizeGuest: terminalizeGuest.status,
      complete: complete.status,
      repeatComplete: repeatComplete.status,
      result: result.status,
      leaderboard: leaderboard.status,
    },
    lobbyId,
    lobbyCode,
    matchId,
    roundId,
    hostGuessAccepted: hostGuess.json.data?.accepted,
    guestPlayerRoundStateBeforeHelper: guestState.json.data?.myState?.playerRoundState,
    terminalStates: {
      host: terminalizeHost.json.data?.myState?.playerRoundState,
      guest: terminalizeGuest.json.data?.myState?.playerRoundState,
    },
    ratingDeltas: ratingParticipants.map((participant) => ({ userId: participant.userId, ratingDelta: participant.ratingDelta })),
    leaderboardEntries: leaderboard.json.data?.entries?.length ?? 0,
    leaks,
  };

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  fail(`Ranked demo E2E failed: ${error instanceof Error ? error.message : String(error)}`);
}
