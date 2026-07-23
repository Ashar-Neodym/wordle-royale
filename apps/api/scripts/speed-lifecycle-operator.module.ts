import type { INestApplicationContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { StandardDictionaryService } from '../src/dictionary/standard-dictionary.service.ts';
import { SpeedExpiryReconcilerService } from '../src/gameplay/speed-expiry-reconciler.service.ts';
import { SpeedGameplayService } from '../src/gameplay/speed-gameplay.service.ts';
import { SpeedLifecycleCapabilityService } from '../src/gameplay/speed-lifecycle-capability.service.ts';
import { MatchmakingService } from '../src/matchmaking/matchmaking.service.ts';
import { RailwayCliExecutor, RailwayInventoryAdapter } from '../src/gameplay/railway-inventory.adapter.ts';
import {
  DefaultOperatorReadinessVerifier,
  SpeedLifecycleOperatorService,
} from '../src/gameplay/speed-lifecycle-operator.service.ts';
import { PrismaService } from '../src/prisma/prisma.service.ts';

export const RAILWAY_ADAPTER = Symbol('RAILWAY_ADAPTER');
export const OPERATOR_READINESS = Symbol('OPERATOR_READINESS');

@Module({
  providers: [
    PrismaService,
    StandardDictionaryService,
    RailwayCliExecutor,
    { provide: RAILWAY_ADAPTER, inject: [RailwayCliExecutor], useFactory: (executor: RailwayCliExecutor) => new RailwayInventoryAdapter(executor) },
    { provide: OPERATOR_READINESS, inject: [PrismaService, StandardDictionaryService], useFactory: (prisma: PrismaService, dictionary: StandardDictionaryService) => new DefaultOperatorReadinessVerifier(prisma, dictionary) },
    { provide: SpeedLifecycleOperatorService, inject: [PrismaService, RAILWAY_ADAPTER, OPERATOR_READINESS], useFactory: (prisma: PrismaService, railway: RailwayInventoryAdapter, readiness: DefaultOperatorReadinessVerifier) => new SpeedLifecycleOperatorService(prisma, railway, readiness) },
  ],
  exports: [SpeedLifecycleOperatorService],
})
export class SpeedLifecycleOperatorModule {}

const FORBIDDEN_RUNTIME_PROVIDERS = [
  SpeedLifecycleCapabilityService,
  SpeedExpiryReconcilerService,
  SpeedGameplayService,
  MatchmakingService,
] as const;

export function assertOperatorContextIsolated(app: INestApplicationContext): void {
  for (const provider of FORBIDDEN_RUNTIME_PROVIDERS) {
    try {
      app.get(provider, { strict: false });
      throw new Error('operator_context_runtime_worker_present');
    } catch (error) {
      if (error instanceof Error && error.message === 'operator_context_runtime_worker_present') throw error;
    }
  }
}
