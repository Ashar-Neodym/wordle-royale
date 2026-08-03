#!/usr/bin/env node
import { dirname, isAbsolute, resolve } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { collectG2BackupRestoreEvidence } from './g2-backup-restore-evidence-collector-core.mjs';
import { createG2SecureChildRunner } from './g2-backup-restore-evidence-collector-runner.mjs';
import { openG2ProtectedDirectory, publishG2CollectorBundle, readG2ProtectedFile, readG2ProtectedJson, reserveG2CollectorOutput } from './g2-backup-restore-evidence-collector-io.mjs';
import { resolveG2CollectorKey } from './g2-backup-restore-readiness-offline-core.mjs';

const OPTIONS=Object.freeze(['challenge','policy','operation-plan','signing-key','keyring','output-dir','collector-replay-dir']);
const INPUTS=Object.freeze(['challenge','policy','operation-plan','signing-key','keyring']);
const fail=(code)=>{const error=new Error(code);error.code=code;throw error;};
function parse(argv){if(argv.length!==OPTIONS.length*2)fail('CLI_ARGUMENT_INVALID');const values={};for(let i=0;i<argv.length;i+=2){const flag=argv[i],value=argv[i+1],key=flag?.startsWith('--')?flag.slice(2):'';if(!OPTIONS.includes(key)||value===undefined||Object.hasOwn(values,key))fail('CLI_ARGUMENT_INVALID');if(!isAbsolute(value)||resolve(value)!==value||value.includes('\0'))fail('PATH_NOT_ABSOLUTE');values[key]=value;}return values;}
function classify(error){const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]*$/u.test(error.code)?error.code:'COLLECTOR_FAILED';if(code==='CHALLENGE_REPLAY')return{code,status:3};const io=new Set(['DIRECTORY_UNAVAILABLE','DIRECTORY_POLICY','DIRECTORY_DESCRIPTOR_UNAVAILABLE','DIRECTORY_ALIAS','DIRECTORY_CHANGED','OUTPUT_ALREADY_EXISTS','OUTPUT_FILE_POLICY','OUTPUT_CANDIDATE_CHANGED','OUTPUT_PUBLICATION_RACE','REPLAY_MARKER_POLICY','REPLAY_MARKER_CHANGED','EACCES','EDQUOT','EEXIST','EIO','EMFILE','ENFILE','ENOENT','ENOSPC','EPERM','EROFS']);return{code,status:io.has(code)||code.startsWith('ERR_')?4:2};}
let outputRoot,replayRoot;
try{
  const options=parse(process.argv.slice(2));
  const parentRoots=[];try{for(const parent of new Set(INPUTS.map(x=>dirname(options[x]))))parentRoots.push(await openG2ProtectedDirectory(parent));}finally{await Promise.all(parentRoots.map(x=>x.handle.close()));}
  const records=await Promise.all([
    readG2ProtectedJson(options.challenge),readG2ProtectedJson(options.policy),readG2ProtectedJson(options['operation-plan']),
    readG2ProtectedFile(options['signing-key'],16*1024),readG2ProtectedJson(options.keyring),
  ]);
  if(new Set(records.map(x=>`${x.dev}:${x.ino}`)).size!==records.length)fail('INPUT_FILE_ALIAS');
  const [challenge,policy,operationPlan,,keyring]=records.map(x=>x.value);const signingBytes=records[3].bytes;
  // Independently approved public identity is checked both for challenge issuance and now.
  const collectorPublicKey=resolveG2CollectorKey(keyring,challenge.collectorKeyId,challenge.issuedAt);resolveG2CollectorKey(keyring,challenge.collectorKeyId,new Date(Date.now()).toISOString());
  let signingKey;try{signingKey=createPrivateKey(signingBytes);}catch{fail('INVALID_SIGNING_KEY');}
  outputRoot=await openG2ProtectedDirectory(options['output-dir']);replayRoot=await openG2ProtectedDirectory(options['collector-replay-dir']);
  if(outputRoot.info.dev===replayRoot.info.dev&&outputRoot.info.ino===replayRoot.info.ino)fail('DIRECTORY_ALIAS');
  await reserveG2CollectorOutput(outputRoot,challenge.runId);
  const runner=createG2SecureChildRunner();
  const bundle=await collectG2BackupRestoreEvidence({challenge,policy,operationPlan,signingKey,collectorPublicKey,childRunner:runner});await runner.finish();
  const published=await publishG2CollectorBundle({outputRoot,replayRoot,bundle});
  process.stdout.write(`${JSON.stringify({ok:true,decision:'eligible_to_request_G2_approval',runId:challenge.runId,commit:published.commit,files:published.files})}\n`);
}catch(error){const reported=classify(error);process.stderr.write(`${JSON.stringify({ok:false,code:reported.code})}\n`);process.exitCode=reported.status;}finally{await replayRoot?.handle.close().catch(()=>{});await outputRoot?.handle.close().catch(()=>{});}
