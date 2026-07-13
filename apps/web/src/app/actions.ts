'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cancelStandard1v1Ticket, completeRankedMatch, createLobby, createStandard1v1Ticket, getApiBaseUrl, getCurrentStandard1v1Ticket, getStandard1v1Ticket, joinLobby, joinLobbyByCode, startRankedMatch, submitGuess } from '../lib/api-client';
import type { ApiClientResult, CreateStandard1v1TicketRequest, Standard1v1Ticket } from '../lib/api-client';
import type { CreateLobbyRequest } from '@wordle-royale/contracts';

const rankedLobbyDefaults: CreateLobbyRequest = {
  clientRequestId: '00000000-0000-4000-8000-000000000000',
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

function resultRedirect(params: Record<string, string>, hash = 'lobbies'): never {
  const search = new URLSearchParams(params);
  const path = hash === 'lobbies' ? '/lobbies' : '/play';
  revalidatePath('/');
  revalidatePath(path);
  redirect(`${path}?${search.toString()}#${hash}`);
}

function safeRedirectPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function redirectWithParams(path: string, params: Record<string, string>, hash?: string): never {
  const target = new URL(safeRedirectPath(path), 'http://wordle-royale.local');
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  revalidatePath('/');
  revalidatePath(target.pathname);
  redirect(`${target.pathname}${target.search}${hash ? `#${hash}` : target.hash}`);
}

function parseCookiePart(setCookie: string, name: string): string | undefined {
  const firstPart = setCookie.split(';')[0] ?? '';
  const [rawName, ...rawValue] = firstPart.split('=');
  return rawName === name ? decodeURIComponent(rawValue.join('=')) : undefined;
}

function parseMaxAge(setCookie: string): number | undefined {
  const match = /(?:^|;)\s*Max-Age=(\d+)/i.exec(setCookie);
  return match ? Number.parseInt(match[1] ?? '', 10) : undefined;
}

function parseExpires(setCookie: string): Date | undefined {
  const match = /(?:^|;)\s*Expires=([^;]+)/i.exec(setCookie);
  if (!match?.[1]) return undefined;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function startPreviewDemoSessionAction(formData: FormData): Promise<void> {
  const redirectTo = formValue(formData, 'redirectTo') || '/profile';
  const apiUrl = getApiBaseUrl();
  let status: 'success' | 'error' = 'success';
  let message = 'Preview demo session started.';

  try {
    const response = await fetch(`${apiUrl}/auth/preview-demo/start`, {
      method: 'POST',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const envelope = await response.json() as { data: { session?: { cookieName?: string } } | null; error?: { code?: string; message?: string } | null };
    if (!response.ok || envelope.error || !envelope.data?.session?.cookieName) {
      status = 'error';
      message = envelope.error?.message ?? `Preview demo start failed with HTTP ${response.status}.`;
    } else {
      const cookieName = envelope.data.session.cookieName;
      const setCookie = response.headers.get('set-cookie') ?? '';
      const cookieValue = parseCookiePart(setCookie, cookieName);
      if (!cookieValue) {
        status = 'error';
        message = 'Preview demo session started, but no session cookie was returned.';
      } else {
        const store = await cookies();
        store.set({
          name: cookieName,
          value: cookieValue,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: /(?:^|;)\s*Secure(?:;|$)/i.test(setCookie),
          maxAge: parseMaxAge(setCookie),
          expires: parseExpires(setCookie),
        });
      }
    }
  } catch (error) {
    status = 'error';
    message = error instanceof Error ? error.message : 'Preview demo session could not start.';
  }

  redirectWithParams(redirectTo, { action: 'preview_demo', status, message });
}

export async function createStandard1v1TicketAction(): Promise<ApiClientResult<Standard1v1Ticket>> {
  const body: CreateStandard1v1TicketRequest = {
    clientRequestId: randomUUID(),
    mode: 'standard_1v1',
    rated: true,
    allowProvisionalOpponent: true,
  };
  return createStandard1v1Ticket(body);
}

export async function getCurrentStandard1v1TicketAction(): Promise<ApiClientResult<Standard1v1Ticket>> {
  return getCurrentStandard1v1Ticket();
}

export async function getStandard1v1TicketAction(ticketId: string): Promise<ApiClientResult<Standard1v1Ticket>> {
  return getStandard1v1Ticket(ticketId);
}

export async function cancelStandard1v1TicketAction(ticketId: string): Promise<ApiClientResult<Standard1v1Ticket>> {
  return cancelStandard1v1Ticket(ticketId);
}

export async function createRankedLobbyAction(): Promise<void> {
  const result = await createLobby({ ...rankedLobbyDefaults, clientRequestId: randomUUID() });
  if (result.status === 'connected' && result.data) {
    resultRedirect({ action: 'create_lobby', status: 'success', lobbyId: result.data.id, lobbyCode: result.data.code });
  }
  resultRedirect({ action: 'create_lobby', status: 'error', message: result.error ?? 'Unable to create a ranked lobby.' });
}

export async function joinLobbyByCodeAction(formData: FormData): Promise<void> {
  const code = formValue(formData, 'code').toUpperCase();
  if (!code) {
    resultRedirect({ action: 'join_code', status: 'error', message: 'Enter a lobby code first.' });
  }

  const result = await joinLobbyByCode({ clientRequestId: randomUUID(), code });
  if (result.status === 'connected' && result.data) {
    resultRedirect({ action: 'join_code', status: 'success', lobbyId: result.data.id, lobbyCode: result.data.code });
  }
  resultRedirect({ action: 'join_code', status: 'error', message: result.error ?? `Unable to join lobby ${code}.` });
}

export async function joinLobbyAction(formData: FormData): Promise<void> {
  const lobbyId = formValue(formData, 'lobbyId');
  if (!lobbyId) {
    resultRedirect({ action: 'join_lobby', status: 'error', message: 'Missing lobby id.' });
  }

  const result = await joinLobby(lobbyId, randomUUID());
  if (result.status === 'connected' && result.data) {
    resultRedirect({ action: 'join_lobby', status: 'success', lobbyId: result.data.id, lobbyCode: result.data.code });
  }
  resultRedirect({ action: 'join_lobby', status: 'error', message: result.error ?? 'Unable to join lobby.' });
}

export async function startRankedMatchAction(formData: FormData): Promise<void> {
  const lobbyId = formValue(formData, 'lobbyId');
  if (!lobbyId) {
    resultRedirect({ action: 'start_ranked', status: 'error', message: 'Missing lobby id.' });
  }

  const result = await startRankedMatch({ clientRequestId: randomUUID(), lobbyId, source: 'lobby' });
  if (result.status === 'connected' && result.data) {
    resultRedirect({
      action: 'start_ranked',
      status: 'success',
      lobbyId,
      matchId: result.data.matchId,
      roundId: result.data.roundId,
    });
  }
  resultRedirect({ action: 'start_ranked', status: 'error', lobbyId, message: result.error ?? 'Unable to start ranked match.' });
}

export async function submitRankedGuessAction(formData: FormData): Promise<void> {
  const matchId = formValue(formData, 'matchId');
  const roundId = formValue(formData, 'roundId');
  const guess = formValue(formData, 'guess').toLowerCase();
  if (!matchId || !roundId) {
    resultRedirect({ action: 'submit_guess', status: 'error', message: 'Missing match or round id.' }, 'gameplay');
  }
  if (!/^[a-z]{5}$/.test(guess)) {
    resultRedirect({ action: 'submit_guess', status: 'error', matchId, roundId, message: 'Enter exactly five letters.' }, 'gameplay');
  }

  const result = await submitGuess({ clientRequestId: randomUUID(), matchId, roundId, guess, clientSubmittedAt: new Date().toISOString() });
  if (result.status === 'connected' && result.data) {
    const guessStatus = result.data.accepted ? 'accepted' : 'rejected';
    resultRedirect({
      action: 'submit_guess',
      status: 'success',
      matchId,
      roundId,
      guessStatus,
      message: result.data.accepted ? `Guess ${guess.toUpperCase()} accepted.` : `Guess ${guess.toUpperCase()} rejected: ${result.data.reason}.`,
    }, 'gameplay');
  }
  resultRedirect({ action: 'submit_guess', status: 'error', matchId, roundId, message: result.error ?? 'Unable to submit guess.' }, 'gameplay');
}

export async function completeRankedMatchAction(formData: FormData): Promise<void> {
  const matchId = formValue(formData, 'matchId');
  if (!matchId) {
    resultRedirect({ action: 'complete_match', status: 'error', message: 'Missing match id.' }, 'gameplay');
  }

  const result = await completeRankedMatch({ clientRequestId: randomUUID(), matchId, reason: 'all_players_final' });
  if (result.status === 'connected' && result.data) {
    resultRedirect({ action: 'complete_match', status: 'success', matchId, message: 'Match completed and ratings finalized.' }, 'report');
  }
  resultRedirect({ action: 'complete_match', status: 'error', matchId, message: result.error ?? 'Match is not ready to complete yet.' }, 'gameplay');
}
