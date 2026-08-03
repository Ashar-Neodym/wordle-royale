import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const sameFile = (a, b) => ['dev','ino','uid','mode','nlink','sha256'].every((field) => a[field] === b[field]);

async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((accept, reject) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 }).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', accept));
  return `sha256:${hash.digest('hex')}`;
}
async function inspect(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path.includes('\0')) fail('EXECUTABLE_PATH_INVALID');
  const named = await lstat(path).catch(() => fail('EXECUTABLE_UNAVAILABLE'));
  if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid?.() || named.nlink !== 1 || (named.mode & 0o7777) !== 0o500) fail('EXECUTABLE_POLICY_MISMATCH');
  let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('EXECUTABLE_CHANGED'); }
  try {
    const opened = await handle.stat();
    const snapshot = { dev:opened.dev, ino:opened.ino, uid:opened.uid, mode:opened.mode & 0o7777, nlink:opened.nlink, sha256:await hashHandle(handle) };
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== snapshot.dev || after.ino !== snapshot.ino || after.uid !== snapshot.uid || (after.mode & 0o7777) !== snapshot.mode || after.nlink !== snapshot.nlink) fail('EXECUTABLE_CHANGED');
    return { handle, snapshot, realpath:await realpath(path) };
  } catch (error) { await handle.close(); throw error; }
}
function spawnBounded(executableHandle, argv, limits, remainingMs) {
  const timeoutMs = Math.min(limits.timeoutMs, remainingMs);
  if (timeoutMs < 1) fail('TOTAL_TIME_LIMIT');
  return new Promise((accept, reject) => {
    let outLength=0, errLength=0, settled=false, reason; const out=[]; const err=[];
    // fd 3 is deliberately inherited: this closes the pathname swap race and also
    // lets shebang adapters reopen their own descriptor after exec.
    const child=spawn('/proc/self/fd/3', argv, { shell:false, detached:true, windowsHide:true, stdio:['ignore','pipe','pipe',executableHandle.fd], env:{ LANG:'C', LC_ALL:'C', PATH:'/usr/bin:/bin', TZ:'UTC' } });
    const kill=()=>{ try { if (child.pid) process.kill(-child.pid,'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } };
    const stop=(code)=>{ if(!reason){reason=code;kill();} };
    const timer=setTimeout(()=>stop('PROCESS_TIMEOUT'),timeoutMs); timer.unref?.();
    child.stdout.on('data',(chunk)=>{outLength+=chunk.length;if(outLength>limits.stdoutBytes)stop('STDOUT_LIMIT');else out.push(chunk);});
    child.stderr.on('data',(chunk)=>{errLength+=chunk.length;if(errLength>limits.stderrBytes)stop('STDERR_LIMIT');else err.push(chunk);});
    child.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;const e=new Error('PROCESS_SPAWN_FAILED');e.code='PROCESS_SPAWN_FAILED';reject(e);}});
    child.on('close',(code,signal)=>{clearTimeout(timer);if(settled)return;settled=true;kill();if(reason){const e=new Error(reason);e.code=reason;reject(e);}else accept({exitCode:code??-1,signal,stdout:Buffer.concat(out),stderr:Buffer.concat(err)});});
  });
}

/** The sole production subprocess boundary: one pinned executable, seven fixed core-generated calls. */
export function createG2SecureChildRunner({ totalTimeoutMs = 300_000 } = {}) {
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 700 || totalTimeoutMs > 900_000) fail('INVALID_TOTAL_TIME_LIMIT');
  const started=Date.now(); let baseline; let calls=0; let priorPolicy;
  return { shellFree:true, async run(spec) {
    if (!spec || Object.keys(spec).sort().join('|') !== 'argv|executable|limits|shell' || spec.shell !== false || calls >= 7) fail('INVALID_RUNNER_SPEC');
    if (!Array.isArray(spec.argv) || spec.argv.some((x)=>typeof x!=='string'||x.includes('\0'))) fail('INVALID_RUNNER_SPEC');
    const policy=spec.executable;
    if (!policy || typeof policy.path!=='string' || policy.path!==policy.realpath || resolve(policy.path)!==policy.path || policy.uid!==process.getuid?.() || policy.mode!==0o500) fail('EXECUTABLE_POLICY_MISMATCH');
    if (priorPolicy && JSON.stringify(policy)!==priorPolicy) fail('EXECUTABLE_PLAN_MISMATCH');
    priorPolicy=JSON.stringify(policy);
    const current=await inspect(policy.path);
    try {
      if (current.realpath!==policy.realpath || current.snapshot.sha256!==policy.sha256 || current.snapshot.uid!==policy.uid || current.snapshot.mode!==policy.mode) fail('EXECUTABLE_POLICY_MISMATCH');
      if (!baseline) baseline=current.snapshot; else if(!sameFile(baseline,current.snapshot)) fail('EXECUTABLE_CHANGED');
      calls+=1;
      const result=await spawnBounded(current.handle,spec.argv,spec.limits,totalTimeoutMs-(Date.now()-started));
      const after=await inspect(policy.path);
      try { if(!sameFile(baseline,after.snapshot)||after.realpath!==policy.realpath) fail('EXECUTABLE_CHANGED'); } finally { await after.handle.close(); }
      return result;
    } finally { await current.handle.close(); }
  }, async finish() { if(calls!==7) fail('INCOMPLETE_OPERATION_EXECUTION'); const final=await inspect(JSON.parse(priorPolicy).path); try { if(!sameFile(baseline,final.snapshot)) fail('EXECUTABLE_CHANGED'); } finally { await final.handle.close(); } } };
}
