#!/usr/bin/env node
import { constants as fsConstants } from 'node:fs';
import { lstat, realpath, readFile, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateRetryEligibility, RetryEligibilityError } from './g0-retry-eligibility-core.mjs';
import { createReplayGuard } from './provider-provenance-live-collector-core.mjs';

const USAGE = 'usage: g0-retry-eligibility --qualification ABS --prior-approval ABS --prior-attempt ABS --challenge ABS --evidence ABS --provider-receipt ABS --collector-public-key ABS --expected-challenge-id ID --expected-run-id ID --expected-nonce ID --expected-collector-key-id ID --replay-dir ABS --output ABS';
const names = ['qualification','prior-approval','prior-attempt','challenge','evidence','provider-receipt','collector-public-key','expected-challenge-id','expected-run-id','expected-nonce','expected-collector-key-id','replay-dir','output'];
function argumentsOf(argv) {
  const out = {}; for (let index = 0; index < argv.length; index += 2) { const key = argv[index]?.slice(2); if (!argv[index]?.startsWith('--') || !names.includes(key) || out[key] || argv[index + 1] === undefined) throw new RetryEligibilityError('CLI_ARGUMENT_INVALID'); out[key] = argv[index + 1]; }
  if (Object.keys(out).length !== names.length) throw new RetryEligibilityError('CLI_ARGUMENT_MISSING'); return out;
}
async function protectedFile(path, label) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new RetryEligibilityError('PATH_NOT_ABSOLUTE', label);
  const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || await realpath(path) !== path) throw new RetryEligibilityError('UNSAFE_INPUT_FILE', label);
  if ((stat.mode & 0o022) !== 0) throw new RetryEligibilityError('MUTABLE_INPUT_PERMISSIONS', label);
  return readFile(path);
}
async function json(path, label) { const bytes = await protectedFile(path, label); try { return JSON.parse(bytes.toString('utf8')); } catch { throw new RetryEligibilityError('INVALID_JSON', label); } }
async function consumeNonce(directory, nonce) {
  if (!isAbsolute(directory) || resolve(directory) !== directory) throw new RetryEligibilityError('PATH_NOT_ABSOLUTE', 'replay-dir');
  const guard = await createReplayGuard(directory);
  try { if (await guard.consumeAsync(nonce) !== true) throw new RetryEligibilityError('CHALLENGE_REPLAY'); } finally { await guard.close(); }
}
async function writeReceipt(path, receipt) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new RetryEligibilityError('PATH_NOT_ABSOLUTE', 'output');
  const parent = dirname(path); const parentStat = await lstat(parent); if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || await realpath(parent) !== parent) throw new RetryEligibilityError('UNSAFE_OUTPUT_PARENT');
  const temporary = `${path}.tmp-${process.pid}-${createHash('sha256').update(path).update(receipt.receiptDigest).digest('hex').slice(0,12)}`; let handle;
  try {
    handle = await open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(receipt,null,2)}\n`); await handle.sync(); await handle.close(); handle = undefined;
    await link(temporary,path); await unlink(temporary); const dir = await open(parent, 'r'); await dir.sync(); await dir.close();
  } catch (error) { if (handle) await handle.close().catch(()=>{}); await unlink(temporary).catch(()=>{}); throw error; }
}
function report(error) {
  const code = error instanceof RetryEligibilityError ? error.code : (error?.code === 'EEXIST' ? 'OUTPUT_ALREADY_EXISTS' : (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(error.code) ? error.code : 'LOCAL_IO_FAILURE'));
  process.stderr.write(`${JSON.stringify({ ok:false, code })}\n`); if (code.startsWith('CLI_')) process.stderr.write(`${USAGE}\n`); process.exitCode = code === 'CHALLENGE_REPLAY' ? 3 : code === 'LOCAL_IO_FAILURE' ? 4 : 2;
}
try {
  const args = argumentsOf(process.argv.slice(2));
  const [qualification, priorApproval, priorAttempt, challenge, evidence, providerReceipt, collectorPublicKey] = await Promise.all([
    json(args.qualification,'qualification'), json(args['prior-approval'],'prior-approval'), json(args['prior-attempt'],'prior-attempt'), json(args.challenge,'challenge'), json(args.evidence,'evidence'), json(args['provider-receipt'],'provider-receipt'), protectedFile(args['collector-public-key'],'collector-public-key'),
  ]);
  const receipt = evaluateRetryEligibility({ qualification, priorApproval, priorAttempt, challenge, evidence, providerReceipt, collectorPublicKey, policy:{ expectedChallengeId:args['expected-challenge-id'], expectedRunId:args['expected-run-id'], expectedNonce:args['expected-nonce'], expectedCollectorKeyId:args['expected-collector-key-id'] } });
  // Publish first, then consume. If replay publication fails, remove this
  // process's receipt before reporting failure; validation failures publish
  // neither receipt nor nonce. This avoids burning a nonce on output I/O.
  await writeReceipt(args.output, receipt);
  try { await consumeNonce(args['replay-dir'], challenge.nonce); }
  catch (error) { await unlink(args.output).catch(() => {}); throw error; }
  process.stdout.write(`${JSON.stringify({ ok:true, decision:receipt.decision, receiptDigest:receipt.receiptDigest, output:args.output })}\n`);
} catch (error) { report(error); }
