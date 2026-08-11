import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth/auth.controller.ts';
import { CurrentUserService } from './auth/current-user.service.ts';
import { DurableAuthPersistenceService } from './auth/durable-auth-persistence.service.ts';
import { DurableUnsafeRequestMiddleware, durableAuthActive } from './auth/durable-unsafe-request.middleware.ts';
import { PreviewDemoSessionService } from './auth/preview-demo-session.service.ts';
import { ExternalSessionService } from './auth/external-session.service.ts';
import { ExternalTokenVerifier } from './auth/external-token-verifier.ts';
import { authRegistrationMode, decodeAuthRateLimitKey, decodeAuthRegistrationCanaryDigest, externalOidcConfig, validateRuntimeConfig } from './config/runtime-config.ts';
import { StandardDictionaryService } from './dictionary/standard-dictionary.service.ts';
import { GameplayController } from './gameplay/gameplay.controller.ts';
import { GameplayPersistenceService } from './gameplay/gameplay-persistence.service.ts';
import { SpeedGameplayService } from './gameplay/speed-gameplay.service.ts';
import { SpeedReconcilerRuntimeModule } from './gameplay/speed-reconciler-runtime.module.ts';
import { SpeedLifecycleActivationService } from './gameplay/speed-lifecycle-activation.service.ts';
import { SpeedLifecycleCapabilityService } from './gameplay/speed-lifecycle-capability.service.ts';
import { HealthController } from './health/health.controller.ts';
import { ReadinessService } from './health/readiness.service.ts';
import { AuthReadinessService } from './health/auth-readiness.service.ts';
import { SpeedOperationalReadinessService } from './health/speed-operational-readiness.service.ts';
import { RedisReadinessService } from './health/redis-readiness.service.ts';
import { LeaderboardController } from './leaderboard/leaderboard.controller.ts';
import { LeaderboardReadService } from './leaderboard/leaderboard-read.service.ts';
import { LobbyController } from './lobby/lobby.controller.ts';
import { LobbyService } from './lobby/lobby.service.ts';
import { MatchmakingController, SpeedMatchmakingController } from './matchmaking/matchmaking.controller.ts';
import { MatchmakingService } from './matchmaking/matchmaking.service.ts';
import { ProfileReadService } from './profile/profile-read.service.ts';
import { ProfileService } from './profile/profile.service.ts';
import { PrismaService } from './prisma/prisma.service.ts';
import { StandbySurfaceMiddleware } from './standby/standby-surface.middleware.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateRuntimeConfig,
    }),
    SpeedReconcilerRuntimeModule,
  ],
  controllers: [HealthController, AuthController, LobbyController, GameplayController, LeaderboardController, MatchmakingController, SpeedMatchmakingController],
  providers: [
    StandardDictionaryService, RedisReadinessService, SpeedLifecycleCapabilityService, SpeedLifecycleActivationService,
    SpeedOperationalReadinessService, AuthReadinessService, ReadinessService, PreviewDemoSessionService,
    {
      provide: DurableAuthPersistenceService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new DurableAuthPersistenceService(prisma.client as unknown as PrismaClient, {
        enabled: durableAuthActive(),
        ...(process.env.AUTH_RATE_LIMIT_KEY ? { rateLimitKey: decodeAuthRateLimitKey(process.env.AUTH_RATE_LIMIT_KEY) } : {}),
        registrationMode: authRegistrationMode(),
        ...(process.env.AUTH_REGISTRATION_CANARY_DIGEST ? { registrationCanaryDigest: decodeAuthRegistrationCanaryDigest(process.env.AUTH_REGISTRATION_CANARY_DIGEST) } : {}),
        sessionTtlMs: Number(process.env.ACCOUNT_SESSION_TTL_SECONDS ?? '2592000') * 1_000,
        lastSeenIntervalMs: Number(process.env.ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS ?? '900') * 1_000,
      }),
    },
    {
      provide: ExternalSessionService,
      inject: [PrismaService, DurableAuthPersistenceService],
      useFactory: (prisma: PrismaService, durableAuth: DurableAuthPersistenceService) => {
        const config = externalOidcConfig();
        return new ExternalSessionService(prisma.client as unknown as PrismaClient, durableAuth, config ? ExternalTokenVerifier.remote(config) : null);
      },
    },
    StandbySurfaceMiddleware, DurableUnsafeRequestMiddleware, CurrentUserService, ProfileService, ProfileReadService, LobbyService,
    GameplayPersistenceService, SpeedGameplayService, LeaderboardReadService, MatchmakingService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(StandbySurfaceMiddleware, DurableUnsafeRequestMiddleware).forRoutes('*');
  }
}
