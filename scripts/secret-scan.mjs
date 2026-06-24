#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const excludedPathParts = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.expo',
  'coverage',
  '.turbo',
  '.cache',
  'tmp',
  'docs',
  'agent-communication',
]);

const includedExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.prisma',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const includedBasenames = new Set([
  '.env.example',
  '.env.local.example',
  '.gitignore',
  'Dockerfile',
  'docker-compose.yml',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]);

const detectors = [
  {
    name: 'AWS access key id',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: 'GitHub token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,255}\b/g,
  },
  {
    name: 'OpenAI API key',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Slack token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: 'Private key block',
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
  },
  {
    name: 'Likely secret assignment',
    pattern: /\b(?:api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\b\s*[:=]\s*["']?(?!changeme\b|example\b|placeholder\b|dummy\b|test\b|local\b|dev\b|none\b|todo\b|replace\b|your[_-]?)[A-Za-z0-9+/=_:@.-]{24,}["']?/gi,
  },
];

function gitFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    console.error((result.stderr || result.stdout || 'git ls-files failed').trim());
    process.exit(result.status ?? 1);
  }

  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isExcluded(path) {
  return path.split('/').some((part) => excludedPathParts.has(part));
}

function isIncluded(path) {
  const basename = path.split('/').at(-1);
  if (includedBasenames.has(basename)) return true;
  if (basename?.endsWith('.example')) return true;
  return includedExtensions.has(extname(path));
}

function mask(value) {
  if (value.length <= 12) return '<redacted>';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

const findings = [];
const scanned = [];

for (const path of gitFiles()) {
  if (isExcluded(path) || !isIncluded(path) || !existsSync(path)) continue;
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 1024 * 1024) continue;

  const text = readFileSync(path, 'utf8');
  scanned.push(path);

  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    let match;
    while ((match = detector.pattern.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({
        detector: detector.name,
        path,
        line,
        sample: mask(match[0]),
      });
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`- ${finding.path}:${finding.line} ${finding.detector} ${finding.sample}`);
  }
  console.error('Review each finding. If it is a placeholder false positive, adjust the scanner with a narrow allow-list.');
  process.exit(1);
}

console.log(`Secret scan passed (${scanned.length} source/config files scanned).`);
console.log('Excluded: node_modules, dist, build, .next, .expo, coverage, .turbo, .cache, tmp, docs, agent-communication.');
