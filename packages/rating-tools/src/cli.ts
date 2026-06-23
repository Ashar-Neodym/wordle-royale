import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAndWriteReports } from './reports.ts';

export interface CliOptions {
  command: 'simulate' | 'help';
  outputDir: string;
}

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] === 'simulate' ? 'simulate' : args[0] === '--help' || args[0] === 'help' ? 'help' : 'simulate';
  let outputDir = 'data/reports';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--output-dir') {
      const value = args[i + 1];
      if (!value) throw new Error('--output-dir requires a value');
      outputDir = value;
      i += 1;
    }
  }
  return { command, outputDir };
}

export function printHelp(): void {
  console.log(`Usage: pnpm rating:simulate [-- --output-dir data/reports]\n\nGenerates deterministic JSON and Markdown reports comparing candidate placement-MMR parameter sets.`);
}

export function defaultPackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveOutputDir(outputDir: string, packageRoot = defaultPackageRoot()): string {
  if (isAbsolute(outputDir)) return outputDir;
  if (outputDir === 'packages/rating-tools' || outputDir.startsWith('packages/rating-tools/')) {
    return join(packageRoot, outputDir.replace(/^packages\/rating-tools\/?/, ''));
  }
  return join(packageRoot, outputDir);
}

export function main(args = process.argv.slice(2)): void {
  const options = parseArgs(args);
  if (options.command === 'help') {
    printHelp();
    return;
  }
  const { jsonPath, markdownPath, report } = runAndWriteReports({ outputDir: resolveOutputDir(options.outputDir) });
  console.log(`Generated rating comparison reports for ${report.parameterSets.length} parameter sets and ${report.scenarios.length} scenarios.`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${markdownPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
