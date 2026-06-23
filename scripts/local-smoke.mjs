#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  const prefix = ok ? 'PASS' : 'FAIL';
  console.log(`${prefix} ${name}${detail ? ` — ${detail}` : ''}`);
}

function info(name, detail = '') {
  console.log(`INFO ${name}${detail ? ` — ${detail}` : ''}`);
}

check('docker-compose.yml exists', existsSync('docker-compose.yml'));
check('.env.example exists', existsSync('.env.example'));
check('.env.local.example exists', existsSync('.env.local.example'));

const dockerComposeVersion = spawnSync('docker', ['compose', 'version'], {
  stdio: 'pipe',
  encoding: 'utf8',
});

if (dockerComposeVersion.status === 0) {
  const dockerConfig = spawnSync('docker', ['compose', 'config', '--quiet'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  check(
    'docker compose config validates',
    dockerConfig.status === 0,
    dockerConfig.status === 0
      ? 'configuration is syntactically valid'
      : (dockerConfig.stderr || dockerConfig.stdout || 'docker compose config failed').trim(),
  );
} else {
  info(
    'docker compose config validation skipped',
    'Docker Compose v2 is not available in this environment; install Docker Compose to validate/start local services.',
  );
}

const workspace = spawnSync('pnpm', ['validate:workspace'], {
  stdio: 'pipe',
  encoding: 'utf8',
});

check(
  'workspace scaffold validates',
  workspace.status === 0,
  workspace.status === 0 ? 'pnpm validate:workspace passed' : (workspace.stderr || workspace.stdout || 'workspace validation failed').trim(),
);

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Local smoke failed: ${failed.length} check(s) failed.`);
  process.exit(1);
}

console.log('Local smoke passed. This smoke test validates local config only; it does not start app services.');
