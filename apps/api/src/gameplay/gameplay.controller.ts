import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { completeRankedMatchRequestSchema, startRankedMatchRequestSchema, submitGuessRequestSchema } from '@wordle-royale/contracts';
import type { CompleteRankedMatchRequest, StartRankedMatchRequest, SubmitGuessRequest } from '@wordle-royale/contracts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';
import { CurrentUserService, localFixtureUsers } from '../auth/current-user.service.ts';
import { ProfileReadService } from '../profile/profile-read.service.ts';
import { GameplayPersistenceService } from './gameplay-persistence.service.ts';

const localFixtureUserIds = new Set<string>(Object.values(localFixtureUsers));

type DevTerminalizeBody = {
  outcome?: unknown;
  finalScore?: unknown;
};

@Controller('matches')
export class GameplayController {
  constructor(
    @Inject(GameplayPersistenceService) private readonly gameplay: GameplayPersistenceService,
    @Inject(ProfileReadService) private readonly profileRead: ProfileReadService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Post('ranked/start')
  async startRankedMatch(
    @Body(new ZodValidationPipe(startRankedMatchRequestSchema)) body: StartRankedMatchRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    if (body.source !== 'lobby') {
      throw new BadRequestException({
        code: 'unsupported_ranked_start_source',
        message: 'Only lobby-sourced ranked match starts are enabled in the local REST slice.',
        details: { source: body.source },
      });
    }

    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    const startInput = {
      lobbyId: body.lobbyId!,
      clientRequestId: body.clientRequestId,
      currentUserId: currentUser.userId,
      ...(body.dictionaryReleaseId ? { dictionaryReleaseId: body.dictionaryReleaseId } : {}),
    };
    const result = await this.gameplay.startRankedMatchFromLobby(startInput);

    return ok(result, request as never);
  }

  @Get('history/me')
  async getCurrentUserMatchHistory(
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() request: unknown,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    const historyInput: { userId: string; limit?: number; cursor?: string } = { userId: currentUser.userId };
    if (parsedLimit) historyInput.limit = parsedLimit;
    if (cursor) historyInput.cursor = cursor;
    return ok(await this.profileRead.listCurrentUserMatchHistory(historyInput), request as never);
  }

  @Get(':matchId/state')
  async getRankedMatchState(
    @Param('matchId') matchId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.gameplay.getMatchSnapshot(matchId, currentUser.userId), request as never);
  }

  @Post(':matchId/complete')
  async completeRankedMatch(
    @Param('matchId') matchId: string,
    @Body(new ZodValidationPipe(completeRankedMatchRequestSchema)) body: CompleteRankedMatchRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    if (body.matchId !== matchId) {
      throw new BadRequestException({
        code: 'route_body_mismatch',
        message: 'Route matchId must match the request body.',
        details: { route: { matchId }, body: { matchId: body.matchId } },
      });
    }

    this.currentUsers.resolveCurrentUser(devUserId, request as never);
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

    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    const participant = await this.gameplay.getParticipantForUser(matchId, currentUser.userId);
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
    this.currentUsers.requireDevRoutesEnabled();
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
