import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { authTokenResponseSchema, registerRequestSchema, updateProfileRequestSchema } from '@wordle-royale/contracts';
import type { RegisterRequest, UpdateProfileRequest } from '@wordle-royale/contracts';
import { ProfileService } from '../profile/profile.service.ts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';

const stubUserId = '11111111-1111-4111-8111-111111111111';

@Controller()
export class AuthController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get('auth/me')
  async me(@Req() request: unknown) {
    return ok(await this.profiles.getCurrentUser(), request as never);
  }

  @Post('auth/register')
  register(@Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest, @Req() request: unknown) {
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

  @Get('profile/me')
  async profile(@Req() request: unknown) {
    return ok(await this.profiles.getPublicProfile(), request as never);
  }

  @Patch('profile/me')
  async updateProfile(@Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest, @Req() request: unknown) {
    return ok(await this.profiles.updateProfile(body), request as never);
  }

  @Get('profile/handles/:handle/availability')
  async handleAvailability(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.profiles.handleAvailability(handle), request as never);
  }
}
