import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const baseDatabaseUrl = process.env.MATCHMAKING_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseDatabaseUrl) {
  throw new Error('Set MATCHMAKING_TEST_DATABASE_URL (or DATABASE_URL) to a disposable local PostgreSQL database.');
}
const schemaName = `ticket130_${process.pid}_${Date.now()}`;

function databaseUrlForSchema(schema) {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public') } } });
const schemaDatabaseUrl = databaseUrlForSchema(schemaName);
let exitCode = 0;

console.log(`Ticket 130 PostgreSQL integration schema: ${schemaName}`);

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['db:seed:local'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/matchmaking-postgres.integration.test.ts'], {
    APP_ENV: 'test',
    AUTH_MODE: 'dev_stub',
    DATABASE_URL: schemaDatabaseUrl,
    ENABLE_DEV_AUTH: 'true',
    ENABLE_DEV_ROUTES: 'true',
    NODE_ENV: 'test',
    RUN_MATCHMAKING_POSTGRES_INTEGRATION: '1',
    STANDARD_1V1_QUEUE_ENABLED: 'true',
  });
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    console.log(`Dropped Ticket 130 PostgreSQL integration schema: ${schemaName}`);
  } catch (cleanupError) {
    exitCode = 1;
    console.error('Failed to drop the Ticket 130 integration schema.');
    console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);
  }
  await admin.$disconnect();
}

process.exitCode = exitCode;
