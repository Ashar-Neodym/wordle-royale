import { constants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJson, sha256 } from './g0-retry-eligibility-core.mjs';
export { openG2ProtectedDirectory as openG0ProtectedDirectory, readG2ProtectedFile as readG0ProtectedFile, readG2ProtectedJson as readG0ProtectedJson, parseG2StrictJson as parseG0StrictJson } from './g2-backup-restore-readiness-offline-core.mjs';

export const G0_RETRY_COMMIT_SCHEMA='wordle-royale-g0-retry-evidence-collector-commit/v1';
const NAMES=Object.freeze({challenge:'challenge.json',evidence:'evidence.json',providerReceipt:'provider-receipt.json',eligibilityPreview:'eligibility-preview.json'}), COMMIT='commit-manifest.json';
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const at=(root,name)=>lstat(join(root.anchoredPath,name)).catch(()=>undefined);
const owned=(x,w,n)=>Boolean(x?.isFile()&&!x.isSymbolicLink()&&x.uid===process.getuid?.()&&(x.mode&0o777)===0o600&&x.dev===w.dev&&x.ino===w.ino&&x.nlink===n);
async function rootSame(root){const x=await lstat(root.originalPath).catch(()=>undefined);if(!x?.isDirectory()||x.isSymbolicLink()||x.dev!==root.info.dev||x.ino!==root.info.ino)fail('DIRECTORY_CHANGED');}
async function assertOwned(root,name,w,n,code){if(!owned(await at(root,name),w,n))fail(code);}
async function removeOwned(root,name,w){const x=await at(root,name);if(w&&x?.isFile()&&x.dev===w.dev&&x.ino===w.ino)await unlink(join(root.anchoredPath,name)).catch(()=>{});}
export async function reserveG0RetryOutput(root){for(const name of [...Object.values(NAMES),COMMIT])if(await at(root,name))fail('OUTPUT_ALREADY_EXISTS');}
/** Candidate-first, replay-second, fixed finals, and trusted manifest last. */
export async function publishG0RetryBundle({outputRoot,replayRoot,bundle,transactionHook}){
 if(outputRoot.info.dev===replayRoot.info.dev&&outputRoot.info.ino===replayRoot.info.ino)fail('DIRECTORY_ALIAS');await rootSame(outputRoot);await rootSame(replayRoot);await reserveG0RetryOutput(outputRoot);
 const token=`${process.pid}.${randomBytes(16).toString('hex')}`, candidates=new Map();let marker,markerInfo,markerCreated=false,commit,commitInfo;
 const markerName=`g0-retry-${createHash('sha256').update(bundle.challenge.nonce).digest('hex')}.used`, hook=x=>transactionHook?.(x,{outputRoot,replayRoot,names:NAMES,commit:COMMIT,markerName});
 try{
  for(const [component,name] of Object.entries(NAMES)){const value=bundle[component];if(component==='eligibilityPreview'&&value===undefined)continue;const candidateName=`.${name}.${token}.candidate`,bytes=Buffer.from(`${canonicalJson(value)}\n`),handle=await open(join(outputRoot.anchoredPath,candidateName),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600),info=await handle.stat();candidates.set(component,{candidateName,handle,info,bytes,digest:sha256(bytes)});await assertOwned(outputRoot,candidateName,info,1,'OUTPUT_FILE_POLICY');await handle.writeFile(bytes);await handle.sync();await assertOwned(outputRoot,candidateName,info,1,'OUTPUT_CANDIDATE_CHANGED');}
  await outputRoot.handle.sync();await hook('candidates-ready');await rootSame(outputRoot);await rootSame(replayRoot);await reserveG0RetryOutput(outputRoot);
  try{marker=await open(join(replayRoot.anchoredPath,markerName),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(e){if(e?.code==='EEXIST')fail('CHALLENGE_REPLAY');throw e;}markerCreated=true;markerInfo=await marker.stat();await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_POLICY');await marker.writeFile(`${createHash('sha256').update(bundle.challenge.nonce).digest('hex')}\n`);await marker.sync();await replayRoot.handle.sync();await hook('replay-reserved');
  await rootSame(outputRoot);await rootSame(replayRoot);for(const [component,item] of candidates){await assertOwned(outputRoot,item.candidateName,item.info,1,'OUTPUT_CANDIDATE_CHANGED');await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');await link(join(outputRoot.anchoredPath,item.candidateName),join(outputRoot.anchoredPath,NAMES[component]));await assertOwned(outputRoot,NAMES[component],item.info,2,'OUTPUT_PUBLICATION_RACE');}
  for(const [component,item] of candidates){await assertOwned(outputRoot,item.candidateName,item.info,2,'OUTPUT_PUBLICATION_RACE');await unlink(join(outputRoot.anchoredPath,item.candidateName));await assertOwned(outputRoot,NAMES[component],item.info,1,'OUTPUT_PUBLICATION_RACE');}await outputRoot.handle.sync();await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');
  const manifest={schemaVersion:G0_RETRY_COMMIT_SCHEMA,runId:bundle.challenge.runId,nonceDigest:sha256(bundle.challenge.nonce),files:Object.fromEntries([...candidates].map(([c,x])=>[NAMES[c],x.digest]))};
  commit=await open(join(outputRoot.anchoredPath,COMMIT),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);commitInfo=await commit.stat();await commit.writeFile(`${canonicalJson(manifest)}\n`);await commit.sync();await assertOwned(outputRoot,COMMIT,commitInfo,1,'OUTPUT_PUBLICATION_RACE');await outputRoot.handle.sync();await hook('commit-published');await rootSame(outputRoot);await rootSame(replayRoot);await assertOwned(outputRoot,COMMIT,commitInfo,1,'OUTPUT_PUBLICATION_RACE');for(const [component,item] of candidates)await assertOwned(outputRoot,NAMES[component],item.info,1,'OUTPUT_PUBLICATION_RACE');await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');
  return{commit:join(outputRoot.originalPath,COMMIT),files:Object.fromEntries([...candidates].map(([c])=>[c,join(outputRoot.originalPath,NAMES[c])]))};
 }catch(error){if(commitInfo)await removeOwned(outputRoot,COMMIT,commitInfo);for(const [component,item] of candidates){await removeOwned(outputRoot,NAMES[component],item.info);await removeOwned(outputRoot,item.candidateName,item.info);}await outputRoot.handle.sync().catch(()=>{});if(markerCreated){await removeOwned(replayRoot,markerName,markerInfo);await replayRoot.handle.sync().catch(()=>{});}throw error;}finally{await commit?.close().catch(()=>{});await marker?.close().catch(()=>{});for(const x of candidates.values())await x.handle.close().catch(()=>{});}
}
