import { SpeedLifecycleOperatorError, type OperatorOperation, type OperatorTarget } from '../src/gameplay/speed-lifecycle-operator.service.ts';

const OPERATIONS = new Set<OperatorOperation>(['close-v2', 'open-v2', 'disable', 'close-v1', 'open-v1']);
const COMMON_VALUE_FLAGS = new Set([
  '--project-id', '--environment-id', '--service-id', '--deployment-id', '--expected-release',
  '--expected-artifact', '--expected-replicas', '--expected-phase', '--expected-generation', '--health-url',
]);
const APPLY_VALUE_FLAGS = new Set(['--approval-ref', '--confirmation', '--reason']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const GIT_ARTIFACT = /^git:[0-9a-fA-F]{40}$/;

export type ParsedOperatorArgs = {
  command: 'verify' | OperatorOperation;
  apply: boolean;
  json: boolean;
  target: OperatorTarget;
  approvalRef: string;
  confirmation: string;
  reason: string;
};

export function parseOperatorArgs(rawArgv: string[]): ParsedOperatorArgs {
  const argv = rawArgv[0] === '--' ? rawArgv.slice(1) : rawArgv;
  const command = argv[0];
  if (command !== 'verify' && !OPERATIONS.has(command as OperatorOperation)) throw new SpeedLifecycleOperatorError('command_unsupported');
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index]!;
    if (key === '--apply' || key === '--json') {
      if (flags.has(key)) throw new SpeedLifecycleOperatorError('argument_invalid');
      flags.add(key);
      continue;
    }
    if (!COMMON_VALUE_FLAGS.has(key) && !APPLY_VALUE_FLAGS.has(key)) throw new SpeedLifecycleOperatorError('argument_invalid');
    if (values.has(key) || index + 1 >= argv.length || argv[index + 1]!.startsWith('--')) throw new SpeedLifecycleOperatorError('argument_invalid');
    values.set(key, argv[++index]!);
  }
  const apply = flags.has('--apply');
  if (command === 'verify' && apply) throw new SpeedLifecycleOperatorError('command_unsupported');
  if (!apply && [...APPLY_VALUE_FLAGS].some((key) => values.has(key))) throw new SpeedLifecycleOperatorError('argument_invalid');
  if (apply && !OPERATIONS.has(command as OperatorOperation)) throw new SpeedLifecycleOperatorError('command_unsupported');
  const required = (key: string): string => {
    const value = values.get(key);
    if (value == null || !value.length) throw new SpeedLifecycleOperatorError('argument_missing');
    if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new SpeedLifecycleOperatorError('argument_invalid');
    return value;
  };
  const selector = (key: string): string => {
    const value = required(key);
    if (!ID.test(value)) throw new SpeedLifecycleOperatorError('argument_invalid');
    return value;
  };
  const deploymentId = selector('--deployment-id');
  const expectedRelease = required('--expected-release');
  if (expectedRelease !== `railway:deployment:${deploymentId}`) throw new SpeedLifecycleOperatorError('activation_release_mismatch');
  const artifact = required('--expected-artifact');
  if (!GIT_ARTIFACT.test(artifact)) throw new SpeedLifecycleOperatorError('argument_invalid');
  const replicasText = required('--expected-replicas');
  const generationText = required('--expected-generation');
  if (!/^[1-9][0-9]*$/.test(replicasText) || !/^[1-9][0-9]*$/.test(generationText)) throw new SpeedLifecycleOperatorError('argument_invalid');
  const replicas = Number(replicasText);
  if (!Number.isSafeInteger(replicas)) throw new SpeedLifecycleOperatorError('argument_invalid');
  const phase = required('--expected-phase') as OperatorTarget['expectedPhase'];
  if (!['v1_open', 'closing_to_v2', 'v2_open', 'closing_to_v1', 'disabled'].includes(phase)) throw new SpeedLifecycleOperatorError('argument_invalid');
  const healthUrl = required('--health-url');
  let parsedHealth: URL;
  try { parsedHealth = new URL(healthUrl); } catch { throw new SpeedLifecycleOperatorError('argument_invalid'); }
  if (parsedHealth.protocol !== 'https:' || parsedHealth.username || parsedHealth.password || parsedHealth.port
    || (parsedHealth.pathname !== '' && parsedHealth.pathname !== '/') || parsedHealth.search || parsedHealth.hash
    || !ID.test(parsedHealth.hostname.replaceAll('.', '-'))) throw new SpeedLifecycleOperatorError('argument_invalid');
  return {
    command: command as 'verify' | OperatorOperation,
    apply,
    json: flags.has('--json'),
    target: {
      projectId: selector('--project-id'), environmentId: selector('--environment-id'), serviceId: selector('--service-id'), deploymentId,
      expectedArtifact: artifact.toLowerCase(), expectedReplicas: replicas, expectedPhase: phase,
      expectedGeneration: BigInt(generationText), healthUrl: parsedHealth.origin,
    },
    approvalRef: values.get('--approval-ref') ?? '',
    confirmation: values.get('--confirmation') ?? '',
    reason: values.get('--reason') ?? '',
  };
}
