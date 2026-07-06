import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { authTokenResponseSchema, registerRequestSchema, updateProfileRequestSchema } from '@wordle-royale/contracts';
import type { RegisterRequest, UpdateProfileRequest } from '@wordle-royale/contracts';
import { CurrentUserService } from './current-user.service.ts';
import { PreviewDemoSessionService } from './preview-demo-session.service.ts';
import { ProfileReadService } from '../profile/profile-read.service.ts';
import { ProfileService } from '../profile/profile.service.ts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';

const stubUserId = '11111111-1111-4111-8111-111111111111';

type ResponseLike = { setHeader?: (name: string, value: string | string[]) => void };

@Controller()
export class AuthController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(ProfileReadService) private readonly profileRead: ProfileReadService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
    @Inject(PreviewDemoSessionService) private readonly previewSessions: PreviewDemoSessionService,
  ) {}

  @Get('auth/me')
  async me(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.getCurrentUser(currentUser.userId), request as never);
  }

  @Post('auth/register')
  register(@Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest, @Req() request: unknown) {
    this.currentUsers.requireDevAuthEnabled();
    return ok(authTokenResponseSchema.parse({
      user: {
        id: stubUserId,
        email: body.email,
        status: 'active',
        role: 'player',
        createdAt: new Date().toISOString(),
      },
      accessToken: 'stub-access-token-not-for-production',
      refreshToken: 'stub-refresh-token-not-for-production',
    }), request as never);
  }

  @Post('auth/preview-demo/start')
  async startPreviewDemo(@Req() request: unknown, @Res({ passthrough: true }) response: ResponseLike) {
    this.currentUsers.requirePreviewDemoSessionsEnabled();
    const session = await this.previewSessions.start(response);
    const user = await this.profiles.getCurrentUser(session.userId);
    return ok({
      mode: 'preview_demo_session',
      user,
      session: {
        expiresAt: session.expiresAt,
        cookieName: session.cookieName,
      },
    }, request as never);
  }

  @Get('profile/me')
  async profile(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.getPublicProfile(currentUser.userId), request as never);
  }

  @Get('profiles/me/summary')
  async currentProfileSummary(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profileRead.getCurrentProfileSummary(currentUser.userId), request as never);
  }

  @Get('profiles/:handle/summary')
  async publicProfileSummary(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.profileRead.getPublicProfileSummary(handle), request as never);
  }

  @Patch('profile/me')
  async updateProfile(
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
    @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined,
    @Req() request: unknown,
  ) {
    const currentUser = this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.updateProfile(body, currentUser.userId), request as never);
  }

  @Get('profile/handles/:handle/availability')
  async handleAvailability(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.profiles.handleAvailability(handle), request as never);
  }
}
