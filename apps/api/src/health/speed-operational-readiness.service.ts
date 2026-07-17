import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import { speedQueueEnabled } from '../matchmaking/matchmaking-config.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SpeedRuntimeHealthService } from '../gameplay/speed-runtime-health.service.ts';

type DependencyStatus = { status: string };

export type SpeedOperationalStatus = {
  available: boolean;
  reason: 'available' | 'feature_disabled' | 'database_unavailable' | 'schema_unavailable' | 'dictionary_unavailable' | 'reconciler_unavailable';
  checkedAt: string;
};

@Injectable()
export class SpeedOperationalReadinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
    @Inject(SpeedRuntimeHealthService) private readonly runtimeHealth: SpeedRuntimeHealthService,
  ) {}

  async check(requireReconciler = true): Promise<SpeedOperationalStatus> {
    const checkedAt = new Date().toISOString();
    if (!speedQueueEnabled()) return { available: false, reason: 'feature_disabled', checkedAt };

    const database = await this.safeCheck(() => this.prisma.checkDatabase());
    if (database.status !== 'ok') return { available: false, reason: 'database_unavailable', checkedAt };

    const schema = await this.safeCheck(() => this.prisma.checkApplicationSchema());
    if (schema.status !== 'ok') return { available: false, reason: 'schema_unavailable', checkedAt };

    const dictionary = await this.safeCheck(() => this.dictionary.checkStandardDictionary());
    if (dictionary.status !== 'ok') return { available: false, reason: 'dictionary_unavailable', checkedAt };

    if (requireReconciler && !this.runtimeHealth.isReconcilerReady()) return { available: false, reason: 'reconciler_unavailable', checkedAt };
    return { available: true, reason: 'available', checkedAt };
  }

  evaluate(input: { database: DependencyStatus; applicationSchema: DependencyStatus; dictionary: DependencyStatus }): SpeedOperationalStatus {
    const checkedAt = new Date().toISOString();
    if (!speedQueueEnabled()) return { available: false, reason: 'feature_disabled', checkedAt };
    if (input.database.status !== 'ok') return { available: false, reason: 'database_unavailable', checkedAt };
    if (input.applicationSchema.status !== 'ok') return { available: false, reason: 'schema_unavailable', checkedAt };
    if (input.dictionary.status !== 'ok') return { available: false, reason: 'dictionary_unavailable', checkedAt };
    if (!this.runtimeHealth.isReconcilerReady()) return { available: false, reason: 'reconciler_unavailable', checkedAt };
    return { available: true, reason: 'available', checkedAt };
  }

  async assertAvailable(): Promise<void> {
    const status = await this.check();
    if (!status.available) {
      throw new ServiceUnavailableException({
        code: 'speed_1v1_unavailable',
        message: 'Speed 1v1 is temporarily unavailable. Retry later.',
      });
    }
  }

  async assertDependenciesAvailable(): Promise<void> {
    const status = await this.check(false);
    if (!status.available) {
      throw new ServiceUnavailableException({
        code: 'speed_1v1_unavailable',
        message: 'Speed 1v1 is temporarily unavailable. Retry later.',
      });
    }
  }

  private async safeCheck(check: () => Promise<DependencyStatus>): Promise<DependencyStatus> {
    try {
      return await check();
    } catch {
      return { status: 'unavailable' };
    }
  }
}
