import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALL_PARAMETER_SETS } from './configs.ts';
import { runComparison } from './simulation-runner.ts';
import { DEFAULT_SCENARIOS } from './scenarios.ts';
import type { ComparisonReport, PlacementScenario, RatingConfig } from './types.ts';

export interface RenderReportInput {
  configs?: readonly RatingConfig[];
  scenarios?: readonly PlacementScenario[];
}

function tableRow(cells: readonly (string | number)[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function renderMarkdownFromReport(report: ComparisonReport): string {
  const lines: string[] = [];
  lines.push('# Wordle Royale Rating Parameter Comparison');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push(`Algorithm: ${report.algorithm}`);
  lines.push('');
  lines.push('## Parameter Sets');
  lines.push('');
  lines.push(tableRow(['Config', 'Established K', 'Provisional K', 'Established cap', 'Provisional cap', 'Use']));
  lines.push(tableRow(['---', '---:', '---:', '---:', '---:', '---']));
  for (const config of report.parameterSets) {
    lines.push(tableRow([config.name, config.establishedK, config.provisionalK, config.establishedDeltaCap, config.provisionalDeltaCap, config.displayName]));
  }
  lines.push('');
  lines.push('## Scenario Comparison');
  lines.push('');
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.id} — ${scenario.title}`);
    lines.push('');
    if (scenario.policyNote) {
      lines.push(`Policy note: ${scenario.policyNote}`);
      lines.push('');
    }
    lines.push(tableRow(['Config', 'Deltas', 'Avg abs delta', 'Max abs delta', 'Cap hits', 'Total delta']));
    lines.push(tableRow(['---', '---', '---:', '---:', '---:', '---:']));
    for (const result of scenario.configResults) {
      lines.push(tableRow([
        result.configName,
        Object.entries(result.deltas).map(([id, delta]) => `${id}:${delta >= 0 ? '+' : ''}${delta}`).join(', '),
        result.averageAbsoluteDelta,
        result.maxAbsoluteDelta,
        result.capHits,
        result.totalDelta,
      ]));
    }
    lines.push('');
  }
  lines.push('## Abandon/Void Policy Placeholders');
  lines.push('');
  lines.push('These policies are intentionally marked not locked; the simulator includes placeholders without pretending final ranked abandon policy is approved.');
  lines.push('');
  lines.push(tableRow(['Policy', 'Status', 'Simulation treatment', 'Open decision']));
  lines.push(tableRow(['---', '---', '---', '---']));
  for (const policy of report.policyPlaceholders) {
    lines.push(tableRow([policy.title, policy.status, policy.simulationTreatment, policy.openDecision]));
  }
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push(report.recommendation);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function renderMarkdownReport(input: RenderReportInput = {}): string {
  return renderMarkdownFromReport(runComparison(input));
}

export function runAndWriteReports(input: RenderReportInput & { outputDir: string }): { jsonPath: string; markdownPath: string; report: ComparisonReport } {
  const configs = input.configs ?? ALL_PARAMETER_SETS;
  const scenarios = input.scenarios ?? DEFAULT_SCENARIOS;
  const report = runComparison({ configs, scenarios });
  mkdirSync(input.outputDir, { recursive: true });
  const jsonPath = join(input.outputDir, 'rating-parameter-comparison.json');
  const markdownPath = join(input.outputDir, 'rating-parameter-comparison.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdownFromReport(report));
  return { jsonPath, markdownPath, report };
}
