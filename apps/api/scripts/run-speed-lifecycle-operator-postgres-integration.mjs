import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const localPassword = ['wordle', 'local', 'password'].join('_');
const fallback = new URL('postgresql://wordle@localhost:5432/wordle_royale_local');
fallback.password = localPassword;
fallback.searchParams.set('schema', 'public');
const baseDatabaseUrl = process.env.SPEED_OPERATOR_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? fallback.toString();
const iterations = Number.parseInt(process.env.SPEED_OPERATOR_ITERATIONS ?? '1', 10);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 25) throw new Error('SPEED_OPERATOR_ITERATIONS must be an integer from 1 through 25.');

const databaseUrlForSchema = (schema) => {
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('application_name', `ticket195_${schema}`.slice(0, 63));
  return url.toString();
};
const run = (command, args, env) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status ?? 'unknown'}.`);
};

const admin = new PrismaClient({ datasources: { db: { url: databaseUrlForSchema('public') } } });
let exitCode = 0;
try {
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const schemaName = `ticket195_${process.pid}_${Date.now()}_${iteration}`;
    if (!/^ticket195_[0-9]+_[0-9]+_[0-9]+$/.test(schemaName)) throw new Error('Unsafe schema name.');
    const databaseUrl = databaseUrlForSchema(schemaName);
    console.log(`Ticket 195 operator integration iteration ${iteration}/${iterations}: ${schemaName}`);
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
      run('pnpm', ['db:migrate:deploy'], { DATABASE_URL: databaseUrl });
      run('pnpm', ['db:generate'], { DATABASE_URL: databaseUrl });
      run('pnpm', ['db:seed:local'], { DATABASE_URL: databaseUrl });
      run('pnpm', ['exec', 'node', '--import', 'tsx', '--test', 'test/speed-lifecycle-operator-postgres.integration.test.ts'], {
        APP_ENV: 'test', AUTH_MODE: 'dev_stub', DATABASE_URL: databaseUrl,
        ENABLE_DEV_AUTH: 'true', ENABLE_DEV_ROUTES: 'true', NODE_ENV: 'test',
        RUN_SPEED_LIFECYCLE_OPERATOR_POSTGRES_INTEGRATION: '1',
        STANDARD_1V1_QUEUE_ENABLED: 'true', SPEED_1V1_QUEUE_ENABLED: 'true',
      });
    } finally {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      console.log(`Dropped Ticket 195 operator schema: ${schemaName}`);
    }
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : 'Ticket 195 operator integration failed.');
} finally {
  await admin.$disconnect();
}
process.exitCode = exitCode;
