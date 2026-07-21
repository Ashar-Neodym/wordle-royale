import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth/auth.controller.ts';
import { CurrentUserService } from './auth/current-user.service.ts';
import { PreviewDemoSessionService } from './auth/preview-demo-session.service.ts';
import { validateRuntimeConfig } from './config/runtime-config.ts';
import { StandardDictionaryService } from './dictionary/standard-dictionary.service.ts';
import { GameplayController } from './gameplay/gameplay.controller.ts';
import { GameplayPersistenceService } from './gameplay/gameplay-persistence.service.ts';
import { SpeedExpiryReconcilerService } from './gameplay/speed-expiry-reconciler.service.ts';
import { SpeedGameplayService } from './gameplay/speed-gameplay.service.ts';
import { SpeedRuntimeHealthService } from './gameplay/speed-runtime-health.service.ts';
import { SpeedLifecycleActivationService } from './gameplay/speed-lifecycle-activation.service.ts';
import { SpeedLifecycleCapabilityService } from './gameplay/speed-lifecycle-capability.service.ts';
import { HealthController } from './health/health.controller.ts';
import { ReadinessService } from './health/readiness.service.ts';
import { SpeedOperationalReadinessService } from './health/speed-operational-readiness.service.ts';
import { RedisReadinessService } from './health/redis-readiness.service.ts';
import { LeaderboardController } from './leaderboard/leaderboard.controller.ts';
import { LeaderboardReadService } from './leaderboard/leaderboard-read.service.ts';
import { LobbyController } from './lobby/lobby.controller.ts';
import { LobbyService } from './lobby/lobby.service.ts';
import { MatchmakingController, SpeedMatchmakingController } from './matchmaking/matchmaking.controller.ts';
import { MatchmakingService } from './matchmaking/matchmaking.service.ts';
import { PrismaService } from './prisma/prisma.service.ts';
import { ProfileReadService } from './profile/profile-read.service.ts';
import { ProfileService } from './profile/profile.service.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateRuntimeConfig,
    }),
  ],
  controllers: [HealthController, AuthController, LobbyController, GameplayController, LeaderboardController, MatchmakingController, SpeedMatchmakingController],
  providers: [PrismaService, StandardDictionaryService, RedisReadinessService, SpeedRuntimeHealthService, SpeedLifecycleCapabilityService, SpeedLifecycleActivationService, SpeedOperationalReadinessService, ReadinessService, PreviewDemoSessionService, CurrentUserService, ProfileService, ProfileReadService, LobbyService, GameplayPersistenceService, SpeedGameplayService, SpeedExpiryReconcilerService, LeaderboardReadService, MatchmakingService],
})
export class AppModule {}
