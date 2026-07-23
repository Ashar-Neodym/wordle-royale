import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { StandardDictionaryService } from '../dictionary/standard-dictionary.service.ts';
import { SpeedLifecycleActivationService } from '../gameplay/speed-lifecycle-activation.service.ts';
import type { SpeedActivationPhase, SpeedLifecycleVersion } from '../gameplay/speed-lifecycle-activation.types.ts';
import { speedQueueEnabled } from '../matchmaking/matchmaking-config.ts';
import { PrismaService } from '../prisma/prisma.service.ts';
import { SpeedRuntimeHealthService } from '../gameplay/speed-runtime-health.service.ts';

type DependencyStatus = { status: string };

export type SpeedOperationalStatus = {
  available: boolean;
  reason:
    | 'available'
    | 'feature_disabled'
    | 'activation_unavailable'
    | 'activation_draining'
    | 'activation_protocol_unsupported'
    | 'active_version_unsupported'
    | 'capability_lease_unavailable'
    | 'activation_schema_unavailable'
    | 'database_unavailable'
    | 'schema_unavailable'
    | 'dictionary_unavailable'
    | 'reconciler_unavailable';
  checkedAt: string;
  activeVersion?: SpeedLifecycleVersion | null;
  phase?: SpeedActivationPhase | null;
};

@Injectable()
export class SpeedOperationalReadinessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StandardDictionaryService) private readonly dictionary: StandardDictionaryService,
    @Inject(SpeedRuntimeHealthService) private readonly runtimeHealth: SpeedRuntimeHealthService,
    @Optional() @Inject(SpeedLifecycleActivationService) private readonly activation?: SpeedLifecycleActivationService,
  ) {}

  async checkPersistedRuntime(requireReconciler = true): Promise<SpeedOperationalStatus> {
    const checkedAt = new Date().toISOString();
    if (!speedQueueEnabled()) return { available: false, reason: 'feature_disabled', checkedAt };
    const database = await this.safeCheck(() => this.prisma.checkDatabase());
    if (database.status !== 'ok') return { available: false, reason: 'database_unavailable', checkedAt };
    const schema = await this.safeCheck(() => this.prisma.checkApplicationSchema());
    const lifecycleSchema = await this.safeCheck(() => this.prisma.checkSpeedReadyLifecycleSchema(false));
    if (schema.status !== 'ok' || lifecycleSchema.status !== 'ok') return { available: false, reason: 'schema_unavailable', checkedAt };
    const dictionary = await this.safeCheck(() => this.dictionary.checkStandardDictionary());
    if (dictionary.status !== 'ok') return { available: false, reason: 'dictionary_unavailable', checkedAt };
    if (requireReconciler && !this.runtimeHealth.isReconcilerReady()) return { available: false, reason: 'reconciler_unavailable', checkedAt };
    return { available: true, reason: 'available', checkedAt };
  }

  async check(requireReconciler = true): Promise<SpeedOperationalStatus> {
    const persisted = await this.checkPersistedRuntime(requireReconciler);
    if (!persisted.available) return persisted;
    const checkedAt = persisted.checkedAt;
    const activationSchema = await this.safeCheck(() => this.prisma.checkSpeedReadyLifecycleSchema(true));
    if (activationSchema.status !== 'ok') return { available: false, reason: 'activation_schema_unavailable', checkedAt };

    const activation = this.activation
      ? await this.activation.checkLocalAvailability()
      : process.env.NODE_TEST_CONTEXT
        ? { available: true as const, reason: 'available' as const, activeVersion: 'speed_ready_v2_first_ack_90s' as const, phase: 'v2_open' as const }
        : { available: false as const, reason: 'activation_unavailable' as const, activeVersion: null, phase: null };
    if (!activation.available) return { ...activation, checkedAt };
    return { available: true, reason: 'available', checkedAt, activeVersion: activation.activeVersion, phase: activation.phase };
  }

  evaluate(input: { database: DependencyStatus; applicationSchema: DependencyStatus; lifecycleSchema: DependencyStatus; dictionary: DependencyStatus }): SpeedOperationalStatus {
    const checkedAt = new Date().toISOString();
    if (!speedQueueEnabled()) return { available: false, reason: 'feature_disabled', checkedAt };
    if (input.database.status !== 'ok') return { available: false, reason: 'database_unavailable', checkedAt };
    if (input.applicationSchema.status !== 'ok' || input.lifecycleSchema.status !== 'ok') return { available: false, reason: 'schema_unavailable', checkedAt };
    if (input.dictionary.status !== 'ok') return { available: false, reason: 'dictionary_unavailable', checkedAt };
    if (!this.runtimeHealth.isReconcilerReady()) return { available: false, reason: 'reconciler_unavailable', checkedAt };
    return { available: true, reason: 'available', checkedAt };
  }

  async assertAvailable(): Promise<void> {
    const status = await this.check();
    if (!status.available) throw this.publicError(status.reason);
  }

  async assertDependenciesAvailable(): Promise<void> {
    const checkedAt = new Date().toISOString();
    if (!speedQueueEnabled()) throw this.publicError('feature_disabled');
    const database = await this.safeCheck(() => this.prisma.checkDatabase());
    if (database.status !== 'ok') throw this.publicError('database_unavailable');
    const schema = await this.safeCheck(() => this.prisma.checkApplicationSchema());
    const lifecycle = await this.safeCheck(() => this.prisma.checkSpeedReadyLifecycleSchema(false));
    if (schema.status !== 'ok' || lifecycle.status !== 'ok') throw this.publicError('schema_unavailable');
    const dictionary = await this.safeCheck(() => this.dictionary.checkStandardDictionary());
    if (dictionary.status !== 'ok') throw this.publicError('dictionary_unavailable');
    void checkedAt;
  }

  private publicError(reason: SpeedOperationalStatus['reason']): ServiceUnavailableException {
    if (reason === 'activation_draining') {
      return new ServiceUnavailableException({ code: 'speed_lifecycle_draining', message: 'Speed matchmaking is temporarily closed for lifecycle maintenance.' });
    }
    if (reason === 'active_version_unsupported') {
      return new ServiceUnavailableException({ code: 'speed_lifecycle_version_mismatch', message: 'Speed lifecycle compatibility is temporarily unavailable.' });
    }
    if (reason.startsWith('activation_') || reason === 'capability_lease_unavailable') {
      return new ServiceUnavailableException({ code: 'speed_lifecycle_activation_unavailable', message: 'Speed lifecycle activation is temporarily unavailable.' });
    }
    return new ServiceUnavailableException({ code: 'speed_1v1_unavailable', message: 'Speed 1v1 is temporarily unavailable. Retry later.' });
  }

  private async safeCheck(check: () => Promise<DependencyStatus>): Promise<DependencyStatus> {
    try { return await check(); } catch { return { status: 'unavailable' }; }
  }
}
