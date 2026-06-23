import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const requiredPaths = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/mobile/package.json',
  'packages/contracts/package.json',
  'packages/game-engine/package.json',
  'packages/design-tokens/package.json',
  'packages/fixtures/package.json',
  'packages/word-tools/package.json',
  'packages/rating-tools/package.json',
];

const requiredPackageNames = [
  '@wordle-royale/api',
  '@wordle-royale/web',
  '@wordle-royale/mobile',
  '@wordle-royale/contracts',
  '@wordle-royale/game-engine',
  '@wordle-royale/design-tokens',
  '@wordle-royale/fixtures',
  '@wordle-royale/word-tools',
  '@wordle-royale/rating-tools',
];

const missingPaths = requiredPaths.filter((path) => !existsSync(join(process.cwd(), path)));
if (missingPaths.length > 0) {
  console.error('Workspace scaffold validation failed. Missing paths:');
  for (const path of missingPaths) console.error(`- ${path}`);
  process.exit(1);
}

const packageNames = requiredPaths
  .filter((path) => path.endsWith('package.json') && path !== 'package.json')
  .map((path) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')).name);

const missingPackageNames = requiredPackageNames.filter((name) => !packageNames.includes(name));
if (missingPackageNames.length > 0) {
  console.error('Workspace scaffold validation failed. Missing workspace package names:');
  for (const name of missingPackageNames) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`Workspace scaffold validation passed (${requiredPackageNames.length} workspace packages).`);
