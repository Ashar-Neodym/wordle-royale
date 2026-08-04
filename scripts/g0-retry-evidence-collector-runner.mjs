import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalProviderToolJson, sha256ProviderTool, validateProviderToolBundleForExecution, validateProviderToolDescriptor } from './g0-provider-tool-bundle.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const SUPERVISOR=resolve(HERE,'g2-adapter-supervisor.py');
const SUPERVISOR_SHA='sha256:2c49dd99582f70b6f126f4e64218d23f789107ff381664ec16a04cbcb1c59529';
const PYTHON='/usr/bin/python3', MAX_FRAME=1_048_576, MAX_DESCRIPTOR=4096, MAX_CONTEXT=8192;
const ADAPTER_CONTEXT_SCHEMA='wordle-royale-g0-adapter-context/v1';
const fail=(code)=>{const error=new Error(code);error.code=code;throw error;};
const snapshotSame=(a,b)=>['dev','ino','uid','mode','nlink','sha256'].every(k=>a[k]===b[k]);
async function hashHandle(handle){const hash=createHash('sha256');await new Promise((ok,no)=>createReadStream('',{fd:handle.fd,autoClose:false,start:0}).on('data',x=>hash.update(x)).on('error',no).on('end',ok));return `sha256:${hash.digest('hex')}`;}
async function snapshot(handle){const a=await handle.stat(),s={dev:a.dev,ino:a.ino,uid:a.uid,mode:a.mode&0o7777,nlink:a.nlink,sha256:await hashHandle(handle)},b=await handle.stat();if(!b.isFile()||b.dev!==s.dev||b.ino!==s.ino||b.uid!==s.uid||(b.mode&0o7777)!==s.mode||b.nlink!==s.nlink)fail('EXECUTABLE_CHANGED');return s;}
async function inspect(path,kind='adapter'){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||path.includes('\0'))fail(kind==='adapter'?'EXECUTABLE_PATH_INVALID':'CONTAINMENT_HELPER_FAILED');
 const named=await lstat(path).catch(()=>fail(kind==='adapter'?'EXECUTABLE_UNAVAILABLE':'CONTAINMENT_HELPER_FAILED'));
 const adapter=kind==='adapter', helper=kind==='helper', uid=(adapter||helper)?process.getuid?.():0, mode=adapter?0o500:(helper?0o644:null);
 if(!named.isFile()||named.isSymbolicLink()||named.uid!==uid||((adapter||helper)?(named.nlink!==1||(named.mode&0o7777)!==mode):(named.nlink<1||(named.mode&0o22)!==0)))fail(adapter?'EXECUTABLE_POLICY_MISMATCH':'CONTAINMENT_HELPER_FAILED');
 let handle;try{handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}catch{fail(adapter?'EXECUTABLE_CHANGED':'CONTAINMENT_HELPER_FAILED');}
 try{return{handle,snapshot:await snapshot(handle),realpath:await realpath(path)};}catch(e){await handle.close();throw e;}
}
const frame=value=>{const body=Buffer.from(JSON.stringify(value));if(body.length>MAX_FRAME)fail('CONTAINMENT_HELPER_FAILED');const out=Buffer.alloc(body.length+4);out.writeUInt32BE(body.length);body.copy(out,4);return out;};
const strictBase64=(value,max)=>{if(typeof value!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))fail('CONTAINMENT_HELPER_FAILED');const out=Buffer.from(value,'base64');if(out.length>max||out.toString('base64')!==value)fail('CONTAINMENT_HELPER_FAILED');return out;};
async function start(adapterFd){
 const helper=await inspect(SUPERVISOR,'helper');if(helper.snapshot.sha256!==SUPERVISOR_SHA){await helper.handle.close();fail('CONTAINMENT_HELPER_FAILED');}
 let pythonPath;try{pythonPath=await realpath(PYTHON);}catch{fail('CONTAINMENT_HELPER_FAILED');}const python=await inspect(pythonPath,'python');
 let child;try{child=spawn('/proc/self/fd/4',['-I','-S','-B','/proc/self/fd/3'],{shell:false,stdio:['pipe','pipe','ignore',helper.handle.fd,python.handle.fd,adapterFd],env:{}});}catch{await helper.handle.close();await python.handle.close();fail('CONTAINMENT_HELPER_FAILED');}await helper.handle.close();await python.handle.close();
 let buffer=Buffer.alloc(0),pending,closed=false;const broken=()=>Object.assign(new Error('CONTAINMENT_HELPER_FAILED'),{code:'CONTAINMENT_HELPER_FAILED'});const reject=()=>{if(pending){const x=pending;pending=undefined;x.reject(broken());}};
 child.on('error',reject);child.on('close',()=>{closed=true;reject();});child.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length<4)return;const length=buffer.readUInt32BE();if(length<2||length>MAX_FRAME||buffer.length!==length+4||!pending){child.stdin.destroy();return reject();}let value;try{value=JSON.parse(buffer.subarray(4).toString('utf8'));}catch{return reject();}buffer=Buffer.alloc(0);const x=pending;pending=undefined;x.resolve(value);});
 const request=message=>new Promise((resolve,rejectFn)=>{if(closed||pending)return rejectFn(broken());pending={resolve,reject:rejectFn};child.stdin.write(frame(message),e=>{if(e)reject();});});
 return{request,async close(seq){if(closed)return false;let r;try{r=await request({type:'shutdown',seq});}catch{return false;}if(JSON.stringify(r)!==JSON.stringify({ok:true,seq,type:'shutdown'}))return false;child.stdin.end();return new Promise(ok=>child.once('close',(code,signal)=>ok(code===0&&!signal)));}};
}
function policyFields(policy){if(!policy||Object.keys(policy).sort().join('|')!=='path|realpath|sha256|version'||typeof policy.version!=='string'||policy.version.length<1||policy.version.length>200||!/^[\x20-\x7e]+$/u.test(policy.version)||policy.path!==policy.realpath||!/^sha256:[a-f0-9]{64}$/u.test(policy.sha256))fail('EXECUTABLE_PLAN_INVALID');}
export function createG0RetryAdapterRunner({totalTimeoutMs=30_000,toolBundleValidator=validateProviderToolBundleForExecution}={}){
 if(!Number.isInteger(totalTimeoutMs)||totalTimeoutMs<300||totalTimeoutMs>900_000)fail('INVALID_TOTAL_TIME_LIMIT');
 if(typeof toolBundleValidator!=='function')fail('TOOL_VALIDATOR_INVALID');
 const begun=Date.now(),seen=new Set();let closed=false;
 return{async run({provider,executable,tool,argv,limits,issuedAt,observationDeadline}){
  if(closed||!['vercel','railway','supabase'].includes(provider)||seen.has(provider))fail('INVALID_RUNNER_SPEC');seen.add(provider);policyFields(executable);
  if(!Array.isArray(argv)||argv.some(x=>typeof x!=='string'||x.includes('\0')))fail('INVALID_RUNNER_SPEC');for(const x of ['timeoutMs','stdoutBytes','stderrBytes'])if(!Number.isInteger(limits?.[x])||limits[x]<1||limits[x]>1_048_576)fail('INVALID_RUNNER_LIMITS');
  let descriptorBytes,descriptorDigest,contextBytes,contextDigest;
  if(tool!==undefined){
   validateProviderToolDescriptor(tool,provider);descriptorBytes=Buffer.from(`${canonicalProviderToolJson(tool)}\n`,'utf8');if(descriptorBytes.length>MAX_DESCRIPTOR)fail('TOOL_DESCRIPTOR_SIZE_INVALID');descriptorDigest=sha256ProviderTool(descriptorBytes);
   if(issuedAt!==undefined||observationDeadline!==undefined){const valid=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x)&&new Date(x).toISOString()===x;if(!valid(issuedAt)||!valid(observationDeadline)||Date.parse(issuedAt)>Date.parse(observationDeadline))fail('OBSERVATION_WINDOW_INVALID');const context={schemaVersion:ADAPTER_CONTEXT_SCHEMA,toolDescriptor:tool,issuedAt,observationDeadline};contextBytes=Buffer.from(`${canonicalProviderToolJson(context)}\n`,'utf8');if(contextBytes.length>MAX_CONTEXT)fail('ADAPTER_CONTEXT_SIZE_INVALID');contextDigest=sha256ProviderTool(contextBytes);}
  }
  const opened=await inspect(executable.path);let supervisor;
  const execute=async()=>{try{
   if(opened.realpath!==executable.realpath||opened.snapshot.uid!==process.getuid?.()||opened.snapshot.mode!==0o500||opened.snapshot.nlink!==1||opened.snapshot.sha256!==executable.sha256)fail('EXECUTABLE_POLICY_MISMATCH');
   supervisor=await start(opened.handle.fd);const remaining=totalTimeoutMs-(Date.now()-begun),timeoutMs=Math.min(remaining,limits.timeoutMs);if(timeoutMs<1)fail('TOTAL_TIME_LIMIT');
   const request={type:'run',seq:1,argv,timeoutMs,stdoutBytes:limits.stdoutBytes,stderrBytes:limits.stderrBytes};if(contextBytes){request.adapterContext=contextBytes.toString('base64');request.adapterContextSha256=contextDigest;}else if(descriptorBytes){request.toolDescriptor=descriptorBytes.toString('base64');request.toolDescriptorSha256=descriptorDigest;}
   const response=await supervisor.request(request);if(!response||response.type!=='result'||response.seq!==1||typeof response.ok!=='boolean')fail('CONTAINMENT_HELPER_FAILED');if(!response.ok){if(!['PROCESS_TIMEOUT','STDOUT_LIMIT','STDERR_LIMIT','PROCESS_SPAWN_FAILED','DESCENDANT_CLEANUP_FAILED'].includes(response.code))fail('CONTAINMENT_HELPER_FAILED');fail(response.code);}if(Object.keys(response).sort().join('|')!=='exitCode|ok|seq|signal|stderr|stdout|type'||!Number.isInteger(response.exitCode)||response.signal!==null)fail('CONTAINMENT_HELPER_FAILED');const stdout=strictBase64(response.stdout,limits.stdoutBytes),stderr=strictBase64(response.stderr,limits.stderrBytes);if(response.exitCode!==0)fail('ADAPTER_NONZERO_EXIT');if(stderr.length)fail('ADAPTER_STDERR_FORBIDDEN');const after=await inspect(executable.path);try{if(after.realpath!==opened.realpath||!snapshotSame(after.snapshot,opened.snapshot))fail('EXECUTABLE_CHANGED');}finally{await after.handle.close();}if(!await supervisor.close(2))fail('CONTAINMENT_HELPER_FAILED');supervisor=undefined;return stdout;
  }finally{if(supervisor){await supervisor.close(2).catch(()=>{});supervisor=undefined;}}};
  try{if(!tool)return await execute();let executed=false,result;await toolBundleValidator({descriptor:tool,expectedProvider:provider,betweenSnapshots:async()=>{if(executed)fail('TOOL_VALIDATOR_INVALID');executed=true;result=await execute();return result;}});if(!executed)fail('TOOL_VALIDATOR_INVALID');return result;}finally{await opened.handle.close();}
 },async finish(){if(seen.size!==3)fail('INCOMPLETE_ADAPTER_EXECUTION');closed=true;},async close(){closed=true;}};
}
