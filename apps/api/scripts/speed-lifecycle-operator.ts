import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { abbreviateId } from '../src/gameplay/speed-lifecycle-proof.ts';
import {
  SpeedLifecycleOperatorService,
  toOperatorFailure,
  type OperatorOperation,
} from '../src/gameplay/speed-lifecycle-operator.service.ts';
import { SpeedLifecycleOperatorModule, assertOperatorContextIsolated } from './speed-lifecycle-operator.module.ts';
import { parseOperatorArgs } from './speed-lifecycle-operator-args.ts';

async function main(): Promise<void> {
  let app;
  try {
    const input = parseOperatorArgs(process.argv.slice(2));
    app = await NestFactory.createApplicationContext(SpeedLifecycleOperatorModule, { logger: false });
    assertOperatorContextIsolated(app);
    const service = app.get(SpeedLifecycleOperatorService, { strict: true });
    const operation = input.command === 'verify' ? undefined : input.command;
    if (!input.apply) {
      const result = operation
        ? await service.waitForConvergence(input.target, operation)
        : await service.verify(input.target);
      const evidence = {
        result: 'PASS', mode: 'dry-run', proofProtocol: result.proof.proofProtocol,
        proofId: result.proof.proofId,
        scope: {
          projectId: abbreviateId(result.proof.projectId),
          environmentId: abbreviateId(result.proof.environmentId),
          serviceId: abbreviateId(result.proof.serviceId),
        },
        deploymentId: result.proof.deploymentId,
        artifactIdentity: result.proof.artifactIdentity,
        releaseId: result.proof.releaseId,
        providerReplicaCount: result.proof.servingReplicaCount,
        freshMatchingLeaseCount: result.matchingLeaseCount,
        freshNonTargetLeaseCount: result.nonTargetLeaseCount,
        authority: { phase: input.target.expectedPhase, generation: input.target.expectedGeneration.toString() },
        readiness: result.readiness,
        eligibleDrainCount: result.eligibleDrainCount,
        observationIntervalMs: result.proof.providerObservedAfterAt.getTime() - result.proof.providerObservedBeforeAt.getTime(),
      };
      process.stdout.write(input.json ? `${JSON.stringify(evidence)}\n` : [
        'PASS dry-run',
        `proofProtocol=${evidence.proofProtocol}`,
        `scope=${evidence.scope.projectId}/${evidence.scope.environmentId}/${evidence.scope.serviceId}`,
        `deploymentId=${evidence.deploymentId}`,
        `artifactIdentity=${evidence.artifactIdentity}`,
        `releaseId=${evidence.releaseId}`,
        'providerStatus=settled_target_success',
        `providerReplicaCount=${evidence.providerReplicaCount}`,
        `freshMatchingLeaseCount=${evidence.freshMatchingLeaseCount}`,
        `freshNonTargetLeaseCount=${evidence.freshNonTargetLeaseCount}`,
        `authority=${evidence.authority.phase}/${evidence.authority.generation}`,
        `readiness=schema:${evidence.readiness.schema},dictionary:${evidence.readiness.dictionary},reconciler:${evidence.readiness.reconciler},standard:${evidence.readiness.standard}`,
        `eligibleDrainCount=${evidence.eligibleDrainCount}`,
        `observationIntervalMs=${evidence.observationIntervalMs}`,
      ].join('\n') + '\n');
      return;
    }
    const result = await service.apply({
      operation: input.command as OperatorOperation,
      target: input.target,
      approvalRef: input.approvalRef,
      confirmation: input.confirmation,
      reason: input.reason,
    });
    const evidence = { result: 'PASS', mode: 'apply', operation: input.command, proofId: result.proofId, generation: result.generation.toString() };
    process.stdout.write(input.json ? `${JSON.stringify(evidence)}\n` : `PASS apply ${input.command} generation=${evidence.generation} proof=${evidence.proofId}\n`);
  } catch (error) {
    const failure = toOperatorFailure(error);
    process.stderr.write(`${JSON.stringify({ result: 'FAIL', failureCode: failure.code })}\n`);
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

await main();
