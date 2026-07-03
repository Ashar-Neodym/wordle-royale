import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ok } from '../shared/envelope.ts';
import { LeaderboardReadService } from './leaderboard-read.service.ts';

@Controller()
export class LeaderboardController {
  constructor(@Inject(LeaderboardReadService) private readonly leaderboard: LeaderboardReadService) {}

  @Get('leaderboard')
  async listLeaderboard(@Query('limit') limit: string | undefined, @Req() request: unknown) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return ok(await this.leaderboard.listLeaderboard({ ...(parsedLimit ? { limit: parsedLimit } : {}) }), request as never);
  }

  @Get('profiles/:handle/rating')
  async getRatedProfile(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.leaderboard.getRatedProfileByHandle(handle), request as never);
  }
}
