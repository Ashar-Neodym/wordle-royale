import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { clientRequestSchema, createLobbyRequestSchema, joinLobbyByCodeRequestSchema } from '@wordle-royale/contracts';
import type { CreateLobbyRequest, JoinLobbyByCodeRequest } from '@wordle-royale/contracts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';
import { LobbyService } from './lobby.service.ts';

@Controller('lobbies')
export class LobbyController {
  constructor(@Inject(LobbyService) private readonly lobbies: LobbyService) {}

  @Get()
  async listPublicLobbies(@Query() query: Record<string, string | undefined>, @Req() request: unknown) {
    return ok(await this.lobbies.listPublicLobbies(query), request as never);
  }

  @Post()
  async createLobby(@Body(new ZodValidationPipe(createLobbyRequestSchema)) body: CreateLobbyRequest, @Req() request: unknown) {
    return ok(await this.lobbies.createLobby(body), request as never);
  }

  @Post('join-code')
  async joinByCode(@Body(new ZodValidationPipe(joinLobbyByCodeRequestSchema)) body: JoinLobbyByCodeRequest, @Req() request: unknown) {
    return ok(await this.lobbies.joinByCode(body), request as never);
  }

  @Post(':lobbyId/join')
  async joinLobby(@Param('lobbyId') lobbyId: string, @Body(new ZodValidationPipe(clientRequestSchema)) _body: unknown, @Req() request: unknown) {
    return ok(await this.lobbies.joinLobby(lobbyId), request as never);
  }
}
