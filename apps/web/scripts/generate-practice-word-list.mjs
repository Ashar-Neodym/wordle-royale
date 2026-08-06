#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = Object.freeze({
  name: 'an-array-of-english-words',
  version: '2.0.0',
  npmIntegrity: 'sha512-FXnNvZSOI27kkKXeLSquhaTGP7z198UOQ4txaYO9fCfrjCh+D5SV7G7XqzEH0229+pAi4cjBEZ4WIQYgjKtO7Q==',
  wordsSha256: 'dadb53f5df46b5b26577fe1cadc85bf076d2d04cf554f6fcda693f2704555e06',
  licenseSha256: 'c602aae873f403fa2e3643b5cec05d1354284f67c46caa9a693042fa7f5ebeb1',
});

const packageDirectory = process.argv[2];
if (!packageDirectory || process.argv.length !== 3) {
  console.error('Usage: node apps/web/scripts/generate-practice-word-list.mjs <extracted-an-array-of-english-words-2.0.0-directory>');
  process.exit(2);
}

const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');
const sourcePath = resolve(packageDirectory);
const [manifestRaw, wordsRaw, licenseRaw] = await Promise.all([
  readFile(join(sourcePath, 'package.json')),
  readFile(join(sourcePath, 'index.json')),
  readFile(join(sourcePath, 'license')),
]);
const manifest = JSON.parse(manifestRaw.toString('utf8'));

if (manifest.name !== SOURCE.name || manifest.version !== SOURCE.version || manifest.license !== 'MIT') {
  throw new Error(`Expected ${SOURCE.name}@${SOURCE.version} with an MIT package manifest.`);
}
if (sha256(wordsRaw) !== SOURCE.wordsSha256 || sha256(licenseRaw) !== SOURCE.licenseSha256) {
  throw new Error('Extracted package contents do not match the pinned 2.0.0 source and MIT license.');
}
if (!licenseRaw.toString('utf8').startsWith('(The MIT License)\n\nCopyright (c) 2014 Zeke Sikelianos')) {
  throw new Error('The pinned package license is not the expected MIT license attribution.');
}

const sourceWords = JSON.parse(wordsRaw.toString('utf8'));
if (!Array.isArray(sourceWords)) throw new TypeError('Expected index.json to contain an array.');

const words = [...new Set(sourceWords
  .filter((word) => typeof word === 'string')
  .map((word) => word.trim().toLowerCase())
  .filter((word) => /^[a-z]{5}$/.test(word)))]
  .sort();

const rows = [];
for (let index = 0; index < words.length; index += 12) {
  rows.push(`  ${words.slice(index, index + 12).map((word) => `'${word}'`).join(', ')},`);
}

const output = `// GENERATED FILE — DO NOT EDIT.\n// Source: an-array-of-english-words@2.0.0 (https://www.npmjs.com/package/an-array-of-english-words/v/2.0.0)\n// Source integrity: ${SOURCE.npmIntegrity}\n// Copyright (c) 2014 Zeke Sikelianos; MIT licensed.\n// Full attribution and license: docs/third-party-word-list-attribution.md\n// Regenerate: node apps/web/scripts/generate-practice-word-list.mjs <extracted-package-directory>\n\nexport const GENERATED_FIVE_LETTER_WORDS = [\n${rows.join('\n')}\n] as const;\n`;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const destination = resolve(scriptDirectory, '../src/lib/generated/practice-five-letter-words.ts');
await writeFile(destination, output, 'utf8');
console.log(`Generated ${words.length} normalized five-letter words (${Buffer.byteLength(output)} bytes) at ${destination}`);
