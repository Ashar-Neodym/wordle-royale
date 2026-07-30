#!/usr/bin/env node
import { qualify } from './g0-qualification-core.mjs';

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!['--repo','--manifest','--target-sha','--receipt'].includes(flag) || value === undefined || Object.hasOwn(values,flag)) throw Object.assign(new Error('INVALID_ARGUMENTS'), { code:'INVALID_ARGUMENTS' });
    values[flag] = value;
  }
  if (Object.keys(values).length !== 4) throw Object.assign(new Error('INVALID_ARGUMENTS'), { code:'INVALID_ARGUMENTS' });
  return { repo:values['--repo'], manifest:values['--manifest'], targetSha:values['--target-sha'], receipt:values['--receipt'] };
}
try {
  const result = await qualify(parse(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ ok:true, targetSha:result.targetSha, sourceArtifactDigest:result.sourceArtifactDigest, manifestDigest:result.manifestDigest, receiptDigest:result.receiptDigest, hostedMutationAuthorized:false })}\n`);
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(error.code) ? error.code : 'LOCAL_QUALIFICATION_FAILED';
  process.stderr.write(`${JSON.stringify({ ok:false, code, hostedMutationAuthorized:false })}\n`); process.exitCode = 1;
}
