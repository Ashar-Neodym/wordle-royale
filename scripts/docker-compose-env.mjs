import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DOCKER_CONFIG_CANDIDATES = [
  process.env.DOCKER_CONFIG,
  process.env.HOME ? join(process.env.HOME, '.docker') : undefined,
  join(homedir(), '.docker'),
  '/home/ashar/.docker',
  '/home/ashar/.hermes/profiles/yuna/home/.docker',
];

function profileDockerConfigs() {
  const profilesRoot = '/home/ashar/.hermes/profiles';
  if (!existsSync(profilesRoot)) return [];

  try {
    return readdirSync(profilesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(profilesRoot, entry.name, 'home', '.docker'));
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function composeEnvCandidates() {
  const candidates = unique([...DOCKER_CONFIG_CANDIDATES, ...profileDockerConfigs()]);

  return [
    { label: 'current environment', env: process.env },
    ...candidates
      .filter((dockerConfig) => existsSync(join(dockerConfig, 'cli-plugins', 'docker-compose')))
      .map((dockerConfig) => ({
        label: `DOCKER_CONFIG=${dockerConfig}`,
        env: { ...process.env, DOCKER_CONFIG: dockerConfig },
      })),
  ];
}

export function resolveComposeEnv() {
  const attempts = [];

  for (const candidate of composeEnvCandidates()) {
    const result = spawnSync('docker', ['compose', 'version'], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: candidate.env,
    });

    attempts.push({ ...candidate, result });
    if (result.status === 0) {
      return {
        ok: true,
        env: candidate.env,
        label: candidate.label,
        versionText: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
        attempts,
      };
    }
  }

  return { ok: false, attempts };
}

export function runDockerCompose(args, options = {}) {
  const resolution = resolveComposeEnv();
  if (!resolution.ok) {
    return {
      resolution,
      command: ['docker', 'compose', ...args],
      result: {
        status: 1,
        stdout: '',
        stderr: 'Docker Compose v2 is unavailable in the current environment and no usable repo-known DOCKER_CONFIG fallback was found.',
      },
    };
  }

  const command = ['docker', 'compose', ...args];
  return {
    resolution,
    command,
    result: spawnSync(command[0], command.slice(1), {
      encoding: 'utf8',
      stdio: options.stdio ?? 'pipe',
      env: resolution.env,
      ...options,
    }),
  };
}
