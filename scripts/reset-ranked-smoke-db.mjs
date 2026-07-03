#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolveComposeEnv } from './docker-compose-env.mjs';

const DEFAULT_LOCAL_DATABASE_URL = 'postgresql://wordle:wordle_local_password@localhost:5432/wordle_royale_local?schema=public';
const databaseUrl = process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;
const composeResolution = resolveComposeEnv();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertLocalDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail('Refusing ranked smoke reset: DATABASE_URL is not a valid URL.');
  }

  const productionLikeEnv = [process.env.NODE_ENV, process.env.APP_ENV, process.env.VERCEL_ENV]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (productionLikeEnv.some((value) => ['prod', 'production', 'preview', 'staging'].includes(value))) {
    fail(`Refusing ranked smoke reset: production-like environment detected (${productionLikeEnv.join(', ')}).`);
  }

  const host = parsed.hostname.toLowerCase();
  const databaseName = parsed.pathname.replace(/^\//, '');
  const username = decodeURIComponent(parsed.username);
  const port = parsed.port || '5432';

  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!allowedHosts.has(host)) {
    fail(`Refusing ranked smoke reset: host must be local, got ${host}.`);
  }

  if (port !== '5432') {
    fail(`Refusing ranked smoke reset: port must be local Compose PostgreSQL 5432, got ${port}.`);
  }

  if (username !== 'wordle') {
    fail(`Refusing ranked smoke reset: database user must be local Compose user wordle, got ${username || '<empty>'}.`);
  }

  if (databaseName !== 'wordle_royale_local') {
    fail(`Refusing ranked smoke reset: database name must be wordle_royale_local, got ${databaseName || '<empty>'}.`);
  }

  if (parsed.searchParams.get('sslmode') === 'require') {
    fail('Refusing ranked smoke reset: sslmode=require looks like a remote/shared database URL.');
  }
}

function localEnv(baseEnv = process.env) {
  return { ...baseEnv, DATABASE_URL: databaseUrl, APP_ENV: process.env.APP_ENV || 'local' };
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: localEnv(),
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDockerCompose(args, options = {}) {
  return spawnSync('docker', ['compose', ...args], {
    stdio: options.stdio ?? 'pipe',
    env: localEnv(composeResolution.env),
    ...options,
  });
}

function combined(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function assertDockerComposeAvailable() {
  if (composeResolution.ok) return;

  const lastAttempt = composeResolution.attempts.at(-1);
  const text = lastAttempt ? combined(lastAttempt.result) : '';
  if (text) console.error(text);
  fail('Refusing ranked smoke reset: Docker Compose v2 is unavailable in the current environment and no repo-known DOCKER_CONFIG fallback was found.');
}

function waitForPostgres() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const result = runDockerCompose(['exec', '-T', 'postgres', 'pg_isready', '-U', 'wordle', '-d', 'wordle_royale_local'], {
      stdio: attempt === 1 ? 'inherit' : 'pipe',
    });

    if (result.status === 0) {
      if (attempt > 1) console.log('Local Compose PostgreSQL is accepting connections.');
      return;
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }

  fail('Refusing ranked smoke reset: local Compose PostgreSQL did not become ready within 20 seconds.');
}

assertLocalDatabaseUrl(databaseUrl);
assertDockerComposeAvailable();

console.log('Ranked smoke local DB reset guard passed.');
console.log('Target: local Compose PostgreSQL database wordle_royale_local on localhost:5432.');
console.log(`Using Docker Compose from ${composeResolution.label}.`);
console.log('This will reset local schema data, apply the current Prisma schema, and seed deterministic fixture users/dictionary data.');

waitForPostgres();

console.log('$ docker compose exec -T postgres psql -U wordle -d wordle_royale_local -v ON_ERROR_STOP=1 -c DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
const resetSchema = runDockerCompose([
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'wordle',
  '-d',
  'wordle_royale_local',
  '-v',
  'ON_ERROR_STOP=1',
  '-c',
  'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;',
], { stdio: 'inherit' });

if (resetSchema.status !== 0) {
  process.exit(resetSchema.status ?? 1);
}

run('pnpm', [
  '--filter',
  '@wordle-royale/api',
  'exec',
  'prisma',
  'db',
  'push',
  '--schema',
  'prisma/schema.prisma',
  '--accept-data-loss',
  '--skip-generate',
]);

run('pnpm', ['--filter', '@wordle-royale/api', 'db:seed:local']);

console.log('Ranked smoke local DB reset and fixture seed completed.');
