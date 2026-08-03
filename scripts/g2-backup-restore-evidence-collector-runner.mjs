import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const SUPERVISOR_PATH=resolve(HERE,'g2-adapter-supervisor.py');
const SUPERVISOR_SHA256='sha256:c4e9373b5fe5f118f1673e776188a4554634c656b1aac4a2d497a797817ea00c';
const PYTHON_LINK='/usr/bin/python3';
const MAX_FRAME=1_048_576;
const fail = (code) => { const error = new Error(code); error.code = code; throw error; };
const sameFile = (a, b) => ['dev','ino','uid','mode','nlink','sha256'].every((field) => a[field] === b[field]);

async function hashHandle(handle) {
  const hash = createHash('sha256');
  await new Promise((accept, reject) => createReadStream('', { fd: handle.fd, autoClose: false, start: 0 }).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', accept));
  return `sha256:${hash.digest('hex')}`;
}
async function openedSnapshot(handle) {
  const opened=await handle.stat();
  const snapshot={dev:opened.dev,ino:opened.ino,uid:opened.uid,mode:opened.mode&0o7777,nlink:opened.nlink,sha256:await hashHandle(handle)};
  const after=await handle.stat();
  if(!after.isFile()||after.dev!==snapshot.dev||after.ino!==snapshot.ino||after.uid!==snapshot.uid||(after.mode&0o7777)!==snapshot.mode||after.nlink!==snapshot.nlink)fail('EXECUTABLE_CHANGED');
  return snapshot;
}
async function inspectAdapter(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || path.includes('\0')) fail('EXECUTABLE_PATH_INVALID');
  const named = await lstat(path).catch(() => fail('EXECUTABLE_UNAVAILABLE'));
  if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid?.() || named.nlink !== 1 || (named.mode & 0o7777) !== 0o500) fail('EXECUTABLE_POLICY_MISMATCH');
  let handle; try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch { fail('EXECUTABLE_CHANGED'); }
  try { return {handle,snapshot:await openedSnapshot(handle),realpath:await realpath(path)}; }
  catch(error){await handle.close();throw error;}
}
async function inspectSupervisor() {
  const named=await lstat(SUPERVISOR_PATH).catch(()=>fail('CONTAINMENT_HELPER_FAILED'));
  if(!named.isFile()||named.isSymbolicLink()||named.uid!==process.getuid?.()||named.nlink!==1||(named.mode&0o7777)!==0o644)fail('CONTAINMENT_HELPER_FAILED');
  let handle;try{handle=await open(SUPERVISOR_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);}catch{fail('CONTAINMENT_HELPER_FAILED');}
  try{const snapshot=await openedSnapshot(handle);if(snapshot.sha256!==SUPERVISOR_SHA256)fail('CONTAINMENT_HELPER_FAILED');return{handle,snapshot};}catch(error){await handle.close();throw error;}
}
async function inspectPython() {
  let path;try{path=await realpath(PYTHON_LINK);}catch{fail('CONTAINMENT_HELPER_FAILED');}
  if(!isAbsolute(path)||resolve(path)!==path)fail('CONTAINMENT_HELPER_FAILED');
  const named=await lstat(path).catch(()=>fail('CONTAINMENT_HELPER_FAILED'));
  if(!named.isFile()||named.isSymbolicLink()||named.uid!==0||named.nlink<1||(named.mode&0o22)!==0)fail('CONTAINMENT_HELPER_FAILED');
  let handle;try{handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch{fail('CONTAINMENT_HELPER_FAILED');}
  try{return{handle,snapshot:await openedSnapshot(handle)};}catch(error){await handle.close();throw error;}
}
const encodeFrame=(value)=>{const body=Buffer.from(JSON.stringify(value));if(body.length>MAX_FRAME)fail('CONTAINMENT_HELPER_FAILED');const frame=Buffer.allocUnsafe(body.length+4);frame.writeUInt32BE(body.length);body.copy(frame,4);return frame;};
const strictBase64=(value,maximum)=>{if(typeof value!=='string'||value.length>Math.ceil(maximum/3)*4+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))fail('CONTAINMENT_HELPER_FAILED');const result=Buffer.from(value,'base64');if(result.length>maximum||result.toString('base64')!==value)fail('CONTAINMENT_HELPER_FAILED');return result;};

async function startSupervisor(adapterHandle) {
  const helper=await inspectSupervisor(),python=await inspectPython();
  let child;
  try {
    child=spawn('/proc/self/fd/4',['-I','-S','-B','/proc/self/fd/3'],{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore',helper.handle.fd,python.handle.fd,adapterHandle.fd],env:{}});
  } catch { await helper.handle.close();await python.handle.close();fail('CONTAINMENT_HELPER_FAILED'); }
  await helper.handle.close();await python.handle.close();
  let buffer=Buffer.alloc(0),pending=null,closed=false;
  const helperFailure=()=>Object.assign(new Error('CONTAINMENT_HELPER_FAILED'),{code:'CONTAINMENT_HELPER_FAILED'});
  const rejectPending=()=>{if(pending){const reject=pending.reject;pending=null;reject(helperFailure());}};
  child.on('error',rejectPending);child.on('close',()=>{closed=true;rejectPending();});
  child.stdout.on('data',(chunk)=>{
    if(closed)return;buffer=Buffer.concat([buffer,chunk]);
    if(buffer.length<4)return;const length=buffer.readUInt32BE(0);
    if(length<2||length>MAX_FRAME){child.stdin.destroy();rejectPending();return;}
    if(buffer.length<length+4)return;
    if(buffer.length!==length+4||!pending){child.stdin.destroy();rejectPending();return;}
    const body=buffer.subarray(4);buffer=Buffer.alloc(0);let value;
    try{value=JSON.parse(body.toString('utf8'));}catch{child.stdin.destroy();rejectPending();return;}
    const accept=pending.accept;pending=null;accept(value);
  });
  const request=(message)=>new Promise((accept,reject)=>{if(closed||pending)return reject(helperFailure());pending={accept,reject};child.stdin.write(encodeFrame(message),(error)=>{if(error)rejectPending();});});
  const shutdown=async(seq)=>{if(closed)return false;let response;try{response=await request({type:'shutdown',seq});}catch{return false;}if(!response||Object.keys(response).sort().join('|')!=='ok|seq|type'||response.type!=='shutdown'||response.seq!==seq||response.ok!==true)return false;child.stdin.end();return await new Promise(resolve=>{if(closed)return resolve(child.exitCode===0);child.once('close',(code,signal)=>resolve(code===0&&!signal));});};
  return{request,shutdown,child};
}

/** Sole subprocess boundary: one pinned subreaper helper and seven pinned adapter execs. */
export function createG2SecureChildRunner({ totalTimeoutMs = 300_000 } = {}) {
  if (!Number.isInteger(totalTimeoutMs) || totalTimeoutMs < 700 || totalTimeoutMs > 900_000) fail('INVALID_TOTAL_TIME_LIMIT');
  const started=Date.now();let baseline,calls=0,priorPolicy,adapterHandle,supervisor,terminal=false;
  const close=async()=>{if(terminal)return;terminal=true;const clean=supervisor?await supervisor.shutdown(calls+1):true;await adapterHandle?.close().catch(()=>{});adapterHandle=undefined;if(!clean)fail('CONTAINMENT_HELPER_FAILED');};
  return { shellFree:true, async run(spec) {
    if(terminal||!spec||Object.keys(spec).sort().join('|')!=='argv|executable|limits|shell'||spec.shell!==false||calls>=7)fail('INVALID_RUNNER_SPEC');
    if(!Array.isArray(spec.argv)||spec.argv.length===0||spec.argv.some((x)=>typeof x!=='string'||x.includes('\0')))fail('INVALID_RUNNER_SPEC');
    const policy=spec.executable;
    if(!policy||typeof policy.path!=='string'||policy.path!==policy.realpath||resolve(policy.path)!==policy.path||policy.uid!==process.getuid?.()||policy.mode!==0o500)fail('EXECUTABLE_POLICY_MISMATCH');
    if(priorPolicy&&JSON.stringify(policy)!==priorPolicy)fail('EXECUTABLE_PLAN_MISMATCH');priorPolicy=JSON.stringify(policy);
    const current=await inspectAdapter(policy.path);
    try{
      if(current.realpath!==policy.realpath||current.snapshot.sha256!==policy.sha256||current.snapshot.uid!==policy.uid||current.snapshot.mode!==policy.mode)fail('EXECUTABLE_POLICY_MISMATCH');
      if(!baseline){baseline=current.snapshot;adapterHandle=current.handle;supervisor=await startSupervisor(adapterHandle);}else if(!sameFile(baseline,current.snapshot))fail('EXECUTABLE_CHANGED');
      const remaining=totalTimeoutMs-(Date.now()-started),timeoutMs=Math.min(spec.limits.timeoutMs,remaining);if(timeoutMs<1)fail('TOTAL_TIME_LIMIT');
      calls+=1;const seq=calls,response=await supervisor.request({type:'run',seq,argv:spec.argv,timeoutMs,stdoutBytes:spec.limits.stdoutBytes,stderrBytes:spec.limits.stderrBytes});
      if(!response||typeof response!=='object'||response.type!=='result'||response.seq!==seq||typeof response.ok!=='boolean')fail('CONTAINMENT_HELPER_FAILED');
      let result;if(!response.ok){if(Object.keys(response).sort().join('|')!=='code|ok|seq|type'||!['PROCESS_TIMEOUT','STDOUT_LIMIT','STDERR_LIMIT','PROCESS_SPAWN_FAILED','DESCENDANT_CLEANUP_FAILED'].includes(response.code))fail('CONTAINMENT_HELPER_FAILED');fail(response.code);}else{if(Object.keys(response).sort().join('|')!=='exitCode|ok|seq|signal|stderr|stdout|type'||!Number.isInteger(response.exitCode)||response.signal!==null)fail('CONTAINMENT_HELPER_FAILED');result={exitCode:response.exitCode,signal:null,stdout:strictBase64(response.stdout,spec.limits.stdoutBytes),stderr:strictBase64(response.stderr,spec.limits.stderrBytes)};}
      const after=await inspectAdapter(policy.path);try{if(!sameFile(baseline,after.snapshot)||after.realpath!==policy.realpath)fail('EXECUTABLE_CHANGED');}finally{await after.handle.close();}return result;
    } finally {if(current.handle!==adapterHandle)await current.handle.close();}
  }, async finish(){if(calls!==7)fail('INCOMPLETE_OPERATION_EXECUTION');const final=await inspectAdapter(JSON.parse(priorPolicy).path);try{if(!sameFile(baseline,final.snapshot))fail('EXECUTABLE_CHANGED');}finally{await final.handle.close();}await close();},close};
}
