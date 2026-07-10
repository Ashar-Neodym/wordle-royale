import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ok } from '../shared/envelope.ts';
import { LeaderboardReadService } from './leaderboard-read.service.ts';

@Controller()
export class LeaderboardController {
  constructor(@Inject(LeaderboardReadService) private readonly leaderboard: LeaderboardReadService) {}

  @Get('ranked/modes')
  async listRankedModes(@Req() request: unknown) {
    return ok(this.leaderboard.listRankedModes(), request as never);
  }

  @Get('leaderboard')
  async listLeaderboard(@Query('limit') limit: string | undefined, @Query('mode') mode: string | undefined, @Req() request: unknown) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return ok(await this.leaderboard.listLeaderboard({ ...(parsedLimit ? { limit: parsedLimit } : {}), ...(mode ? { mode } : {}) }), request as never);
  }

  @Get('profiles/:handle/rating')
  async getRatedProfile(@Param('handle') handle: string, @Query('mode') mode: string | undefined, @Req() request: unknown) {
    return ok(await this.leaderboard.getRatedProfileByHandle(handle, { ...(mode ? { mode } : {}) }), request as never);
  }

  @Get('profiles/:handle/ratings')
  async listProfileRatings(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.leaderboard.listProfileRatingsByHandle(handle), request as never);
  }
}
