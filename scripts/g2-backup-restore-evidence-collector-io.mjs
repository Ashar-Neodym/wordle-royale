import { constants } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { g2CanonicalJson, g2Sha256 } from './g2-backup-restore-readiness-core.mjs';
import { openG2ProtectedDirectory, readG2ProtectedFile, readG2ProtectedJson, safeG2Id } from './g2-backup-restore-readiness-offline-core.mjs';

export { openG2ProtectedDirectory, readG2ProtectedFile, readG2ProtectedJson };
export const G2_COLLECTOR_COMMIT_SCHEMA='wordle-royale-g2-evidence-collector-commit/v1';
const COMPONENTS=Object.freeze(['evidence','provider-receipt','inventory','eligibility']);
const fail=(code)=>{const error=new Error(code);error.code=code;throw error;};
const infoAt=(root,name)=>lstat(join(root.anchoredPath,name)).catch(()=>undefined);
const owned=(info,expected,nlink)=>Boolean(info?.isFile()&&!info.isSymbolicLink()&&info.uid===process.getuid?.()&&(info.mode&0o777)===0o600&&info.dev===expected.dev&&info.ino===expected.ino&&info.nlink===nlink);
async function assertRootNamed(root){const info=await lstat(root.originalPath).catch(()=>undefined);if(!info?.isDirectory()||info.isSymbolicLink()||info.dev!==root.info.dev||info.ino!==root.info.ino)fail('DIRECTORY_CHANGED');}
async function assertOwned(root,name,expected,nlink,code){if(!owned(await infoAt(root,name),expected,nlink))fail(code);}
async function removeOwned(root,name,expected){if(expected&&owned(await infoAt(root,name),expected,(await infoAt(root,name))?.nlink))await unlink(join(root.anchoredPath,name)).catch(()=>{});}
function names(runId){return { finals:Object.fromEntries(COMPONENTS.map(x=>[x,`${runId}.${x}.json`])),commit:`${runId}.collector-commit.json`};}

export async function reserveG2CollectorOutput(outputRoot,runId){
  safeG2Id(runId); const n=names(runId);
  for(const name of [...Object.values(n.finals),n.commit])if(await infoAt(outputRoot,name))fail('OUTPUT_ALREADY_EXISTS');
  return n;
}

/** Commit-last publication. Candidates are untrusted until the final manifest exists. */
export async function publishG2CollectorBundle({outputRoot,replayRoot,bundle,transactionHook}){
  const runId=safeG2Id(bundle?.challenge?.runId);const nonce=safeG2Id(bundle?.challenge?.nonce);
  if(outputRoot.info.dev===replayRoot.info.dev&&outputRoot.info.ino===replayRoot.info.ino)fail('DIRECTORY_ALIAS');await assertRootNamed(outputRoot);await assertRootNamed(replayRoot);
  const n=await reserveG2CollectorOutput(outputRoot,runId);const token=`${process.pid}.${randomBytes(16).toString('hex')}`;
  const candidates=new Map();const finals=new Map();let marker,markerInfo,markerCreated=false,commit,commitInfo;
  const markerName=`collector-${createHash('sha256').update(nonce).digest('hex')}.used`;const markerPath=join(replayRoot.anchoredPath,markerName);
  const hook=(stage)=>transactionHook?.(stage,{outputRoot,replayRoot,names:n,markerName});
  try{
    for(const component of COMPONENTS){
      const candidateName=`.${runId}.${component}.${token}.candidate`;const value=bundle[component==='provider-receipt'?'providerReceipt':component];const bytes=Buffer.from(`${g2CanonicalJson(value)}\n`);
      const handle=await open(join(outputRoot.anchoredPath,candidateName),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);const info=await handle.stat();
      candidates.set(component,{candidateName,handle,info,bytes,digest:g2Sha256(bytes)});await assertOwned(outputRoot,candidateName,info,1,'OUTPUT_FILE_POLICY');await handle.writeFile(bytes);await handle.sync();await assertOwned(outputRoot,candidateName,info,1,'OUTPUT_CANDIDATE_CHANGED');
    }
    await outputRoot.handle.sync();await hook('candidates-ready');await assertRootNamed(outputRoot);await assertRootNamed(replayRoot);await reserveG2CollectorOutput(outputRoot,runId);
    try{marker=await open(markerPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}catch(error){if(error?.code==='EEXIST')fail('CHALLENGE_REPLAY');throw error;}
    markerCreated=true;markerInfo=await marker.stat();await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_POLICY');await marker.writeFile(`${createHash('sha256').update(nonce).digest('hex')}\n`);await marker.sync();await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');await replayRoot.handle.sync();await hook('replay-consumed');await assertRootNamed(outputRoot);await assertRootNamed(replayRoot);
    for(const component of COMPONENTS){
      const item=candidates.get(component);await assertOwned(outputRoot,item.candidateName,item.info,1,'OUTPUT_CANDIDATE_CHANGED');await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');
      await link(join(outputRoot.anchoredPath,item.candidateName),join(outputRoot.anchoredPath,n.finals[component]));finals.set(component,item.info);await assertOwned(outputRoot,n.finals[component],item.info,2,'OUTPUT_PUBLICATION_RACE');
    }
    const manifest={schemaVersion:G2_COLLECTOR_COMMIT_SCHEMA,runId,files:Object.fromEntries(COMPONENTS.map(x=>[n.finals[x],candidates.get(x).digest]))};
    commit=await open(join(outputRoot.anchoredPath,n.commit),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);commitInfo=await commit.stat();await commit.writeFile(`${g2CanonicalJson(manifest)}\n`);await commit.sync();await assertOwned(outputRoot,n.commit,commitInfo,1,'OUTPUT_PUBLICATION_RACE');await outputRoot.handle.sync();await hook('commit-published');await assertRootNamed(outputRoot);await assertRootNamed(replayRoot);await assertOwned(outputRoot,n.commit,commitInfo,1,'OUTPUT_PUBLICATION_RACE');
    for(const [component,item]of candidates){await assertOwned(outputRoot,item.candidateName,item.info,2,'OUTPUT_PUBLICATION_RACE');await unlink(join(outputRoot.anchoredPath,item.candidateName));await assertOwned(outputRoot,n.finals[component],item.info,1,'OUTPUT_PUBLICATION_RACE');}
    await outputRoot.handle.sync();await assertOwned(outputRoot,n.commit,commitInfo,1,'OUTPUT_PUBLICATION_RACE');await assertOwned(replayRoot,markerName,markerInfo,1,'REPLAY_MARKER_CHANGED');await assertRootNamed(outputRoot);await assertRootNamed(replayRoot);
    return {commit:join(outputRoot.originalPath,n.commit),files:Object.fromEntries(COMPONENTS.map(x=>[x,join(outputRoot.originalPath,n.finals[x])]))};
  }catch(error){
    if(commitInfo)await removeOwned(outputRoot,n.commit,commitInfo);
    for(const [component,item]of candidates){await removeOwned(outputRoot,n.finals[component],item.info);await removeOwned(outputRoot,item.candidateName,item.info);}
    await outputRoot.handle.sync().catch(()=>{});if(markerCreated){await removeOwned(replayRoot,markerName,markerInfo);await replayRoot.handle.sync().catch(()=>{});}throw error;
  }finally{await commit?.close().catch(()=>{});await marker?.close().catch(()=>{});for(const item of candidates.values())await item.handle.close().catch(()=>{});}
}
