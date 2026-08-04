#!/usr/bin/env node
import { assembleProviderBundleStagingProduction } from './g0-provider-bundle-staging-assembler-core.mjs';

function parse(argv) {
  if (argv.length !== 6) throw new Error('CLI_INPUT_INVALID');
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (!['--provider','--source-root','--destination-root'].includes(flag) || Object.hasOwn(out, flag) || typeof value !== 'string' || value.length === 0) throw new Error('CLI_INPUT_INVALID');
    out[flag] = value;
  }
  if (!Object.hasOwn(out, '--provider') || !Object.hasOwn(out, '--source-root') || !Object.hasOwn(out, '--destination-root')) throw new Error('CLI_INPUT_INVALID');
  return { provider: out['--provider'], sourceRoot: out['--source-root'], destinationRoot: out['--destination-root'] };
}

try {
  const result = await assembleProviderBundleStagingProduction(parse(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ nodeCount: result.nodeCount, packageCount: result.packageCount, provider: result.provider, status: result.status })}\n`);
} catch {
  process.stderr.write('G0_BUNDLE_ASSEMBLY_FAILED\n');
  process.exitCode = 1;
}
