import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { createSpeed1v1TicketRequestSchema, createStandard1v1TicketRequestSchema } from '@wordle-royale/contracts';
import type { CreateSpeed1v1TicketRequest, CreateStandard1v1TicketRequest } from '@wordle-royale/contracts';
import { CurrentUserService } from '../auth/current-user.service.ts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';
import { MatchmakingService } from './matchmaking.service.ts';

@Controller('matchmaking/standard-1v1/tickets')
export class MatchmakingController {
  constructor(
    @Inject(MatchmakingService) private readonly matchmaking: MatchmakingService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Post()
  @HttpCode(200)
  async join(
    @Body(new ZodValidationPipe(createStandard1v1TicketRequestSchema)) body: CreateStandard1v1TicketRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    const result = await this.matchmaking.joinStandardQueueWithResult(currentUser.userId, body);
    response.status(result.created ? 201 : 200);
    return ok(result.ticket, request as never);
  }

  @Get('current')
  async current(
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.getCurrentTicket(currentUser.userId), request as never);
  }

  @Get(':ticketId')
  async getById(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.getTicket(currentUser.userId, ticketId), request as never);
  }

  @Delete(':ticketId')
  async cancel(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.cancelTicket(currentUser.userId, ticketId), request as never);
  }
}

@Controller('matchmaking/speed-1v1/tickets')
export class SpeedMatchmakingController {
  constructor(
    @Inject(MatchmakingService) private readonly matchmaking: MatchmakingService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Post()
  @HttpCode(200)
  async join(
    @Body(new ZodValidationPipe(createSpeed1v1TicketRequestSchema)) body: CreateSpeed1v1TicketRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    const result = await this.matchmaking.joinSpeedQueueWithResult(currentUser.userId, body);
    response.status(result.created ? 201 : 200);
    return ok(result.ticket, request as never);
  }

  @Get('current')
  async current(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.getCurrentSpeedTicket(currentUser.userId), request as never);
  }

  @Get(':ticketId')
  async getById(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.getSpeedTicket(currentUser.userId, ticketId), request as never);
  }

  @Delete(':ticketId')
  async cancel(
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.matchmaking.cancelSpeedTicket(currentUser.userId, ticketId), request as never);
  }
}
