#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordLibraryManifestSchema } from '@wordle-royale/contracts';
import { writeFixtureArtifacts } from './fixtures.ts';

export type CliCommand =
  | { command: 'fixture:build'; outputDir: string }
  | { command: 'validate'; inputPath: string }
  | { command: 'help' };

export function parseCliArgs(args: string[]): CliCommand {
  if (args[0] === 'fixture' && args[1] === 'build') {
    const outputIndex = args.indexOf('--output');
    const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : 'packages/word-tools/data/fixtures';
    if (!outputDir) throw new Error('fixture build --output requires a directory');
    return { command: 'fixture:build', outputDir };
  }
  if (args[0] === 'validate') {
    const inputIndex = args.indexOf('--input');
    const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
    if (!inputPath) throw new Error('validate requires --input <manifestPath>');
    return { command: 'validate', inputPath };
  }
  if (args.includes('--help') || args.length === 0) return { command: 'help' };
  throw new Error(`Unknown command: ${args.join(' ')}`);
}

export function helpText() {
  return `word-tools\n\nCommands:\n  fixture build [--output <dir>]   Generate safe fixture dictionary artifacts\n  validate --input <manifest>      Validate a generated fixture manifest schema\n`;
}

function workspaceRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (current !== dirname(current)) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

function workspacePath(path: string): string {
  return isAbsolute(path) ? path : resolve(workspaceRoot(), path);
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.command === 'help') {
    console.log(helpText());
    return;
  }
  if (parsed.command === 'fixture:build') {
    const artifacts = writeFixtureArtifacts(
      workspacePath(parsed.outputDir),
      workspacePath('packages/word-tools/data/reports'),
    );
    console.log(`Generated fixture dictionary ${artifacts.manifest.dictionaryVersion}`);
    console.log(`answers=${artifacts.answerArtifact.words.length} guesses=${artifacts.guessArtifact.words.length} banned=${artifacts.bannedArtifact.words.length}`);
    console.log(`validationPassed=${artifacts.validationReport.passed}`);
    return;
  }
  if (parsed.command === 'validate') {
    const manifest = wordLibraryManifestSchema.parse(JSON.parse(readFileSync(workspacePath(parsed.inputPath), 'utf8')));
    if (!manifest.validation.passed) {
      console.error(`Manifest ${manifest.dictionaryVersion} validation flag is false`);
      process.exitCode = 1;
      return;
    }
    console.log(`Manifest ${manifest.dictionaryVersion} is structurally valid and validation.passed=true`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
