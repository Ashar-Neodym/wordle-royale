#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveComposeEnv } from './docker-compose-env.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const apiRoot = new URL('../apps/api/', import.meta.url).pathname;
const apiPackage = '@wordle-royale/api';
const localDbPassword = ['wordle', 'local', 'password'].join('_');
const localDatabaseUrl = `postgresql://wordle:${encodeURIComponent(localDbPassword)}@localhost:5432/wordle_royale_local?schema=prod_start_smoke`;
const localRedisUrl = 'redis://localhost:6379';

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log(`exit=${result.status ?? 1}`);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not allocate a local smoke port.'));
      });
    });
  });
}

async function waitForReadyz(port, apiProcess) {
  const url = `http://127.0.0.1:${port}/readyz`;
  let lastError = 'not checked yet';

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API process exited before readiness succeeded. exit=${apiProcess.exitCode}`);
    }

    try {
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && body?.data?.status === 'ok') {
        console.log(`PASS readyz — ${url} returned status=ok`);
        return body;
      }
      lastError = `HTTP ${response.status} ${JSON.stringify(body)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    console.log(`INFO readyz attempt ${attempt}/40 — ${lastError}`);
    await delay(500);
  }

  throw new Error(`/readyz did not become ok: ${lastError}`);
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);

    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });

    child.kill('SIGTERM');
  });
}

const composeResolution = resolveComposeEnv();
if (!composeResolution.ok) {
  console.error('Docker Compose v2 is required for the API prod-start smoke because /readyz checks local PostgreSQL and Redis.');
  process.exit(1);
}

console.log(`INFO docker compose — ${composeResolution.label}`);
run('docker', ['compose', 'up', '-d', 'postgres', 'redis'], { env: composeResolution.env });
run('pnpm', ['--filter', apiPackage, 'db:generate']);
run('pnpm', ['--filter', apiPackage, 'build']);
run('pnpm', ['--filter', apiPackage, 'db:migrate:deploy'], {
  env: {
    ...process.env,
    DATABASE_URL: localDatabaseUrl,
    DATABASE_DIRECT_URL: localDatabaseUrl,
  },
});

const port = await getFreePort();
console.log(`INFO api smoke port — ${port}`);

const apiEnv = {
  ...process.env,
  NODE_ENV: 'production',
  APP_ENV: 'local',
  AUTH_MODE: 'dev_stub',
  ENABLE_DEV_AUTH: 'true',
  ENABLE_DEV_ROUTES: 'true',
  COOKIE_SECURE: 'false',
  PORT: String(port),
  DATABASE_URL: localDatabaseUrl,
  DATABASE_DIRECT_URL: localDatabaseUrl,
  REDIS_URL: localRedisUrl,
  STANDARD_1V1_QUEUE_ENABLED: 'false',
};

console.log('$ node dist/apps/api/src/main.js');
const apiProcess = spawn('node', ['dist/apps/api/src/main.js'], {
  cwd: apiRoot,
  env: apiEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let apiOutput = '';
apiProcess.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  apiOutput += text;
  process.stdout.write(text);
});
apiProcess.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  apiOutput += text;
  process.stderr.write(text);
});

try {
  const ready = await waitForReadyz(port, apiProcess);
  console.log(`PASS api prod-start smoke — service=${ready.data.service}, env=${ready.data.environment}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (apiOutput) {
    console.error('--- API output tail ---');
    console.error(apiOutput.split('\n').slice(-40).join('\n'));
  }
  process.exitCode = 1;
} finally {
  const exitCode = await stopProcess(apiProcess);
  console.log(`INFO api process terminated — exit=${exitCode}`);
  console.log('INFO local dependencies were started/left running for reuse; use `pnpm deps:down` when you want to stop them.');
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
