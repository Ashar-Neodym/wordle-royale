import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SpeedRatingSettlementService } from './speed-rating-settlement.service.ts';
import { SpeedExpiryAdjudicationService } from './speed-expiry-adjudication.service.ts';
import { SpeedExpiryReconciliationService } from './speed-expiry-reconciliation.service.ts';
import { SpeedExpiryReconcilerService } from './speed-expiry-reconciler.service.ts';
import { SpeedRuntimeHealthService } from './speed-runtime-health.service.ts';

@Module({
  providers: [
    PrismaService,
    SpeedRatingSettlementService,
    SpeedExpiryAdjudicationService,
    SpeedExpiryReconciliationService,
    SpeedRuntimeHealthService,
    SpeedExpiryReconcilerService,
  ],
  exports: [
    PrismaService,
    SpeedRatingSettlementService,
    SpeedExpiryAdjudicationService,
    SpeedExpiryReconciliationService,
    SpeedRuntimeHealthService,
  ],
})
export class SpeedReconcilerRuntimeModule {}
