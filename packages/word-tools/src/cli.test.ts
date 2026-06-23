import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs } from './cli.ts';

test('parseCliArgs supports fixture build with output directory', () => {
  assert.deepEqual(parseCliArgs(['fixture', 'build', '--output', 'tmp/out']), { command: 'fixture:build', outputDir: 'tmp/out' });
});

test('parseCliArgs supports manifest validation input', () => {
  assert.deepEqual(parseCliArgs(['validate', '--input', 'manifest.json']), { command: 'validate', inputPath: 'manifest.json' });
});
