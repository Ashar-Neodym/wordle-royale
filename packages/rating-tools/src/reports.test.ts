import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL_PARAMETER_SETS } from './configs.ts';
import { renderMarkdownReport, runAndWriteReports } from './reports.ts';
import { DEFAULT_SCENARIOS } from './scenarios.ts';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('markdown report includes parameter comparison and abandon placeholders', () => {
  const markdown = renderMarkdownReport({ configs: ALL_PARAMETER_SETS, scenarios: DEFAULT_SCENARIOS });

  assert.match(markdown, /# Wordle Royale Rating Parameter Comparison/);
  assert.match(markdown, /conservative_beta/);
  assert.match(markdown, /baseline_v1/);
  assert.match(markdown, /fast_convergence/);
  assert.match(markdown, /baseline_glicko/);
  assert.match(markdown, /standard_1v1/);
  assert.match(markdown, /speed_1v1/);
  assert.match(markdown, /classic_1v1/);
  assert.match(markdown, /multiplayer_lobby/);
  assert.match(markdown, /1v1_upset/);
  assert.match(markdown, /Glicko-style Internal Model Notes/);
  assert.match(markdown, /Abandon\/Void Policy Placeholders/);
  assert.match(markdown, /not locked/);
});

test('report writer creates JSON and Markdown artifacts', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'rating-tools-'));
  const paths = runAndWriteReports({ outputDir, configs: ALL_PARAMETER_SETS, scenarios: DEFAULT_SCENARIOS });

  const json = JSON.parse(readFileSync(paths.jsonPath, 'utf8')) as { parameterSets: unknown[]; modeLadders: unknown[] };
  const markdown = readFileSync(paths.markdownPath, 'utf8');
  assert.equal(json.parameterSets.length, 4);
  assert.equal(json.modeLadders.length, 4);
  assert.match(markdown, /## Scenario Comparison/);
});
