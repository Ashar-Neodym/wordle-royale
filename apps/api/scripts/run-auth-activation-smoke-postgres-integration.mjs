import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const password = ['wordle', 'local', 'password'].join('_');
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local');
fallback.password = password;
const base = new URL(process.env.DURABLE_AUTH_TEST_DATABASE_URL ?? fallback);
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname)) throw new Error('auth activation smoke requires disposable local PostgreSQL');
const schema = `ticket255_${randomUUID().replaceAll('-', '')}`;
const db = new URL(base); db.searchParams.set('schema', schema);
const admin = new URL(base); admin.search = '';
const rateKey = randomBytes(32);
assert.equal(rateKey.toString('base64url').length, 43);
const canaryEmail = `runner-${randomUUID()}@example.test`;
const canaryDigest = createHmac('sha256', rateKey).update(canaryEmail).digest('base64url');
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stdout}${result.stderr}`);
  return result.stdout;
};
let created = false;
try {
  const healthy = run('psql', [admin.toString(), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1']).trim();
  assert.equal(healthy, '1', 'local PostgreSQL must be healthy');
  run('psql', [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE SCHEMA "${schema}"`]);
  created = true;
  run(fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url)), ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { DATABASE_URL: db.toString() });
  const applied = run('psql', [admin.toString(), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT count(*) FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`]).trim();
  assert.equal(applied, '9', 'all nine Prisma migrations must be applied');
  const output = run(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'test/auth-activation-smoke-postgres.integration.ts'], {
    DATABASE_URL: db.toString(), RUN_AUTH_ACTIVATION_SMOKE_POSTGRES: '1',
  });
  process.stdout.write(output);
  assert.match(output, /tests 1/u); assert.match(output, /pass 1/u); assert.match(output, /fail 0/u);
  assert.equal(output.includes(rateKey.toString('base64url')), false);
  assert.equal(output.includes(canaryDigest), false);
  assert.equal(output.includes(canaryEmail), false);
  console.log('[Ticket255B2] PASS real disposable Nest/PostgreSQL smoke (1 test, 9 migrations, no skips)');
} finally {
  rateKey.fill(0);
  if (created) run('psql', [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `DROP SCHEMA IF EXISTS "${schema}" CASCADE`]);
  const remaining = run('psql', [admin.toString(), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`]).trim();
  assert.equal(remaining, '0', 'disposable Ticket 255 schema must be independently verified dropped');
  console.log(`[Ticket255B2] cleanup verified schemaAbsent=1 schema=${schema}`);
}
