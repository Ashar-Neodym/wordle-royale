import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const password = ['wordle', 'local', 'password'].join('_');
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local'); fallback.password = password;
const base = new URL(process.env.DURABLE_AUTH_TEST_DATABASE_URL ?? fallback);
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname)) throw new Error('durable auth HTTP tests require disposable local PostgreSQL');
const schema = `ticket245_${randomUUID().replaceAll('-', '')}`;
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
  const env = {
    DATABASE_URL: db.toString(), NODE_ENV: 'test', APP_ENV: 'test', AUTH_MODE: 'session_required',
    DURABLE_AUTH_ENABLED: 'true', AUTH_RATE_LIMIT_KEY: randomBytes(32).toString('base64url'),
    ACCOUNT_SESSION_TTL_SECONDS: '3600', ACCOUNT_SESSION_LAST_SEEN_INTERVAL_SECONDS: '300',
    PUBLIC_WEB_URL: 'https://web.example.test', COOKIE_SECURE: 'false', ENABLE_DEV_AUTH: 'false', ENABLE_DEV_ROUTES: 'false',
  };
  const output = run(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'test/durable-auth-http-postgres.integration.ts'], env);
  process.stdout.write(output);
  assert.match(output, /tests 6/u); assert.match(output, /skipped 0/u);
  console.log('[Ticket245] PASS durable auth real Nest HTTP/PostgreSQL (6 tests, no skips)');
} finally {
  run('psql', [admin.toString(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `DROP SCHEMA IF EXISTS "${schema}" CASCADE`]);
}
