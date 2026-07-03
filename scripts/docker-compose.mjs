#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolveComposeEnv } from './docker-compose-env.mjs';

const composeArgs = process.argv.slice(2);
const resolution = resolveComposeEnv();

if (!resolution.ok) {
  const lastAttempt = resolution.attempts.at(-1);
  const text = `${lastAttempt?.result?.stdout ?? ''}${lastAttempt?.result?.stderr ?? ''}`.trim();
  console.error('Docker Compose v2 is unavailable. Install Docker Compose v2 or add a user-local Docker CLI plugin.');
  if (text) console.error(text);
  process.exit(lastAttempt?.result?.status ?? 1);
}

console.log(`Using Docker Compose from ${resolution.label}.`);
const result = spawnSync('docker', ['compose', ...composeArgs], {
  stdio: 'inherit',
  env: resolution.env,
});

process.exit(result.status ?? 1);
