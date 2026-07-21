import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const localPassword = ['wordle', 'local', 'password'].join('_');
const baseDatabaseUrl = process.env.SPEED_SCHEMA_READINESS_TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? `postgresql://wordle:${localPassword}@localhost:5432/wordle_royale_local?schema=public`;
const suffix = `${process.pid}_${Date.now()}`;
const schemaName = `ticket184_${suffix}`;
const decoySchemaName = `ticket184_decoy_${suffix}`;
const databaseUrlForSchema = (schema) => {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
};
const run = (command, args, env) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
};

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public') } } });
const schemaDatabaseUrl = databaseUrlForSchema(schemaName);
const decoyDatabaseUrl = databaseUrlForSchema(decoySchemaName);
let exitCode = 0;

console.log(`Ticket 184 PostgreSQL readiness schemas: ${schemaName}, ${decoySchemaName}`);
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${decoySchemaName}"`);
  run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: schemaDatabaseUrl });
  run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: decoyDatabaseUrl });
  run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/speed-schema-readiness-postgres.integration.test.ts'], {
    APP_ENV: 'test',
    DATABASE_URL: schemaDatabaseUrl,
    NODE_ENV: 'test',
    RUN_SPEED_SCHEMA_READINESS_POSTGRES_INTEGRATION: '1',
    SPEED_SCHEMA_READINESS_SCHEMA: schemaName,
    SPEED_SCHEMA_READINESS_DECOY_SCHEMA: decoySchemaName,
  });
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  for (const disposableSchema of [schemaName, decoySchemaName]) {
    try {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${disposableSchema}" CASCADE`);
      console.log(`Dropped Ticket 184 PostgreSQL readiness schema: ${disposableSchema}`);
    } catch (error) {
      exitCode = 1;
      console.error(`Failed to drop Ticket 184 schema ${disposableSchema}.`);
      console.error(error instanceof Error ? error.message : error);
    }
  }
  await admin.$disconnect();
}
process.exitCode = exitCode;
