import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PreviewDemoSessionService } from './preview-demo-session.service.ts';

export type AppEnv = 'local' | 'test' | 'preview' | 'production';
export type AuthMode = 'dev_stub' | 'session_required' | 'preview_demo_session';

type RequestLike = { headers?: Record<string, string | string[] | undefined> } | undefined;

export type CurrentUserContext = {
  userId: string;
  source: 'dev_stub' | 'preview_demo_session';
};

export const localFixtureUsers = {
  playerOne: '11111111-1111-4111-8111-111111111111',
  guestPlayer: '22222222-2222-4222-8222-222222222222',
  emptyPlayer: '33333333-3333-4333-8333-333333333333',
} as const;

const localFixtureUserIds = new Set<string>(Object.values(localFixtureUsers));

function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

@Injectable()
export class CurrentUserService {
  constructor(@Inject(PreviewDemoSessionService) private readonly previewSessions: PreviewDemoSessionService) {}

  appEnv(): AppEnv {
    const appEnv = process.env.APP_ENV;
    if (appEnv === 'local' || appEnv === 'test' || appEnv === 'preview' || appEnv === 'production') return appEnv;
    if (process.env.NODE_ENV === 'test') return 'test';
    if (process.env.NODE_ENV === 'production') return 'production';
    return 'local';
  }

  authMode(): AuthMode {
    const authMode = process.env.AUTH_MODE;
    if (authMode === 'dev_stub' || authMode === 'session_required' || authMode === 'preview_demo_session') return authMode;
    return this.appEnv() === 'local' || this.appEnv() === 'test' ? 'dev_stub' : 'session_required';
  }

  devAuthAllowed(): boolean {
    const appEnv = this.appEnv();
    return (appEnv === 'local' || appEnv === 'test')
      && this.authMode() === 'dev_stub'
      && envFlagEnabled(process.env.ENABLE_DEV_AUTH, true);
  }

  devRoutesAllowed(): boolean {
    const appEnv = this.appEnv();
    return (appEnv === 'local' || appEnv === 'test')
      && this.authMode() === 'dev_stub'
      && envFlagEnabled(process.env.ENABLE_DEV_ROUTES, true);
  }

  resolveCurrentUser(headerValue: string | string[] | undefined, request?: RequestLike): CurrentUserContext {
    if (this.authMode() === 'preview_demo_session') {
      const userId = this.previewSessions.resolveUserId(request);
      if (!userId) throw this.notAuthenticated();
      return { userId, source: 'preview_demo_session' };
    }

    if (!this.devAuthAllowed()) {
      throw this.notAuthenticated();
    }

    const userId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!userId) return { userId: localFixtureUsers.playerOne, source: 'dev_stub' };

    if (!localFixtureUserIds.has(userId)) {
      throw new BadRequestException({
        code: 'unknown_dev_fixture_user',
        message: 'Only local/test fixture users can be selected with x-wordle-dev-user-id.',
        details: { allowedUserIds: [...localFixtureUserIds] },
      });
    }

    return { userId, source: 'dev_stub' };
  }

  requireDevAuthEnabled(): void {
    if (!this.devAuthAllowed()) {
      throw this.notAuthenticated();
    }
  }

  requirePreviewDemoSessionsEnabled(): void {
    if (this.authMode() !== 'preview_demo_session') {
      throw this.notAuthenticated();
    }
  }

  requireDevRoutesEnabled(): void {
    if (!this.devRoutesAllowed()) {
      throw new ForbiddenException({
        code: 'dev_helper_disabled',
        message: 'Local ranked smoke helpers are disabled outside local/dev/test environments.',
        details: { authMode: this.authMode(), appEnv: this.appEnv() },
      });
    }
  }

  private notAuthenticated(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'not_authenticated',
      message: 'Sign in is required for this action.',
      details: { authMode: this.authMode(), appEnv: this.appEnv() },
    });
  }
}
