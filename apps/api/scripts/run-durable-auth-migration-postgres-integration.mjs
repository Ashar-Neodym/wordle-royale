import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const migrationsRoot = fileURLToPath(new URL('../prisma/migrations', import.meta.url));
const prismaBin = fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url));
const latestMigration = '20260728000000_durable_auth_foundations';
const password = ['wordle', 'local', 'password'].join('_');
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local');
fallback.password = password;
const baseUrl = new URL(process.env.DURABLE_AUTH_MIGRATION_TEST_DATABASE_URL ?? fallback.toString());

if (!['postgresql:', 'postgres:'].includes(baseUrl.protocol) || !['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) {
  throw new Error('DURABLE_AUTH_MIGRATION_TEST_DATABASE_URL must target local PostgreSQL (localhost, 127.0.0.1, or ::1).');
}

const migrationNames = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.ok(migrationNames.includes(latestMigration), 'durable auth foundations migration must exist');
const legacyMigrations = migrationNames.filter((name) => name < latestMigration);

function schemaUrl(schema) {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('application_name', `ticket243_${schema}`.slice(0, 63));
  return url.toString();
}

function psqlUrl() {
  const url = new URL(baseUrl);
  url.search = '';
  return url.toString();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    input: options.input,
    stdio: options.input === undefined ? 'pipe' : ['pipe', 'pipe', 'pipe'],
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `${command} unexpectedly succeeded`);
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function sql(schema, statement) {
  return run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], {
    env: { PGOPTIONS: `-c search_path=${schema}` },
  });
}

function applyLegacy(schema) {
  for (const name of legacyMigrations) {
    run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', `${migrationsRoot}/${name}/migration.sql`], {
      env: { PGOPTIONS: `-c search_path=${schema}` },
    });
    run(prismaBin, ['migrate', 'resolve', '--applied', name, '--schema', 'prisma/schema.prisma'], {
      env: { DATABASE_URL: schemaUrl(schema) },
    });
  }
}

function deploy(schema, expectFailure = false) {
  return run(prismaBin, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { env: { DATABASE_URL: schemaUrl(schema) }, expectFailure });
}

function assertNoLatestArtifacts(schema) {
  assert.equal(sql(schema, `SELECT concat_ws('|', to_regclass('"PasswordCredential"'), to_regclass('"AccountSession"'), to_regclass('"UserAccount_email_normalized_key"'))`), '');
  assert.equal(sql(schema, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.proname LIKE 'durable_auth_%'`), '0');
}

async function scenario(label, body) {
  const schema = `ticket243_${label}_${process.pid}_${Date.now()}_${randomUUID().slice(0, 8).replaceAll('-', '')}`;
  assert.match(schema, /^ticket243_[a-z]+_[0-9]+_[0-9]+_[a-f0-9]+$/u);
  sql('public', `CREATE SCHEMA "${schema}"`);
  console.log(`\n[Ticket243] ${label}: ${schema}`);
  try {
    await body(schema);
    console.log(`[Ticket243] PASS ${label}`);
  } finally {
    sql('public', `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    assert.equal(sql('public', `SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`), '0');
    console.log(`[Ticket243] DROP ${label}`);
  }
}

await scenario('fresh', async (schema) => {
  deploy(schema);
  assert.equal(sql(schema, `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`), String(migrationNames.length));
  assert.equal(sql(schema, `SELECT concat_ws('|',to_regclass('"PasswordCredential"') IS NOT NULL,to_regclass('"AccountSession"') IS NOT NULL)`), 't|t');
});

await scenario('legacy', async (schema) => {
  applyLegacy(schema);
  sql(schema, `
    INSERT INTO "UserAccount" (id,email,"displayName","updatedAt") VALUES
      ('demo-null',NULL,'Demo Null',now()),
      ('canonical','  Demo.User@Example.COM  ','Canonical',now()),
      ('cascade','cascade@example.com','Cascade',now());
    INSERT INTO "UserProfile" (id,"userId","publicHandle","updatedAt") VALUES ('profile','demo-null','demo_null',now());
    INSERT INTO "RatingProfile" (id,"userId",mode,rating,"algorithmConfigVersion","updatedAt")
      VALUES ('rating','demo-null','standard_1v1',1500,'ticket243',now());
    INSERT INTO "DictionaryRelease" (id,locale,version,status,"sourceLabel","updatedAt") VALUES ('dict','en','ticket243','active','integration',now());
    INSERT INTO "Lobby" (id,code,"hostUserId",status,visibility,mode,"updatedAt") VALUES ('lobby','T243LG','demo-null','waiting','private','casual',now());
    INSERT INTO "Match" (id,"lobbyId","dictionaryReleaseId",mode,status,"idempotencyKey","updatedAt") VALUES ('match','lobby','dict','casual','pending','ticket243-match',now());
  `);
  const before = sql(schema, `SELECT concat_ws('|',(SELECT count(*) FROM "UserProfile"),(SELECT count(*) FROM "RatingProfile"),(SELECT count(*) FROM "Match"),(SELECT count(*) FROM "Lobby"))`);
  assert.equal(before, '1|1|1|1');
  deploy(schema);
  assert.equal(sql(schema, `SELECT email FROM "UserAccount" WHERE id='canonical'`), 'demo.user@example.com');
  assert.equal(sql(schema, `SELECT concat_ws('|',(SELECT count(*) FROM "UserProfile"),(SELECT count(*) FROM "RatingProfile"),(SELECT count(*) FROM "Match"),(SELECT count(*) FROM "Lobby"))`), before);
  assert.equal(sql(schema, `SELECT email IS NULL FROM "UserAccount" WHERE id='demo-null'`), 't');

  const hash = 'x'.repeat(80);
  sql(schema, `INSERT INTO "PasswordCredential" ("userId","passwordHash","updatedAt") VALUES ('cascade','${hash}',now()); INSERT INTO "AccountSession" (id,"userId","tokenHash","expiresAt") VALUES ('session','cascade','${'a'.repeat(64)}',now()+interval '1 hour')`);
  assert.match(run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `INSERT INTO "PasswordCredential" ("userId","passwordHash","updatedAt") VALUES ('demo-null','x',now())`], { env: { PGOPTIONS: `-c search_path=${schema}` }, expectFailure: true }), /credential requires account email/u);
  assert.match(run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE "UserAccount" SET email=NULL WHERE id='cascade'`], { env: { PGOPTIONS: `-c search_path=${schema}` }, expectFailure: true }), /credential requires account email/u);
  assert.match(run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-c', `INSERT INTO "AccountSession" (id,"userId","tokenHash","expiresAt") VALUES ('bad','missing','${'b'.repeat(64)}',now())`], { env: { PGOPTIONS: `-c search_path=${schema}` }, expectFailure: true }), /foreign key/u);
  sql(schema, `DELETE FROM "UserAccount" WHERE id='cascade'`);
  assert.equal(sql(schema, `SELECT concat_ws('|',(SELECT count(*) FROM "PasswordCredential" WHERE "userId"='cascade'),(SELECT count(*) FROM "AccountSession" WHERE "userId"='cascade'))`), '0|0');
});

await scenario('collision', async (schema) => {
  applyLegacy(schema);
  sql(schema, `INSERT INTO "UserAccount" (id,email,"displayName","updatedAt") VALUES ('a',' Alice@Example.com ','A',now()),('b','alice@example.com','B',now())`);
  const output = deploy(schema, true);
  assert.match(output, /canonical email collision/u);
  assert.equal(sql(schema, `SELECT string_agg('['||email||']','|' ORDER BY id) FROM "UserAccount"`), '[ Alice@Example.com ]|[alice@example.com]');
  assertNoLatestArtifacts(schema);
});

await scenario('malformed', async (schema) => {
  applyLegacy(schema);
  sql(schema, `INSERT INTO "UserAccount" (id,email,"displayName","updatedAt") VALUES ('bad','not-an-email','Bad',now()),('nonascii','élise@example.com','Non ASCII',now())`);
  const output = deploy(schema, true);
  assert.match(output, /legacy email requires canonical remediation/u);
  assert.equal(sql(schema, `SELECT string_agg(email,'|' ORDER BY id) FROM "UserAccount"`), 'not-an-email|élise@example.com');
  assertNoLatestArtifacts(schema);
});

await scenario('atomicrollback', async (schema) => {
  applyLegacy(schema);
  sql(schema, `INSERT INTO "UserAccount" (id,email,"displayName","updatedAt") VALUES ('late',' Mixed@Example.COM ','Late failure',now())`);
  sql(schema, `CREATE TABLE "PasswordCredential" ("sentinel" TEXT)`);
  const output = deploy(schema, true);
  assert.match(output, /current transaction is aborted|relation "PasswordCredential" already exists/u);
  assert.equal(sql(schema, `SELECT '['||email||']' FROM "UserAccount" WHERE id='late'`), '[ Mixed@Example.COM ]');
  assert.equal(sql(schema, `SELECT to_regclass('"UserAccount_email_normalized_key"') IS NULL`), 't');
  assert.equal(sql(schema, `SELECT to_regclass('"AccountSession"') IS NULL`), 't');
  assert.equal(sql(schema, `SELECT to_regprocedure('durable_auth_credential_requires_email()') IS NULL`), 't');
});

await scenario('limiterrollback', async (schema) => {
  applyLegacy(schema);
  run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1', '-f', `${migrationsRoot}/${latestMigration}/migration.sql`], {
    env: { PGOPTIONS: `-c search_path=${schema}` },
  });
  const limiterSql = readFileSync(`${migrationsRoot}/20260728010000_auth_rate_limit_bucket/migration.sql`, 'utf8')
    .replace(/COMMIT;\s*$/u, 'SELECT 1/0;\nCOMMIT;');
  const failure = run('psql', [psqlUrl(), '-X', '-v', 'ON_ERROR_STOP=1'], {
    env: { PGOPTIONS: `-c search_path=${schema}` }, input: limiterSql, expectFailure: true,
  });
  assert.match(failure, /division by zero/u);
  assert.equal(sql(schema, `SELECT to_regclass('"AuthRateLimitBucket"') IS NULL`), 't');
  assert.equal(sql(schema, `SELECT to_regclass('"AuthRateLimitBucket_windowStartedAt_idx"') IS NULL`), 't');
});

console.log(`\n[Ticket243/244] PASS all ${6} PostgreSQL migration scenarios (no skips)`);
