import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
assert.equal(config.env?.API_RUNTIME_MODE, 'serverless');
assert.equal(config.env?.SPEED_1V1_QUEUE_ENABLED, 'false');
assert.equal(config.buildCommand, 'pnpm --filter @wordle-royale/api db:generate');
assert.equal(config.installCommand, 'pnpm install --frozen-lockfile');
assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/api' }]);
assert.equal(
  config.functions?.['api/index.ts']?.includeFiles,
  '{apps/api/prisma/**,node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**}',
);
assert.ok(existsSync(join(root, 'api/index.ts')));
assert.ok(existsSync(join(root, 'apps/api/api/index.ts')));
assert.ok(existsSync(join(root, 'apps/api/prisma/schema.prisma')));

for (const [command, args] of [
  ['pnpm', ['--filter', '@wordle-royale/api', 'db:generate']],
  ['pnpm', ['--filter', '@wordle-royale/api', 'run', 'typecheck']],
]) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe', env: process.env });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }
}

const pnpmStore = join(root, 'node_modules/.pnpm');
const prismaPackages = existsSync(pnpmStore)
  ? readdirSync(pnpmStore).filter((name) => name.startsWith('@prisma+client@'))
  : [];
assert.ok(prismaPackages.length > 0, 'generated @prisma/client package must exist');
assert.ok(prismaPackages.some((name) => existsSync(join(pnpmStore, name, 'node_modules/.prisma/client'))), 'generated .prisma client must exist');

console.log(JSON.stringify({ status: 'ok', rootConfig: true, handler: 'api/index.ts', prismaGenerated: true, typecheck: true }));
