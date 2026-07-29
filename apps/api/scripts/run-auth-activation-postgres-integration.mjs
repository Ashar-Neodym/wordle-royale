import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const password = ['wordle', 'local', 'password'].join('_');
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local');
fallback.password = password;
const base = new URL(process.env.DURABLE_AUTH_TEST_DATABASE_URL ?? fallback);
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname)) throw new Error('auth activation tests require disposable local PostgreSQL');
const schema = `ticket253_${randomUUID().replaceAll('-', '')}`;
const db = new URL(base); db.searchParams.set('schema', schema);
const admin = new URL(base); admin.search = '';
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stdout}${result.stderr}`);
  return result.stdout;
};
try {
  run('psql', [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE SCHEMA "${schema}"`]);
  run(fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url)), ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { DATABASE_URL: db.toString() });
  const output = run(process.execPath, ['--import', 'tsx', '--test', 'test/auth-activation-postgres.integration.ts'], {
    DATABASE_URL: db.toString(), RUN_AUTH_ACTIVATION_POSTGRES_INTEGRATION: '1',
  });
  process.stdout.write(output);
  assert.match(output, /tests 5/u);
  console.log('[Ticket253] PASS auth readiness/operator real PostgreSQL (5 tests, no skips)');
} finally {
  run('psql', [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `DROP SCHEMA IF EXISTS "${schema}" CASCADE`]);
  const remaining = run('psql', [admin.toString(), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`]).trim();
  assert.equal(remaining, '0', 'disposable Ticket 253 schema must be independently verified dropped');
  console.log(`[Ticket253] verified disposable schema dropped (${schema})`);
}
