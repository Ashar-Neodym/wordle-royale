#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function discoverWebTests(root = resolve(webRoot, 'src')) {
  const selected = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      // Node 24 executes these JavaScript and type-stripped TypeScript forms directly.
      // JSX/TSX stay excluded because this runner intentionally does not add a transform layer.
      else if (entry.isFile() && /\.test\.(?:[cm]?js|[cm]?ts)$/.test(entry.name)) selected.push(path);
    }
  }
  await visit(root);
  return selected.sort((left, right) => left.localeCompare(right, 'en'));
}

async function main() {
  const tests = await discoverWebTests();
  if (tests.length === 0) {
    console.error('No web tests discovered under src/.');
    process.exitCode = 1;
    return;
  }
  const displayPaths = tests.map((path) => relative(webRoot, path).split('\\').join('/'));
  console.log(`Discovered ${displayPaths.length} web test files.`);
  const child = spawn(process.execPath, ['--test', ...displayPaths], { cwd: webRoot, stdio: 'inherit' });
  const forward = (signal) => { if (!child.killed) child.kill(signal); };
  process.once('SIGINT', forward);
  process.once('SIGTERM', forward);
  child.once('error', (error) => { console.error(error); process.exitCode = 1; });
  child.once('exit', (code, signal) => {
    process.removeListener('SIGINT', forward);
    process.removeListener('SIGTERM', forward);
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
