import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
import { completeRankedMatchRequestSchema, startRankedMatchRequestSchema, submitGuessRequestSchema } from '@wordle-royale/contracts';
import type { CompleteRankedMatchRequest, StartRankedMatchRequest, SubmitGuessRequest } from '@wordle-royale/contracts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';
import { GameplayPersistenceService } from './gameplay-persistence.service.ts';

const stubCurrentUserId = '11111111-1111-4111-8111-111111111111';
const stubGuestUserId = '22222222-2222-4222-8222-222222222222';
const localFixtureUserIds = new Set([stubCurrentUserId, stubGuestUserId]);

function devHelpersEnabled(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function requireDevHelpersEnabled(): void {
  if (!devHelpersEnabled()) {
    throw new ForbiddenException({
      code: 'dev_helper_disabled',
      message: 'Local ranked smoke helpers are disabled outside local/dev/test environments.',
    });
  }
}

function resolveFixtureUser(headerValue: string | string[] | undefined): string {
  const userId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!userId) return stubCurrentUserId;
  requireDevHelpersEnabled();
  if (!localFixtureUserIds.has(userId)) {
    throw new BadRequestException({
      code: 'unknown_dev_fixture_user',
      message: 'Only local ranked smoke fixture users can be selected with x-wordle-dev-user-id.',
      details: { allowedUserIds: [...localFixtureUserIds] },
    });
  }
  return userId;
}

type DevTerminalizeBody = {
  outcome?: unknown;
  finalScore?: unknown;
};

@Controller('matches')
export class GameplayController {
  constructor(@Inject(GameplayPersistenceService) private readonly gameplay: GameplayPersistenceService) {}

  @Post('ranked/start')
  async startRankedMatch(
    @Body(new ZodValidationPipe(startRankedMatchRequestSchema)) body: StartRankedMatchRequest,
    @Req() request: unknown,
  ) {
    if (body.source !== 'lobby') {
      throw new BadRequestException({
        code: 'unsupported_ranked_start_source',
        message: 'Only lobby-sourced ranked match starts are enabled in the local REST slice.',
        details: { source: body.source },
      });
    }

    const startInput = {
      lobbyId: body.lobbyId!,
      clientRequestId: body.clientRequestId,
      currentUserId: stubCurrentUserId,
      ...(body.dictionaryReleaseId ? { dictionaryReleaseId: body.dictionaryReleaseId } : {}),
    };
    const result = await this.gameplay.startRankedMatchFromLobby(startInput);

    return ok(result, request as never);
  }

  @Get(':matchId/state')
  async getRankedMatchState(
    @Param('matchId') matchId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    return ok(await this.gameplay.getMatchSnapshot(matchId, resolveFixtureUser(devUserId)), request as never);
  }

  @Post(':matchId/complete')
  async completeRankedMatch(
    @Param('matchId') matchId: string,
    @Body(new ZodValidationPipe(completeRankedMatchRequestSchema)) body: CompleteRankedMatchRequest,
    @Req() request: unknown,
  ) {
    if (body.matchId !== matchId) {
      throw new BadRequestException({
        code: 'route_body_mismatch',
        message: 'Route matchId must match the request body.',
        details: { route: { matchId }, body: { matchId: body.matchId } },
      });
    }

    return ok(await this.gameplay.completeRankedMatch({ matchId, ...(body.reason ? { reason: body.reason } : {}) }), request as never);
  }

  @Get(':matchId/result')
  async getRankedMatchResult(@Param('matchId') matchId: string, @Req() request: unknown) {
    return ok(await this.gameplay.getRankedMatchResult(matchId), request as never);
  }

  @Post(':matchId/rounds/:roundId/guesses')
  async submitRankedGuess(
    @Param('matchId') matchId: string,
    @Param('roundId') roundId: string,
    @Body(new ZodValidationPipe(submitGuessRequestSchema)) body: SubmitGuessRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    if (body.matchId !== matchId || body.roundId !== roundId) {
      throw new BadRequestException({
        code: 'route_body_mismatch',
        message: 'Route matchId/roundId must match the request body.',
        details: { route: { matchId, roundId }, body: { matchId: body.matchId, roundId: body.roundId } },
      });
    }

    const participant = await this.gameplay.getParticipantForUser(matchId, resolveFixtureUser(devUserId));
    return ok(await this.gameplay.submitGuess({
      matchId,
      roundId,
      participantId: participant.id,
      guess: body.guess,
      clientRequestId: body.clientRequestId,
    }), request as never);
  }

  @Post('dev/:matchId/users/:userId/terminalize')
  async devTerminalizeParticipant(
    @Param('matchId') matchId: string,
    @Param('userId') userId: string,
    @Body() body: DevTerminalizeBody,
    @Req() request: unknown,
  ) {
    requireDevHelpersEnabled();
    if (!localFixtureUserIds.has(userId)) {
      throw new BadRequestException({
        code: 'unknown_dev_fixture_user',
        message: 'Only local ranked smoke fixture users can be terminalized through this helper.',
        details: { allowedUserIds: [...localFixtureUserIds] },
      });
    }
    const outcome = typeof body.outcome === 'string' ? body.outcome : 'failed';
    const finalScore = typeof body.finalScore === 'number' && Number.isFinite(body.finalScore) ? body.finalScore : 0;
    return ok(await this.gameplay.devTerminalizeParticipant({ matchId, userId, outcome, finalScore }), request as never);
  }
}
