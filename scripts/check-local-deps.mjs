#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolveComposeEnv } from './docker-compose-env.mjs';

const mode = process.argv.includes('--verify') ? 'verify' : 'check';
const compose = ['docker', 'compose'];
const composeResolution = resolveComposeEnv();

function run(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    ...options,
  });
}

function combined(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function logCommand(command, result) {
  const text = combined(result);
  console.log(`$ ${command.join(' ')}`);
  if (text) console.log(text);
  console.log(`exit=${result.status ?? 1}`);
}

function fail(message, result) {
  console.error(message);
  if (result) logCommand(result.command, result.result);
  process.exit(result?.result?.status ?? 1);
}

function dockerCompose(args) {
  const command = [...compose, ...args];
  return { command, result: run(command, { env: composeResolution.env }) };
}

if (!composeResolution.ok) {
  const lastAttempt = composeResolution.attempts.at(-1);
  fail(
    'Docker Compose v2 is unavailable. Install Docker Compose v2 or add a user-local Docker CLI plugin, then rerun this command.',
    lastAttempt
      ? { command: ['docker', 'compose', 'version'], result: lastAttempt.result }
      : undefined,
  );
}

console.log(`Using Docker Compose from ${composeResolution.label}.`);
console.log(composeResolution.versionText);

const config = dockerCompose(['config']);
if (config.result.status !== 0) {
  fail('docker compose config failed.', config);
}
console.log('docker compose config passed.');

if (mode === 'check') {
  console.log('Local dependency check passed. Use `pnpm deps:verify` to start services and verify readiness.');
  process.exit(0);
}

let started = false;
try {
  const up = dockerCompose(['up', '-d', 'postgres', 'redis']);
  if (up.result.status !== 0) fail('docker compose up failed.', up);
  logCommand(up.command, up.result);
  started = true;

  const services = [
    {
      name: 'postgres',
      container: 'wordle-royale-postgres',
      ready: [...compose, 'exec', '-T', 'postgres', 'pg_isready', '-U', 'wordle', '-d', 'wordle_royale_local'],
      expected: /accepting connections/,
    },
    {
      name: 'redis',
      container: 'wordle-royale-redis',
      ready: [...compose, 'exec', '-T', 'redis', 'redis-cli', 'ping'],
      expected: /PONG/,
    },
  ];

  for (const service of services) {
    let healthy = false;
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const health = run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', service.container]);
      const healthText = combined(health);
      if (health.status === 0 && healthText === 'healthy') {
        healthy = true;
        break;
      }
      console.log(`${service.name} health attempt ${attempt}/24: ${healthText || 'not ready'}`);
      run(['sleep', '5'], { stdio: 'ignore' });
    }

    if (!healthy) {
      fail(`${service.name} did not become healthy.`, {
        command: ['docker', 'inspect', '--format', '{{.State.Health.Status}}', service.container],
        result: run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', service.container]),
      });
    }

    const readiness = run(service.ready, { env: composeResolution.env });
    logCommand(service.ready, readiness);
    if (readiness.status !== 0 || !service.expected.test(combined(readiness))) {
      fail(`${service.name} readiness check failed.`, { command: service.ready, result: readiness });
    }
  }

  console.log('Local dependency verification passed: PostgreSQL and Redis are healthy and accepting connections.');
} finally {
  if (started) {
    const down = dockerCompose(['down']);
    logCommand(down.command, down.result);
    if (down.result.status !== 0) process.exit(down.result.status ?? 1);
  }
}
