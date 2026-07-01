'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { completeRankedMatch, createLobby, joinLobby, joinLobbyByCode, startRankedMatch, submitGuess } from '../lib/api-client';
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
  revalidatePath('/');
  redirect(`/?${search.toString()}#${hash}`);
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
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
