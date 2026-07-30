import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const fallback = new URL('postgresql://wordle@127.0.0.1:5432/wordle_royale_local');
fallback.password = ['wordle','local','password'].join('_');
const base = new URL(process.env.DURABLE_AUTH_TEST_DATABASE_URL ?? fallback);
if (!['localhost','127.0.0.1','::1'].includes(base.hostname)) throw new Error('Ticket 267 requires disposable local PostgreSQL');
const schema = `ticket267_${randomUUID().replaceAll('-','')}`;
const database = new URL(base); database.searchParams.set('schema', schema);
const admin = new URL(base); admin.search = '';
const run = (command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stdout}${result.stderr}`);
  return result.stdout;
};
let created = false;
try {
  assert.equal(run('psql',[admin.toString(),'-X','-A','-t','-v','ON_ERROR_STOP=1','-c','SELECT 1']).trim(),'1');
  run('psql',[admin.toString(),'-X','-v','ON_ERROR_STOP=1','-c',`CREATE SCHEMA "${schema}"`]);
  created = true;
  run(fileURLToPath(new URL('../node_modules/.bin/prisma',import.meta.url)),['migrate','deploy','--schema','prisma/schema.prisma'],{DATABASE_URL:database.toString()});
  const migrations = run('psql',[admin.toString(),'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`]).trim();
  assert.equal(migrations,'9','all nine migrations must be applied');
  const output = run(process.execPath,['--import','tsx','--test','--test-concurrency=1','test/preflight-complete-fingerprint-postgres.integration.ts'],{DATABASE_URL:database.toString(),RUN_PREFLIGHT_FINGERPRINT_POSTGRES:'1'});
  process.stdout.write(output);
  assert.match(output,/tests 6/u); assert.match(output,/pass 6/u); assert.match(output,/fail 0/u); assert.equal(output.includes('# SKIP'),false);
  console.log('[Ticket267] PASS exact PostgreSQL type/typmod/enum manifest; bounded 4096-row chunks; fixed 10000000-row/table ceiling; 25-model update matrix; scale/cardinality negatives; 9 migrations; no skips');
} finally {
  if (created) run('psql',[admin.toString(),'-X','-v','ON_ERROR_STOP=1','-c',`DROP SCHEMA IF EXISTS "${schema}" CASCADE`]);
  const remaining = run('psql',[admin.toString(),'-X','-A','-t','-v','ON_ERROR_STOP=1','-c',`SELECT count(*) FROM pg_namespace WHERE nspname='${schema}'`]).trim();
  assert.equal(remaining,'0','Ticket 267 disposable schema cleanup must be independently verified');
  console.log(`[Ticket267] cleanup verified schemaAbsent=1 schema=${schema}`);
}
