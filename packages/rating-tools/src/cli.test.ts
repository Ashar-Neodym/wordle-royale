import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';

import { parseArgs, resolveOutputDir } from './cli.ts';

test('parseArgs defaults to package-local report directory', () => {
  assert.deepEqual(parseArgs(['simulate']), { command: 'simulate', outputDir: 'data/reports' });
});

test('resolveOutputDir treats root-style packages/rating-tools paths as repo-relative', () => {
  const packageRoot = '/repo/packages/rating-tools';
  const resolved = resolveOutputDir('packages/rating-tools/data/reports', packageRoot);

  assert.equal(resolved, join(packageRoot, 'data/reports'));
});
