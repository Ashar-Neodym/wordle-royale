import { BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { authSessionResponseSchema, authTokenResponseSchema, devStubRegisterRequestSchema, loginRequestSchema, logoutRequestSchema, registerRequestSchema, updateProfileRequestSchema } from '@wordle-royale/contracts';
import type { LoginRequest, RegisterRequest, UpdateProfileRequest } from '@wordle-royale/contracts';
import { AuthRateLimitedError } from './auth-rate-limiter.ts';
import { CurrentUserService } from './current-user.service.ts';
import { clearDurableSessionCookie, readDurableSessionToken, setDurableSessionCookie } from './durable-session-cookie.ts';
import { durableAuthActive } from './durable-unsafe-request.middleware.ts';
import { AuthUnavailableError, DurableAuthPersistenceService, InvalidCredentialsError, RegistrationUnavailableError } from './durable-auth-persistence.service.ts';
import { PreviewDemoSessionService } from './preview-demo-session.service.ts';
import { ExternalAuthUnavailableError, ExternalIdentityConflictError, ExternalSessionService } from './external-session.service.ts';
import { ExternalTokenInvalidError } from './external-token-verifier.ts';
import { normalizeDisplayName, normalizeHandle } from './auth-input.ts';
import { ProfileReadService } from '../profile/profile-read.service.ts';
import { ProfileService } from '../profile/profile.service.ts';
import { ok } from '../shared/envelope.ts';
import { ZodValidationPipe } from '../shared/zod-validation.pipe.ts';

const stubUserId = '11111111-1111-4111-8111-111111111111';
type RequestLike = { headers?: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } };
type ResponseLike = { setHeader(name: string, value: string | string[]): void };

function invalidRequest(): BadRequestException {
  return new BadRequestException({ code: 'invalid_request', message: 'Invalid request.', details: {} });
}

@Controller()
export class AuthController {
  constructor(
    @Inject(ProfileService) private readonly profiles: ProfileService,
    @Inject(ProfileReadService) private readonly profileRead: ProfileReadService,
    @Inject(CurrentUserService) private readonly currentUsers: CurrentUserService,
    @Inject(PreviewDemoSessionService) private readonly previewSessions: PreviewDemoSessionService,
    @Inject(DurableAuthPersistenceService) private readonly durableAuth: DurableAuthPersistenceService,
    @Inject(ExternalSessionService) private readonly externalSessions: ExternalSessionService,
  ) {}

  @Get('auth/me')
  async me(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown, @Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    const currentUser = await this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.getCurrentUser(currentUser.userId), request as never);
  }

  @Post('auth/register')
  async register(@Body() rawBody: unknown, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    if (!durableAuthActive()) {
      this.currentUsers.requireDevAuthEnabled();
      let body: { email: string };
      try { body = devStubRegisterRequestSchema.parse(rawBody); } catch { throw invalidRequest(); }
      return ok(authTokenResponseSchema.parse({
        user: { id: stubUserId, email: body.email, status: 'active', role: 'player', createdAt: new Date().toISOString() },
        accessToken: 'stub-access-token-not-for-production',
        refreshToken: 'stub-refresh-token-not-for-production',
      }), request as never);
    }
    let body: RegisterRequest;
    try { body = registerRequestSchema.parse(rawBody); } catch { throw invalidRequest(); }
    try {
      const result = await this.durableAuth.register(body, this.clientIp(request));
      setDurableSessionCookie(response, result.token, result.session.expiresAt);
      return ok(authSessionResponseSchema.parse({
        user: await this.profiles.getCurrentUser(result.session.userId),
        session: { id: result.session.id, provider: 'password', createdAt: result.session.createdAt.toISOString(), expiresAt: result.session.expiresAt.toISOString() },
      }), request as never);
    } catch (error) { throw this.publicAuthError(error); }
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() rawBody: unknown, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    if (!durableAuthActive()) throw new ServiceUnavailableException({ code: 'auth_unavailable', message: 'Durable authentication is unavailable.', details: {} });
    let body: LoginRequest;
    try { body = loginRequestSchema.parse(rawBody); } catch { throw invalidRequest(); }
    try {
      const result = await this.durableAuth.login(body, this.clientIp(request), readDurableSessionToken(request));
      setDurableSessionCookie(response, result.token, result.session.expiresAt);
      return ok(authSessionResponseSchema.parse({
        user: await this.profiles.getCurrentUser(result.session.userId),
        session: { id: result.session.id, provider: 'password', createdAt: result.session.createdAt.toISOString(), expiresAt: result.session.expiresAt.toISOString() },
      }), request as never);
    } catch (error) { throw this.publicAuthError(error); }
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Body() rawBody: unknown, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    try { logoutRequestSchema.parse(rawBody ?? {}); } catch { throw invalidRequest(); }
    clearDurableSessionCookie(response);
    if (durableAuthActive()) await this.durableAuth.logout(readDurableSessionToken(request));
  }

  @Post('auth/external/session')
  @HttpCode(200)
  async externalSession(@Headers('authorization') authorization: string | string[] | undefined, @Body() rawBody: unknown, @Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) {
    response.setHeader('Cache-Control', 'no-store');
    const match = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/u.exec(authorization) : null;
    if (!match) throw new UnauthorizedException({ code: 'invalid_external_token', message: 'External token is invalid.', details: {} });
    let body: { handle?: string; displayName?: string };
    try {
      if (rawBody == null) body = {};
      else if (typeof rawBody === 'object' && !Array.isArray(rawBody) && Object.keys(rawBody).every((key) => key === 'handle' || key === 'displayName')) {
        const candidate = rawBody as Record<string, unknown>;
        body = {
          ...(candidate.handle !== undefined ? { handle: normalizeHandle(candidate.handle as string) } : {}),
          ...(candidate.displayName !== undefined ? { displayName: normalizeDisplayName(candidate.displayName as string) } : {}),
        };
      } else throw new TypeError();
    } catch { throw invalidRequest(); }
    try {
      const presentedSessionToken = readDurableSessionToken(request);
      const result = await this.externalSessions.exchange({
        token: match[1]!,
        clientIp: this.clientIp(request),
        ...(presentedSessionToken ? { presentedSessionToken } : {}),
        ...body,
      });
      setDurableSessionCookie(response, result.token, result.session.expiresAt);
      return ok(authSessionResponseSchema.parse({
        user: await this.profiles.getCurrentUser(result.session.userId),
        session: { id: result.session.id, provider: 'oidc', createdAt: result.session.createdAt.toISOString(), expiresAt: result.session.expiresAt.toISOString() },
      }), request as never);
    } catch (error) {
      if (error instanceof ExternalTokenInvalidError) throw new UnauthorizedException({ code: error.code, message: error.message, details: {} });
      if (error instanceof ExternalIdentityConflictError) throw new ConflictException({ code: error.code, message: error.message, details: {} });
      if (error instanceof AuthRateLimitedError) throw new HttpException({ code: error.code, message: error.message, details: {} }, HttpStatus.TOO_MANY_REQUESTS);
      if (error instanceof ExternalAuthUnavailableError) throw new ServiceUnavailableException({ code: error.code, message: error.message, details: {} });
      throw new ServiceUnavailableException({ code: 'external_auth_unavailable', message: 'External authentication is unavailable.', details: {} });
    }
  }

  @Post('auth/preview-demo/start')
  async startPreviewDemo(@Req() request: unknown, @Res({ passthrough: true }) response: ResponseLike) {
    this.currentUsers.requirePreviewDemoSessionsEnabled();
    const session = await this.previewSessions.start(response);
    const user = await this.profiles.getCurrentUser(session.userId);
    return ok({ mode: 'preview_demo_session', user, session: { expiresAt: session.expiresAt, cookieName: session.cookieName } }, request as never);
  }

  @Get('profile/me')
  async profile(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = await this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.getPublicProfile(currentUser.userId), request as never);
  }

  @Get('profiles/me/summary')
  async currentProfileSummary(@Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = await this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profileRead.getCurrentProfileSummary(currentUser.userId), request as never);
  }

  @Get('profiles/:handle/summary')
  async publicProfileSummary(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.profileRead.getPublicProfileSummary(handle), request as never);
  }

  @Patch('profile/me')
  async updateProfile(@Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest, @Headers('x-wordle-dev-user-id') devUserId: string | string[] | undefined, @Req() request: unknown) {
    const currentUser = await this.currentUsers.resolveCurrentUser(devUserId, request as never);
    return ok(await this.profiles.updateProfile(body, currentUser.userId), request as never);
  }

  @Get('profile/handles/:handle/availability')
  async handleAvailability(@Param('handle') handle: string, @Req() request: unknown) {
    return ok(await this.profiles.handleAvailability(handle), request as never);
  }

  private clientIp(request: RequestLike): string { return request.ip ?? request.socket?.remoteAddress ?? 'unknown'; }
  private publicAuthError(error: unknown): Error {
    if (error instanceof RegistrationUnavailableError) return new ConflictException({ code: error.code, message: error.message, details: {} });
    if (error instanceof InvalidCredentialsError) return new UnauthorizedException({ code: error.code, message: error.message, details: {} });
    if (error instanceof AuthRateLimitedError) return new HttpException({ code: error.code, message: error.message, details: {} }, HttpStatus.TOO_MANY_REQUESTS);
    if (error instanceof AuthUnavailableError) return new ServiceUnavailableException({ code: error.code, message: error.message, details: {} });
    if (error instanceof TypeError) return invalidRequest();
    return error instanceof Error ? error : new Error('auth failure');
  }
}
