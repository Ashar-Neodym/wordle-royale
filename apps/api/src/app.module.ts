import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth/auth.controller.ts';
import { CurrentUserService } from './auth/current-user.service.ts';
import { GameplayController } from './gameplay/gameplay.controller.ts';
import { GameplayPersistenceService } from './gameplay/gameplay-persistence.service.ts';
import { HealthController } from './health/health.controller.ts';
import { ReadinessService } from './health/readiness.service.ts';
import { RedisReadinessService } from './health/redis-readiness.service.ts';
import { LeaderboardController } from './leaderboard/leaderboard.controller.ts';
import { LeaderboardReadService } from './leaderboard/leaderboard-read.service.ts';
import { LobbyController } from './lobby/lobby.controller.ts';
import { LobbyService } from './lobby/lobby.service.ts';
import { PrismaService } from './prisma/prisma.service.ts';
import { ProfileReadService } from './profile/profile-read.service.ts';
import { ProfileService } from './profile/profile.service.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: (config) => ({
        NODE_ENV: config.NODE_ENV ?? 'development',
        APP_ENV: config.APP_ENV ?? (config.NODE_ENV === 'production' ? 'production' : 'local'),
        AUTH_MODE: config.AUTH_MODE ?? (config.NODE_ENV === 'production' ? 'session_required' : 'dev_stub'),
        ENABLE_DEV_AUTH: config.ENABLE_DEV_AUTH ?? 'true',
        ENABLE_DEV_ROUTES: config.ENABLE_DEV_ROUTES ?? 'true',
        PORT: config.PORT ?? '3001',
        DATABASE_URL: config.DATABASE_URL ?? 'postgresql://wordle:***@localhost:5432/wordle_royale_local?schema=public',
        REDIS_URL: config.REDIS_URL ?? 'redis://localhost:6379',
      }),
    }),
  ],
  controllers: [HealthController, AuthController, LobbyController, GameplayController, LeaderboardController],
  providers: [PrismaService, RedisReadinessService, ReadinessService, CurrentUserService, ProfileService, ProfileReadService, LobbyService, GameplayPersistenceService, LeaderboardReadService],
})
export class AppModule {}
