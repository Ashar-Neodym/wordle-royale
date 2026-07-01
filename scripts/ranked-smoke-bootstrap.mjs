#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const apiBaseUrl = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function fail(message, details) {
  console.error(message);
  if (details) console.error(typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  process.exit(1);
}

const lobbyPayload = {
  clientRequestId: randomUUID(),
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
  const ready = await requestJson('/readyz');
  if (!ready.response.ok || ready.body?.data?.status !== 'ok') {
    fail(`Ranked smoke bootstrap failed: API at ${apiBaseUrl} is not ready.`, ready.body);
  }

  const created = await requestJson('/lobbies', {
    method: 'POST',
    body: JSON.stringify(lobbyPayload),
  });

  if (created.response.status !== 201 || created.body?.error || !created.body?.data?.id) {
    fail('Ranked smoke bootstrap failed: direct POST /lobbies did not create a lobby.', {
      status: created.response.status,
      body: created.body,
    });
  }

  const lobby = created.body.data;
  const hostPresent = lobby.members?.some((member) => member.userId === '11111111-1111-4111-8111-111111111111');
  if (!hostPresent) {
    fail('Ranked smoke bootstrap failed: created lobby did not include the seeded stub host user.', lobby);
  }

  const joined = await requestJson(`/lobbies/${lobby.id}/join`, {
    method: 'POST',
    body: JSON.stringify({ clientRequestId: randomUUID() }),
  });

  if (joined.response.status !== 201 || joined.body?.error) {
    fail('Ranked smoke bootstrap failed: stub guest could not join the lobby.', {
      status: joined.response.status,
      body: joined.body,
    });
  }

  const guestPresent = joined.body.data.members?.some((member) => member.userId === '22222222-2222-4222-8222-222222222222');
  if (!guestPresent) {
    fail('Ranked smoke bootstrap failed: joined lobby did not include the seeded stub guest user.', joined.body.data);
  }

  console.log(JSON.stringify({
    result: 'ok',
    apiBaseUrl,
    note: 'Created and joined a rated lobby without calling /auth/me first.',
    lobbyId: joined.body.data.id,
    lobbyCode: joined.body.data.code,
    members: joined.body.data.members.map((member) => ({ userId: member.userId, handle: member.handle, role: member.role })),
  }, null, 2));
} catch (error) {
  fail(`Ranked smoke bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
}
