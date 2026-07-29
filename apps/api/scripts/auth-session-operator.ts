import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { envFlagEnabled } from '../src/config/runtime-config.ts';
import { publicDeploymentRevision } from '../src/shared/deployment-revision.ts';

export type AuthSessionOperatorCommand = 'cleanup' | 'revoke-all';
export type AuthSessionOperatorInput = { command: AuthSessionOperatorCommand; apply: boolean; json: boolean; expectedRevision: string; reason: string; maxSessions: number; retentionDays?: number };
export class AuthSessionOperatorError extends Error { constructor(readonly code: string) { super(code); } }
type AuthSessionTransaction = Pick<PrismaClient, '$executeRawUnsafe' | 'accountSession'>;

export function parseAuthSessionOperatorArgs(raw: string[]): AuthSessionOperatorInput {
  const argv = raw[0] === '--' ? raw.slice(1) : raw;
  const command = argv[0] as AuthSessionOperatorCommand;
  if (command !== 'cleanup' && command !== 'revoke-all') throw new AuthSessionOperatorError('command_unsupported');
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const allowed = new Set(['--expected-revision', '--reason', '--max-sessions', '--retention-days']);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i]!;
    if (key === '--apply' || key === '--json') {
      if (flags.has(key)) throw new AuthSessionOperatorError('argument_invalid');
      flags.add(key);
    } else {
      if (!allowed.has(key) || values.has(key) || i + 1 >= argv.length || argv[i + 1]!.startsWith('--')) throw new AuthSessionOperatorError('argument_invalid');
      values.set(key, argv[++i]!);
    }
  }
  const required = (key: string) => {
    const value = values.get(key);
    if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw new AuthSessionOperatorError('argument_invalid');
    return value;
  };
  const expectedRevision = required('--expected-revision').toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(expectedRevision)) throw new AuthSessionOperatorError('revision_invalid');
  const maxText = required('--max-sessions');
  if (!/^[1-9][0-9]{0,4}$/u.test(maxText) || Number(maxText) > 10_000) throw new AuthSessionOperatorError('bound_invalid');
  const maxSessions = Number(maxText);
  const apply = flags.has('--apply');
  const reason = values.get('--reason') ?? '';
  if (apply && (reason.length < 1 || reason.length > 160 || reason !== reason.trim() || /[\u0000-\u001f\u007f]/u.test(reason))) throw new AuthSessionOperatorError('reason_invalid');
  if (!apply && values.has('--reason')) throw new AuthSessionOperatorError('argument_invalid');
  let retentionDays: number | undefined;
  if (command === 'cleanup') {
    const text = required('--retention-days');
    if (!/^[1-9][0-9]{0,2}$/u.test(text) || Number(text) > 365) throw new AuthSessionOperatorError('retention_invalid');
    retentionDays = Number(text);
  } else if (values.has('--retention-days')) throw new AuthSessionOperatorError('argument_invalid');
  return { command, apply, json: flags.has('--json'), expectedRevision, reason, maxSessions, ...(retentionDays ? { retentionDays } : {}) };
}

function assertEnvironment(expectedRevision: string): void {
  if (process.env.NODE_ENV !== 'production' || process.env.APP_ENV !== 'production' || process.env.AUTH_MODE !== 'session_required'
    || !envFlagEnabled(process.env.DURABLE_AUTH_ENABLED, false) || process.env.EXPECTED_API_REPLICA_COUNT !== '1') throw new AuthSessionOperatorError('environment_refused');
  const actual = publicDeploymentRevision();
  if (actual === 'unavailable' || actual === 'development' || actual !== expectedRevision) throw new AuthSessionOperatorError('revision_mismatch');
  if (!process.env.DATABASE_URL) throw new AuthSessionOperatorError('environment_refused');
}

function receiptId(input: AuthSessionOperatorInput): string {
  return `authop_${createHash('sha256').update(JSON.stringify({ operation: input.command, revision: input.expectedRevision, reason: input.reason, bound: input.maxSessions, retentionDays: input.retentionDays ?? null })).digest('hex').slice(0, 24)}`;
}

const cleanupWhere = (cutoff: Date) => ({
  OR: [
    { revokedAt: { not: null, lt: cutoff } },
    { revokedAt: null, expiresAt: { lt: cutoff } },
  ],
});

export async function runAuthSessionOperator(input: AuthSessionOperatorInput, db: PrismaClient, now = new Date()): Promise<Record<string, unknown>> {
  assertEnvironment(input.expectedRevision);
  const cutoff = input.retentionDays == null ? undefined : new Date(now.getTime() - input.retentionDays * 86_400_000);
  const where = input.command === 'cleanup' ? cleanupWhere(cutoff!) : { revokedAt: null, expiresAt: { gt: now } };

  if (!input.apply) {
    const candidateCount = await db.accountSession.count({ where });
    return {
      result: 'PASS', mode: 'dry-run', operation: input.command,
      candidateCount: input.command === 'cleanup' ? Math.min(candidateCount, input.maxSessions) : candidateCount,
      ...(input.command === 'cleanup' ? { remainingCandidateCount: Math.max(0, candidateCount - input.maxSessions) } : {}),
      maxSessions: input.maxSessions, revision: input.expectedRevision,
      ...(input.command === 'revoke-all' && candidateCount > input.maxSessions ? { withinBound: false } : { withinBound: true }),
    };
  }

  let affectedCount: number;
  try {
    affectedCount = await db.$transaction(async (tx: AuthSessionTransaction) => {
      // Prevent an INSERT/UPDATE snapshot race while establishing the bounded set. PostgreSQL
      // writers take ROW EXCLUSIVE, which conflicts with SHARE ROW EXCLUSIVE until commit.
      await tx.$executeRawUnsafe('LOCK TABLE "AccountSession" IN SHARE ROW EXCLUSIVE MODE');
      const candidates = await tx.accountSession.findMany({
        where, select: { id: true }, take: input.maxSessions + (input.command === 'revoke-all' ? 1 : 0),
        orderBy: input.command === 'revoke-all'
          ? [{ id: 'asc' }]
          : [{ revokedAt: 'asc' }, { expiresAt: 'asc' }, { id: 'asc' }],
      });
      if (input.command === 'revoke-all' && candidates.length > input.maxSessions) throw new AuthSessionOperatorError('bound_exceeded');
      if (candidates.length === 0) return 0;
      const ids = candidates.map(({ id }: { id: string }) => id);
      const result = input.command === 'revoke-all'
        ? await tx.accountSession.updateMany({ where: { id: { in: ids }, ...where }, data: { revokedAt: now, revocationReason: 'operator_revoke_all' } })
        : await tx.accountSession.deleteMany({ where: { id: { in: ids }, ...where } });
      if (result.count > input.maxSessions || result.count > ids.length) throw new AuthSessionOperatorError('bound_exceeded');
      if (input.command === 'revoke-all' && await tx.accountSession.count({ where }) !== 0) throw new AuthSessionOperatorError('operator_failed');
      return result.count;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof AuthSessionOperatorError) throw error;
    throw new AuthSessionOperatorError('operator_failed');
  }
  return { result: 'PASS', mode: 'apply', operation: input.command, affectedCount, maxSessions: input.maxSessions, revision: input.expectedRevision, receiptId: receiptId(input) };
}

async function main(): Promise<void> {
  let db: PrismaClient | undefined;
  try {
    const input = parseAuthSessionOperatorArgs(process.argv.slice(2));
    db = new PrismaClient();
    const result = await runAuthSessionOperator(input, db);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ result: 'FAIL', failureCode: error instanceof AuthSessionOperatorError ? error.code : 'operator_failed' })}\n`);
    process.exitCode = 1;
  } finally { await db?.$disconnect(); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
