import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const localPassword = ['wordle', 'local', 'password'].join('_');
const baseDatabaseUrl = process.env.SPEED_ACTIVATION_TEST_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? `postgresql://wordle:${localPassword}@localhost:5432/wordle_royale_local?schema=public`;
const iterations = Number.parseInt(process.env.SPEED_ACTIVATION_ITERATIONS ?? '10', 10);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 25) throw new Error('SPEED_ACTIVATION_ITERATIONS must be an integer from 1 through 25.');

const databaseUrlForSchema = (schema) => {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('application_name', `ticket187_${schema}`.slice(0, 63));
  return url.toString();
};
const run = (command, args, env) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
};

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public') } } });
let exitCode = 0;
try {
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const schemaName = `ticket187_${process.pid}_${Date.now()}_${iteration}`;
    const schemaDatabaseUrl = databaseUrlForSchema(schemaName);
    console.log(`Ticket 187 mixed-version activation iteration ${iteration}/${iterations}: ${schemaName}`);
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
      run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: schemaDatabaseUrl });
      run('pnpm', ['db:seed:local'], { DATABASE_URL: schemaDatabaseUrl });
      run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/speed-lifecycle-activation-postgres.integration.test.ts'], {
        APP_ENV: 'test', AUTH_MODE: 'dev_stub', DATABASE_URL: schemaDatabaseUrl,
        ENABLE_DEV_AUTH: 'true', ENABLE_DEV_ROUTES: 'true', NODE_ENV: 'test',
        RUN_SPEED_LIFECYCLE_ACTIVATION_POSTGRES_INTEGRATION: '1',
        SPEED_LIFECYCLE_RELEASE_ID: 'ticket187-compatible-release',
        STANDARD_1V1_QUEUE_ENABLED: 'true', SPEED_1V1_QUEUE_ENABLED: 'true',
      });
    } finally {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      console.log(`Dropped Ticket 187 PostgreSQL activation schema: ${schemaName}`);
    }
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
} finally {
  await admin.$disconnect();
}
process.exitCode = exitCode;
