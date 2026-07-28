import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const localPassword = ['wordle', 'local', 'password'].join('_');
const baseDatabaseUrl = process.env.SPEED_TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? `postgresql://wordle:${encodeURIComponent(localPassword)}@localhost:5432/wordle_royale_local?schema=public`;
const schemaName = `ticket221_${process.pid}_${Date.now()}`;
const databaseUrlForSchema = (schema, applicationName) => {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('application_name', applicationName);
  url.searchParams.set('connection_limit', '10');
  return url.toString();
};
const run = (command, args, env) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
};

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public', 'ticket221_admin') } } });
const schemaDatabaseUrl = databaseUrlForSchema(schemaName, 'ticket221_app');
let exitCode = 0;
console.log(`Ticket 221 hosted-ready latency PostgreSQL schema: ${schemaName}`);
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['db:seed:local'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/speed-ready-hosted-latency-postgres.integration.test.ts'], {
    APP_ENV: 'test', AUTH_MODE: 'dev_stub', DATABASE_URL: schemaDatabaseUrl,
    ENABLE_DEV_AUTH: 'true', ENABLE_DEV_ROUTES: 'true', NODE_ENV: 'test',
    RUN_SPEED_READY_HOSTED_LATENCY_POSTGRES_INTEGRATION: '1', RUN_SPEED_TIMING_POSTGRES_INTEGRATION: '1',
    SPEED_READY_HOSTED_LATENCY_EXPECT: process.env.SPEED_READY_HOSTED_LATENCY_EXPECT ?? 'green',
    SPEED_READY_HOSTED_LATENCY_FROZEN_MS: process.env.SPEED_READY_HOSTED_LATENCY_FROZEN_MS ?? '300',
    STANDARD_1V1_QUEUE_ENABLED: 'true', SPEED_1V1_QUEUE_ENABLED: 'true',
  });
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    console.log(`Dropped Ticket 221 hosted-ready latency schema: ${schemaName}`);
  } catch (error) {
    exitCode = 1;
    console.error(error instanceof Error ? error.message : error);
  }
  await admin.$disconnect();
}
process.exitCode = exitCode;
