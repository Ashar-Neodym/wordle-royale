import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { clientRequestSchema, createLobbyRequestSchema, joinLobbyByCodeRequestSchema } from '@wordle-royale/contracts';
import type { CreateLobbyRequest, JoinLobbyByCodeRequest } from '@wordle-royale/contracts';
import { CurrentUserService } from '../auth/current-user.service.ts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';
import { LobbyService } from './lobby.service.ts';

@Controller('lobbies')
export class LobbyController {
  constructor(
    @Inject(LobbyService) private readonly lobbies: LobbyService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
  ) {}

  @Get()
  async listPublicLobbies(@Query() query: Record<string, string | undefined>, @Req() request: unknown) {
    return ok(await this.lobbies.listPublicLobbies(query), request as never);
  }

  @Post()
  async createLobby(
    @Body(new ZodValidationPipe(createLobbyRequestSchema)) body: CreateLobbyRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.lobbies.createLobby(body, currentUser.userId), request as never);
  }

  @Post('join-code')
  async joinByCode(
    @Body(new ZodValidationPipe(joinLobbyByCodeRequestSchema)) body: JoinLobbyByCodeRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.lobbies.joinByCode(body, currentUser.userId), request as never);
  }

  @Post(':lobbyId/join')
  async joinLobby(
    @Param('lobbyId') lobbyId: string,
    @Body(new ZodValidationPipe(clientRequestSchema)) _body: unknown,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.lobbies.joinLobby(lobbyId, currentUser.userId), request as never);
  }
}
