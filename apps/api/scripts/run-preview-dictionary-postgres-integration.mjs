import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const PREVIEW_DICTIONARY_CONFIRMATION = 'APPLY_EN_5_TEST_VFIXTURE_001_TO_PREVIEW';

const baseDatabaseUrl = process.env.PREVIEW_DICTIONARY_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseDatabaseUrl) {
  throw new Error('Set PREVIEW_DICTIONARY_TEST_DATABASE_URL (or DATABASE_URL) to a disposable local PostgreSQL database.');
}
const schemaName = `ticket135_${process.pid}_${Date.now()}`;

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
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
}

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public') } } });
const schemaDatabaseUrl = databaseUrlForSchema(schemaName);
let exitCode = 0;
console.log(`Ticket 135 PostgreSQL integration schema: ${schemaName}`);

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/preview-dictionary-postgres.integration.test.ts'], {
    APP_ENV: 'preview',
    DATABASE_URL: schemaDatabaseUrl,
    MATCHMAKING_TRANSACTION_TIMEOUT_MS: '6000',
    NODE_ENV: 'test',
    PREVIEW_DICTIONARY_BOOTSTRAP_CONFIRM: PREVIEW_DICTIONARY_CONFIRMATION,
    RUN_PREVIEW_DICTIONARY_POSTGRES_INTEGRATION: '1',
    STANDARD_1V1_QUEUE_ENABLED: 'true',
  });
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    console.log(`Dropped Ticket 135 PostgreSQL integration schema: ${schemaName}`);
  } catch {
    exitCode = 1;
    console.error('Failed to drop the Ticket 135 integration schema.');
  }
  await admin.$disconnect();
}
process.exitCode = exitCode;
