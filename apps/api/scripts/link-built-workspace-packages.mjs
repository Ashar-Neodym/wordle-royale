#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const apiDistRoot = join(process.cwd(), 'dist');

const workspacePackages = [
  ['@wordle-royale/contracts', '../../../packages/contracts/src/index.js'],
  ['@wordle-royale/game-engine', '../../../packages/game-engine/src/index.js'],
];

for (const [packageName, main] of workspacePackages) {
  const packageJsonPath = join(apiDistRoot, 'node_modules', ...packageName.split('/'), 'package.json');
  mkdirSync(dirname(packageJsonPath), { recursive: true });
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify({ type: 'module', main }, null, 2)}\n`,
    'utf8',
  );
  console.log(`Linked ${packageName} -> ${main}`);
}
