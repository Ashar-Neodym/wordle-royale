#!/usr/bin/python3
"""Closed stdlib-only AO installer; privileged execution is only from a sealed capsule."""
from __future__ import annotations
import argparse, ctypes, errno, hashlib, json, os, re, secrets, stat, sys
from pathlib import Path

SCHEMA="wordle-royale-g0-root-installation-receipt/v1"
REPRO_SCHEMA="wordle-royale-g0-provider-bundle-reproducibility/v1"
REVISION="6cc4944a6f4051d5aa72edd6eb7e0a9b2e2e941f"
EVIDENCE=Path("/home/ashar/.hermes/profiles/athena/tools/wordle-g0-provider-bundle-repro-6cc4944a6f40")
RECEIPT_SHA="sha256:9549f6e16757a7ea044559c96de95badfe26873ab0b836c4ec0b0156ab1a1288"
DEST_PARENT=Path("/opt/wordle-royale"); DEST_NAME="g0-provider-tools"
CAPSULE=Path("/opt/wordle-royale/installer-tools/ao-v1/g0-root-immutable-installer.py")
APPROVAL="INSTALL THE THREE VERIFIED G0 PROVIDER BUNDLES ROOT-OWNED IMMUTABLE"
PROVIDERS=("vercel","railway","supabase")
ARTIFACTS={"vercel":"vercel-58.4.4","railway":"railway-5.30.1","supabase":"supabase-2.110.0"}
MEMBERS=("COMMIT","acquisition-record.json","bundle","bundle.tree-manifest.json","descriptor.json","install-plan.json","publication-index.json")
META=("COMMIT","acquisition-record.json","descriptor.json","install-plan.json","publication-index.json")
MAX_JSON=256*1024; MAX_MANIFEST=4*1024*1024; MAX_NODES=10000; MAX_BYTES=600*1024*1024
RENAME_NOREPLACE=1; libc=ctypes.CDLL(None,use_errno=True); SHA=re.compile(r"^sha256:[a-f0-9]{64}$")

class InstallError(RuntimeError): pass
def fail(code): raise InstallError(code)
def canonical(x): return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False,allow_nan=False)+"\n").encode()
def digest(b): return "sha256:"+hashlib.sha256(b).hexdigest()
def mode(st): return stat.S_IMODE(st.st_mode)
def exact(x,keys,code):
    if not isinstance(x,dict) or set(x)!=set(keys): fail(code)
def safe_name(s):
    if not isinstance(s,str) or not s or s in (".","..") or "/" in s or "\0" in s or len(os.fsencode(s))>255: fail("PATH_INVALID")
def valid_rel(s):
    if s==".": return
    if not isinstance(s,str) or not s or s.startswith("/") or "\\" in s or "\0" in s or len(s.encode())>1024 or any(x in ("",".","..") or len(x.encode())>255 for x in s.split("/")): fail("MANIFEST_PATH_INVALID")
def xattr_free(fd):
    try: attrs=os.listxattr(fd)
    except (TypeError,NotImplementedError): fail("XATTR_API_UNAVAILABLE")
    except OSError as e:
        if e.errno in (errno.ENOTSUP,errno.EOPNOTSUPP): fail("XATTR_API_UNAVAILABLE")
        raise
    if attrs: fail("XATTR_FORBIDDEN")
def open_dir_at(parent_fd,name):
    safe_name(name)
    try: return os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME,dir_fd=parent_fd)
    except OSError as e:
        if e.errno in (errno.EPERM,errno.EINVAL,errno.EOPNOTSUPP): fail("O_NOATIME_REQUIRED")
        raise
def names(fd):
    out=os.listdir(fd)
    for n in out: safe_name(n)
    if len(out)!=len(set(out)): fail("PATH_COLLISION")
    return sorted(out,key=lambda x:x.encode())
def ident(st): return (st.st_dev,st.st_ino,st.st_mode,st.st_nlink,st.st_uid,st.st_gid,st.st_size,st.st_atime_ns,st.st_mtime_ns,st.st_ctime_ns)
def parse_json(b,code,cap=MAX_JSON):
    if not isinstance(b,bytes) or len(b)<3 or len(b)>cap: fail(code)
    try:
        text=b.decode("utf-8","strict")
        def pairs(items):
            out={}
            for k,v in items:
                if k in out: fail(code+"_DUPLICATE_KEY")
                out[k]=v
            return out
        value=json.loads(text,object_pairs_hook=pairs,parse_float=lambda _: fail(code),parse_constant=lambda _: fail(code))
    except InstallError: raise
    except Exception: fail(code)
    if canonical(value)!=b: fail(code+"_NON_CANONICAL")
    return value
def read_file_at(parent_fd,name,cap=MAX_JSON):
    safe_name(name)
    try: fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME,dir_fd=parent_fd)
    except OSError as e:
        if e.errno in (errno.EPERM,errno.EINVAL,errno.EOPNOTSUPP): fail("O_NOATIME_REQUIRED")
        raise
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1: fail("FILE_POLICY")
        xattr_free(fd); chunks=[]; total=0
        while True:
            b=os.read(fd,131072)
            if not b: break
            total+=len(b)
            if total>cap: fail("FILE_SIZE_LIMIT")
            chunks.append(b)
        after=os.fstat(fd)
        if ident(before)!=ident(after): fail("FILESYSTEM_CHANGED")
        return b"".join(chunks),before
    finally: os.close(fd)
def write_all(fd,data):
    view=memoryview(data)
    while view:
        n=os.write(fd,view)
        if not isinstance(n,int) or n<=0: fail("DESTINATION_SHORT_WRITE")
        view=view[n:]
def write_new(parent_fd,name,data,file_mode):
    safe_name(name); fd=os.open(name,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NOATIME,0o600,dir_fd=parent_fd)
    try:
        write_all(fd,data); os.fchmod(fd,file_mode); os.fsync(fd); xattr_free(fd)
        before=os.fstat(fd)
        if before.st_nlink!=1 or before.st_size!=len(data): fail("DESTINATION_FILE_POLICY")
        os.lseek(fd,0,os.SEEK_SET); h=hashlib.sha256(); total=0
        while True:
            b=os.read(fd,131072)
            if not b: break
            h.update(b); total+=len(b)
        if total!=len(data) or "sha256:"+h.hexdigest()!=digest(data) or ident(before)!=ident(os.fstat(fd)): fail("DESTINATION_REREAD_MISMATCH")
    finally: os.close(fd)
def mkdir_new(parent_fd,name): safe_name(name); os.mkdir(name,0o700,dir_fd=parent_fd); return open_dir_at(parent_fd,name)
def fsync_dir(fd): os.fsync(fd)
def rename_noreplace(parent_fd,old,new):
    fn=getattr(libc,"renameat2",None)
    if fn is None: fail("RENAME_NOREPLACE_UNAVAILABLE")
    if fn(parent_fd,os.fsencode(old),parent_fd,os.fsencode(new),RENAME_NOREPLACE):
        e=ctypes.get_errno()
        if e==errno.EEXIST: return False
        fail("RENAME_NOREPLACE_FAILED_"+str(e))
    return True

def manifest_schema(m):
    exact(m,("entries","schemaVersion"),"MANIFEST_INVALID")
    if m["schemaVersion"]!="wordle-royale-provider-tool-tree-manifest/v1" or not isinstance(m["entries"],list) or not 1<=len(m["entries"])<=MAX_NODES: fail("MANIFEST_INVALID")
    paths=[]
    for e in m["entries"]:
        if not isinstance(e,dict) or e.get("type") not in ("directory","file"): fail("MANIFEST_INVALID")
        exact(e,("mode","path","type") if e["type"]=="directory" else ("mode","path","sha256","type"),"MANIFEST_INVALID")
        valid_rel(e["path"]); paths.append(e["path"])
        if e["type"]=="directory" and e["mode"]!=0o555: fail("MANIFEST_INVALID")
        if e["type"]=="file" and (e["mode"] not in (0o444,0o555) or not isinstance(e["sha256"],str) or not SHA.fullmatch(e["sha256"])): fail("MANIFEST_INVALID")
    if paths!=sorted(paths,key=lambda x:x.encode()) or len(paths)!=len(set(paths)) or paths[0]!=".": fail("MANIFEST_DUPLICATE_OR_ORDER_INVALID")
    pathset=set(paths)
    for p in paths[1:]:
        parent=p.rpartition("/")[0] or "."
        if parent not in pathset: fail("MANIFEST_PARENT_MISSING")

def descriptor_schema(d,provider,artifact,manifest_hash):
    exact(d,("bundleRealpath","bundleRoot","distribution","entrypoint","entrypointSha256","invocationProfile","invocationProfileSha256","lockfileSha256","nativeBinary","package","packageJsonSha256","runtime","schemaVersion","sessionMode","treeManifestSha256","version"),"DESCRIPTOR_INVALID")
    root=f"/opt/wordle-royale/g0-provider-tools/{artifact}"
    if d["schemaVersion"]!="wordle-royale-provider-tool/v1" or d["bundleRoot"]!=root or d["bundleRealpath"]!=root or d["version"]!=artifact[len(provider)+1:] or d["treeManifestSha256"]!=manifest_hash or d["distribution"]!="official_npm_cli" or d["sessionMode"]!="standard_os_user_session": fail("DESCRIPTOR_BINDING_INVALID")
    for k in ("entrypointSha256","invocationProfileSha256","lockfileSha256","packageJsonSha256","treeManifestSha256"):
        if not isinstance(d[k],str) or not SHA.fullmatch(d[k]): fail("DESCRIPTOR_INVALID")
    exact(d["runtime"],("path","realpath","sha256","version"),"DESCRIPTOR_INVALID")
    if d["runtime"]["path"]!="/usr/bin/node" or d["runtime"]["realpath"]!="/usr/bin/node" or not SHA.fullmatch(d["runtime"]["sha256"]): fail("DESCRIPTOR_INVALID")
    if d["nativeBinary"] is not None:
        exact(d["nativeBinary"],("package","packageJsonSha256","path","sha256","version"),"DESCRIPTOR_INVALID")
        if not SHA.fullmatch(d["nativeBinary"]["sha256"]) or not SHA.fullmatch(d["nativeBinary"]["packageJsonSha256"]): fail("DESCRIPTOR_INVALID")

def acquisition_schema(a):
    exact(a,("acquisitionInputs","canonicalSourceSnapshotSha256","networkPolicy","npmPolicy","railwayNativePolicy","schemaVersion","target","toolchain"),"ACQUISITION_INVALID")
    if a["schemaVersion"]!="wordle-royale-g0-acquisition-record/v1" or not SHA.fullmatch(a["canonicalSourceSnapshotSha256"]): fail("ACQUISITION_INVALID")
    exact(a["acquisitionInputs"],("lockfile","packageJson"),"ACQUISITION_INVALID")
    for x in a["acquisitionInputs"].values(): exact(x,("path","sha256"),"ACQUISITION_INVALID"); SHA.fullmatch(x["sha256"]) or fail("ACQUISITION_INVALID")
    exact(a["target"],("cpu","libc","os"),"ACQUISITION_INVALID")
    if a["target"]!={"cpu":"x64","libc":"glibc","os":"linux"}: fail("ACQUISITION_INVALID")
    exact(a["networkPolicy"],("allowedDnsOnly","allowedHttpOrigins","ambientCredentialsAllowed","ambientProxyAllowed","railwayAssetUrl","registryTlsOnly"),"ACQUISITION_INVALID")
    exact(a["npmPolicy"],("audit","fund","ignoreScripts","installOperation"),"ACQUISITION_INVALID")
    exact(a["railwayNativePolicy"],("archiveEntry","archiveMaxBytes","binaryMaxBytes","binaryMode","binarySha256","lifecycleScriptsExecuted","providerExecuted"),"ACQUISITION_INVALID")
    exact(a["toolchain"],("node","npm","python","railwayNativeHelper"),"ACQUISITION_INVALID")
    for k,v in a["toolchain"].items(): exact(v,("path","sha256") if k=="railwayNativeHelper" else ("path","realpath","sha256","version"),"ACQUISITION_INVALID"); SHA.fullmatch(v["sha256"]) or fail("ACQUISITION_INVALID")

def expected_plan(artifact):
    m=f"/opt/wordle-royale/g0-provider-tools/metadata/{artifact}"; b=f"/opt/wordle-royale/g0-provider-tools/{artifact}"
    return {"artifactId":artifact,"destinations":{"acquisitionRecord":f"{m}/acquisition-record.json","bundleRoot":b,"commit":f"{m}/COMMIT","descriptor":f"{m}/descriptor.json","installPlan":f"{m}/install-plan.json","publicationIndex":f"{m}/publication-index.json","treeManifest":f"{b}.tree-manifest.json"},"privilegedExecutionAuthorized":False,"productionValidation":{"descriptorSource":"descriptor.json","expectedArtifactId":artifact,"validatorExport":"validateProviderToolBundleForExecution","validatorModule":"scripts/g0-provider-tool-bundle.mjs"},"publicationPolicy":{"atomicNoReplaceRequired":True,"copyRegularFilesRequired":True,"hardlinksForbidden":True,"safeRootOwnedAncestryRequired":True,"separateHumanApprovalRequired":True},"requiredMetadata":{"directoryMode":365,"fileMode":292,"gid":0,"uid":0},"schemaVersion":"wordle-royale-g0-inert-install-plan/v1","sources":{"acquisitionRecord":"acquisition-record.json","bundleRoot":"bundle","commit":"COMMIT","descriptor":"descriptor.json","installPlan":"install-plan.json","publicationIndex":"publication-index.json","treeManifest":"bundle.tree-manifest.json"}}
def validate_documents(files,provider,artifact,revision):
    manifest=parse_json(files["bundle.tree-manifest.json"],"MANIFEST_INVALID",MAX_MANIFEST); manifest_schema(manifest); mh=digest(files["bundle.tree-manifest.json"])
    desc=parse_json(files["descriptor.json"],"DESCRIPTOR_INVALID"); descriptor_schema(desc,provider,artifact,mh)
    acq=parse_json(files["acquisition-record.json"],"ACQUISITION_INVALID"); acquisition_schema(acq)
    plan=parse_json(files["install-plan.json"],"PLAN_INVALID")
    if plan!=expected_plan(artifact): fail("PLAN_BINDING_INVALID")
    idx=parse_json(files["publication-index.json"],"INDEX_INVALID"); exact(idx,("artifactId","canonicalSourceSnapshotSha256","members","schemaVersion","sourceRevision"),"INDEX_INVALID")
    expected_members={"acquisitionRecord":{"mode":256,"path":"acquisition-record.json","sha256":digest(files["acquisition-record.json"])},"bundle":{"path":"bundle","treeManifestSha256":mh},"descriptor":{"mode":256,"path":"descriptor.json","sha256":digest(files["descriptor.json"])},"installPlan":{"mode":256,"path":"install-plan.json","sha256":digest(files["install-plan.json"])},"treeManifest":{"mode":256,"path":"bundle.tree-manifest.json","sha256":mh}}
    if idx!={"artifactId":artifact,"canonicalSourceSnapshotSha256":acq["canonicalSourceSnapshotSha256"],"members":expected_members,"schemaVersion":"wordle-royale-g0-local-publication-index/v1","sourceRevision":revision}: fail("INDEX_BINDING_INVALID")
    commit=parse_json(files["COMMIT"],"COMMIT_INVALID")
    if commit!={"publicationIndexSha256":digest(files["publication-index.json"]),"schemaVersion":"wordle-royale-g0-local-publication-commit/v1"}: fail("COMMIT_BINDING_INVALID")
    return manifest

def scan_bundle(fd,manifest=None):
    expected={e["path"]:e for e in manifest["entries"]} if manifest else None; seen=set(); ids=set(); entries=[]; total=0
    def walk(df,rel):
        nonlocal total
        before=os.fstat(df); xattr_free(df)
        if not stat.S_ISDIR(before.st_mode) or mode(before)!=0o555: fail("BUNDLE_DIRECTORY_POLICY")
        e={"mode":365,"path":rel,"type":"directory"}; entries.append(e); seen.add(rel)
        before_names=names(df)
        for n in before_names:
            child=n if rel=="." else rel+"/"+n
            cfd=os.open(n,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME,dir_fd=df)
            try:
                st=os.fstat(cfd)
                if stat.S_ISDIR(st.st_mode): walk(cfd,child)
                elif stat.S_ISREG(st.st_mode):
                    if st.st_nlink!=1 or (st.st_dev,st.st_ino) in ids: fail("BUNDLE_HARDLINK_FORBIDDEN")
                    ids.add((st.st_dev,st.st_ino)); xattr_free(cfd); h=hashlib.sha256(); size=0
                    while True:
                        b=os.read(cfd,131072)
                        if not b: break
                        h.update(b); size+=len(b)
                    if ident(st)!=ident(os.fstat(cfd)): fail("FILESYSTEM_CHANGED")
                    total+=size; ent={"mode":mode(st),"path":child,"sha256":"sha256:"+h.hexdigest(),"type":"file"}; entries.append(ent); seen.add(child)
                else: fail("BUNDLE_SPECIAL_FILE_FORBIDDEN")
            finally: os.close(cfd)
        if names(df)!=before_names or ident(before)!=ident(os.fstat(df)): fail("FILESYSTEM_CHANGED")
    walk(fd,".")
    entries.sort(key=lambda e:e["path"].encode())
    if total>MAX_BYTES or len(entries)>MAX_NODES: fail("BUNDLE_LIMIT")
    if expected is not None and (seen!=set(expected) or entries!=manifest["entries"]): fail("MANIFEST_TREE_MISMATCH")
    return entries,total

def copy_bundle(srcfd,dstfd,manifest,owner,inject=None):
    expected={e["path"]:e for e in manifest["entries"]}; seen=set(); ids=set(); nodes=0; total=0
    def walk(sf,df,rel):
        nonlocal nodes,total
        if inject: inject("before-directory",rel)
        sst=os.fstat(sf); xattr_free(sf)
        if expected.get(rel)!={"mode":365,"path":rel,"type":"directory"} or mode(sst)!=0o555: fail("MANIFEST_TREE_MISMATCH")
        seen.add(rel); nodes+=1; before_names=names(sf)
        for n in before_names:
            child=n if rel=="." else rel+"/"+n; cfd=os.open(n,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME,dir_fd=sf)
            try:
                st=os.fstat(cfd); e=expected.get(child)
                if stat.S_ISDIR(st.st_mode):
                    dfd=mkdir_new(df,n)
                    try: walk(cfd,dfd,child); os.fchmod(dfd,0o555); fsync_dir(dfd)
                    finally: os.close(dfd)
                elif stat.S_ISREG(st.st_mode):
                    if st.st_nlink!=1 or (st.st_dev,st.st_ino) in ids or not e or e.get("type")!="file" or mode(st)!=e.get("mode"): fail("SOURCE_FILE_POLICY")
                    ids.add((st.st_dev,st.st_ino)); xattr_free(cfd); out=os.open(n,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NOATIME,0o600,dir_fd=df)
                    try:
                        size=0
                        while True:
                            b=os.read(cfd,131072)
                            if not b: break
                            write_all(out,b); size+=len(b)
                        if ident(st)!=ident(os.fstat(cfd)): fail("SOURCE_CHANGED")
                        os.fchmod(out,e["mode"]); os.fsync(out); xattr_free(out); ost=os.fstat(out); os.lseek(out,0,0); h=hashlib.sha256(); reread=0
                        while True:
                            b=os.read(out,131072)
                            if not b: break
                            h.update(b); reread+=len(b)
                        if reread!=size or "sha256:"+h.hexdigest()!=e["sha256"] or ost.st_nlink!=1 or ident(ost)!=ident(os.fstat(out)): fail("DESTINATION_REREAD_MISMATCH")
                    finally: os.close(out)
                    seen.add(child); nodes+=1; total+=size
                else: fail("SOURCE_SPECIAL_FILE_FORBIDDEN")
            finally: os.close(cfd)
        if names(sf)!=before_names or ident(sst)!=ident(os.fstat(sf)): fail("SOURCE_CHANGED")
        if inject: inject("after-directory",rel)
    walk(srcfd,dstfd,".")
    if seen!=set(expected) or total>MAX_BYTES: fail("MANIFEST_TREE_MISMATCH")
    return {"bytes":total,"nodes":nodes}

def evidence_inventory(rootfd):
    rows=[]
    def walk(fd,rel):
        st=os.fstat(fd); rows.append((rel,"d",ident(st)))
        ns=names(fd)
        for n in ns:
            p=n if not rel else rel+"/"+n; c=os.open(n,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME,dir_fd=fd)
            try:
                s=os.fstat(c)
                if stat.S_ISDIR(s.st_mode): walk(c,p)
                elif stat.S_ISREG(s.st_mode):
                    h=hashlib.sha256()
                    while True:
                        b=os.read(c,131072)
                        if not b: break
                        h.update(b)
                    rows.append((p,"f",ident(s),h.hexdigest()))
                else: fail("EVIDENCE_SPECIAL_FILE")
            finally: os.close(c)
        if ns!=names(fd) or ident(st)!=ident(os.fstat(fd)): fail("EVIDENCE_CHANGED")
    walk(rootfd,""); return rows

def validate_evidence(root,receipt_hash,revision):
    rootfd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME); held=[]
    try:
        rfd=open_dir_at(rootfd,"receipts")
        try: rb,rst=read_file_at(rfd,"reproducibility.json",1024*1024)
        finally: os.close(rfd)
        if digest(rb)!=receipt_hash: fail("REPRO_RECEIPT_HASH_MISMATCH")
        receipt=parse_json(rb,"REPRO_RECEIPT_INVALID",1024*1024)
        required={"schemaVersion":REPRO_SCHEMA,"sourceRevision":revision,"retryGate":"closed","providerBundleCount":3,"acquisitionCount":2,"allBytesAndModesReproduced":True,"allSixRegularFileInodeSetsDisjoint":True,"rootInstallationPerformed":False,"providerExecutionAuthorized":False,"privilegedInstallationAuthorized":False}
        if any(receipt.get(k)!=v for k,v in required.items()): fail("REPRO_RECEIPT_UNSUCCESSFUL")
        records=receipt.get("providers")
        if not isinstance(records,list) or [x.get("provider") for x in records]!=list(PROVIDERS): fail("REPRO_PROVIDER_SET_INVALID")
        pafd=open_dir_at(rootfd,"publications-A")
        pafd_named=os.stat("publications-A",dir_fd=rootfd,follow_symlinks=False)
        if (pafd_named.st_dev,pafd_named.st_ino)!=(os.fstat(pafd).st_dev,os.fstat(pafd).st_ino): fail("SOURCE_REBOUND")
        inventory=evidence_inventory(pafd)
        if names(pafd)!=sorted((x["publicationId"] for x in records),key=lambda x:x.encode()): fail("PUBLICATION_SET_INVALID")
        for record in records:
            provider=record["provider"]; artifact=ARTIFACTS[provider]
            if record.get("artifactId")!=artifact: fail("PUBLICATION_ARTIFACT_INVALID")
            pub=record["publicationId"]; safe_name(pub); pfd=open_dir_at(pafd,pub)
            if names(pfd)!=sorted(MEMBERS,key=lambda x:x.encode()): fail("PUBLICATION_MEMBERS_INVALID")
            files={}
            for member in META+("bundle.tree-manifest.json",):
                b,st=read_file_at(pfd,member,MAX_MANIFEST if member=="bundle.tree-manifest.json" else MAX_JSON)
                if mode(st)!=0o400 or digest(b)!=record.get("memberHashes",{}).get(member): fail("PUBLICATION_MEMBER_MISMATCH")
                files[member]=b
            manifest=validate_documents(files,provider,artifact,revision)
            if digest(files["publication-index.json"])[7:39] != pub[-32:] or digest(files["bundle.tree-manifest.json"])!=record.get("treeSha256"): fail("PUBLICATION_BINDING_INVALID")
            bfd=open_dir_at(pfd,"bundle"); held.append((record,pfd,bfd,files,manifest,pub)); scan_bundle(bfd,manifest)
        pafd_now=os.stat("publications-A",dir_fd=rootfd,follow_symlinks=False)
        if (pafd_now.st_dev,pafd_now.st_ino)!=(os.fstat(pafd).st_dev,os.fstat(pafd).st_ino): fail("SOURCE_REBOUND")
        if evidence_inventory(pafd)!=inventory: fail("EVIDENCE_INVENTORY_CHANGED")
        return receipt,held,(rootfd,pafd),inventory
    except:
        for _,p,b,_,_,_ in held: os.close(b); os.close(p)
        try: os.close(pafd)
        except Exception: pass
        os.close(rootfd); raise

def open_ancestry(path,owner,floor):
    try: parts=path.relative_to(floor).parts
    except ValueError: fail("DESTINATION_ANCESTRY_POLICY")
    fds=[]; fd=os.open(floor,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW); fds.append((fd,Path(floor),os.fstat(fd)))
    for part in parts:
        nfd=open_dir_at(fd,part); fds.append((nfd,fds[-1][1]/part,os.fstat(nfd))); fd=nfd
    for _,_,st in fds:
        if st.st_uid!=owner or mode(st)&0o022: fail("DESTINATION_ANCESTRY_POLICY")
    return fds
def assert_ancestry(fds):
    for fd,path,before in fds:
        now=os.fstat(fd)
        try: named=os.lstat(path)
        except OSError: fail("DESTINATION_ANCESTRY_CHANGED")
        if (now.st_dev,now.st_ino)!=(before.st_dev,before.st_ino) or (named.st_dev,named.st_ino)!=(before.st_dev,before.st_ino): fail("DESTINATION_ANCESTRY_CHANGED")
def remove_tree_at(parent_fd,name,wanted):
    try: fd=open_dir_at(parent_fd,name)
    except OSError: return
    try:
        st=os.fstat(fd)
        if (st.st_dev,st.st_ino)!=wanted: return
        os.fchmod(fd,0o700)
        for n in names(fd):
            s=os.stat(n,dir_fd=fd,follow_symlinks=False)
            if stat.S_ISDIR(s.st_mode): remove_tree_at(fd,n,(s.st_dev,s.st_ino))
            else: os.unlink(n,dir_fd=fd)
    finally: os.close(fd)
    try:
        s=os.stat(name,dir_fd=parent_fd,follow_symlinks=False)
        if (s.st_dev,s.st_ino)==wanted: os.rmdir(name,dir_fd=parent_fd)
    except FileNotFoundError: pass

def validate_installed_fd(rfd,receipt_hash=None,expected_uid=0,revision=REVISION):
    rb,rst=read_file_at(rfd,"installation-receipt.json",MAX_JSON)
    if mode(rst)!=0o444: fail("INSTALL_FILE_POLICY")
    rec=parse_json(rb,"INSTALL_RECEIPT_INVALID")
    exact(rec,("approvalPhrase","destination","providers","schemaVersion","sourceReceiptSha256","sourceRevision"),"INSTALL_RECEIPT_INVALID")
    if rec["schemaVersion"]!=SCHEMA or rec["approvalPhrase"]!=APPROVAL or rec["destination"]!="/opt/wordle-royale/g0-provider-tools" or rec["sourceRevision"]!=revision or (receipt_hash and rec["sourceReceiptSha256"]!=receipt_hash): fail("INSTALL_RECEIPT_INVALID")
    if not isinstance(rec["providers"],list) or [x.get("artifactId") for x in rec["providers"]]!=list(ARTIFACTS.values()): fail("INSTALL_RECEIPT_INVALID")
    allowed={"installation-receipt.json","metadata"}
    mfd=open_dir_at(rfd,"metadata")
    try:
        if names(mfd)!=sorted(ARTIFACTS.values(),key=lambda x:x.encode()): fail("INSTALL_MEMBER_SET_INVALID")
        for p in rec["providers"]:
            exact(p,("artifactId","counts","memberHashes","publicationId","treeSha256"),"INSTALL_RECEIPT_INVALID"); art=p["artifactId"]; allowed|={art,art+".tree-manifest.json"}
            bfd=open_dir_at(rfd,art); mb,mst=read_file_at(rfd,art+".tree-manifest.json",MAX_MANIFEST)
            if mode(mst)!=0o444: fail("INSTALL_FILE_POLICY")
            manifest=parse_json(mb,"MANIFEST_INVALID",MAX_MANIFEST); manifest_schema(manifest)
            if digest(mb)!=p["treeSha256"] or digest(mb)!=p["memberHashes"]["bundle.tree-manifest.json"]: fail("INSTALL_MEMBER_HASH_MISMATCH")
            try: scan_bundle(bfd,manifest)
            finally: os.close(bfd)
            afd=open_dir_at(mfd,art)
            try:
                if names(afd)!=sorted(META,key=lambda x:x.encode()): fail("INSTALL_MEMBER_SET_INVALID")
                files={"bundle.tree-manifest.json":mb}
                for n in META:
                    b,st=read_file_at(afd,n,MAX_JSON)
                    if mode(st)!=0o444: fail("INSTALL_FILE_POLICY")
                    if digest(b)!=p["memberHashes"][n]: fail("INSTALL_MEMBER_HASH_MISMATCH")
                    files[n]=b
                validate_documents(files,art.split("-")[0],art,revision)
            finally: os.close(afd)
        if set(names(rfd))!=allowed: fail("INSTALL_MEMBER_SET_INVALID")
        def policy(fd):
            for n in names(fd):
                s=os.stat(n,dir_fd=fd,follow_symlinks=False)
                if s.st_uid!=expected_uid or s.st_gid!=expected_uid: fail("INSTALL_OWNER_INVALID")
                if stat.S_ISREG(s.st_mode):
                    if mode(s) not in (0o444,0o555) or s.st_nlink!=1: fail("INSTALL_FILE_POLICY")
                elif stat.S_ISDIR(s.st_mode):
                    if mode(s)!=0o555: fail("INSTALL_DIR_POLICY")
                    c=open_dir_at(fd,n)
                    try: policy(c)
                    finally: os.close(c)
                else: fail("INSTALL_NODE_POLICY")
        policy(rfd); return rec
    finally: os.close(mfd)
def validate_installed(root,receipt_hash=None,expected_uid=0,revision=REVISION):
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME)
    try: first=validate_installed_fd(fd,receipt_hash,expected_uid,revision); second=validate_installed_fd(fd,receipt_hash,expected_uid,revision); return second
    finally: os.close(fd)

def install(root,parent,owner,receipt_hash,revision,inject=None,require_root=False,ancestry_floor=Path("/")):
    if require_root and os.geteuid()!=0: fail("ROOT_REQUIRED")
    ancestry=open_ancestry(parent,owner,ancestry_floor); pfd=ancestry[-1][0]; temp=".g0-provider-tools.stage-"+secrets.token_hex(16); stage_id=None; committed=False
    receipt,pubs,source_fds,inventory=validate_evidence(root,receipt_hash,revision); rootfd,pafd=source_fds
    try:
        assert_ancestry(ancestry)
        try:
            existing=open_dir_at(pfd,DEST_NAME)
            try: rec=validate_installed_fd(existing,receipt_hash,owner,revision); validate_installed_fd(existing,receipt_hash,owner,revision)
            finally: os.close(existing)
            if rec["sourceRevision"]==revision: return "IDENTICAL_REPLAY"
            fail("DESTINATION_COLLISION")
        except FileNotFoundError: pass
        except (NotADirectoryError,InstallError): fail("DESTINATION_COLLISION")
        sfd=mkdir_new(pfd,temp); stage_id=(os.fstat(sfd).st_dev,os.fstat(sfd).st_ino)
        try:
            provider_receipts=[]; mroot=mkdir_new(sfd,"metadata")
            try:
                for record,pubfd,bundlefd,files,manifest,pubname in pubs:
                    named=os.stat(pubname,dir_fd=pafd,follow_symlinks=False)
                    if (named.st_dev,named.st_ino)!=(os.fstat(pubfd).st_dev,os.fstat(pubfd).st_ino): fail("SOURCE_REBOUND")
                    namedb=os.stat("bundle",dir_fd=pubfd,follow_symlinks=False)
                    if (namedb.st_dev,namedb.st_ino)!=(os.fstat(bundlefd).st_dev,os.fstat(bundlefd).st_ino): fail("SOURCE_REBOUND")
                    art=record["artifactId"]; dfd=mkdir_new(sfd,art)
                    try: counts=copy_bundle(bundlefd,dfd,manifest,owner,inject); os.fchmod(dfd,0o555); fsync_dir(dfd)
                    finally: os.close(dfd)
                    write_new(sfd,art+".tree-manifest.json",files["bundle.tree-manifest.json"],0o444)
                    afd=mkdir_new(mroot,art)
                    try:
                        for n in META: write_new(afd,n,files[n],0o444)
                        os.fchmod(afd,0o555); fsync_dir(afd)
                    finally: os.close(afd)
                    provider_receipts.append({"artifactId":art,"counts":counts,"memberHashes":record["memberHashes"],"publicationId":record["publicationId"],"treeSha256":record["treeSha256"]})
                os.fchmod(mroot,0o555); fsync_dir(mroot)
            finally: os.close(mroot)
            out={"approvalPhrase":APPROVAL,"destination":"/opt/wordle-royale/g0-provider-tools","providers":provider_receipts,"schemaVersion":SCHEMA,"sourceReceiptSha256":receipt_hash,"sourceRevision":revision}
            write_new(sfd,"installation-receipt.json",canonical(out),0o444); os.fchmod(sfd,0o555); fsync_dir(sfd)
            validate_installed_fd(sfd,receipt_hash,owner,revision); validate_installed_fd(sfd,receipt_hash,owner,revision)
            pafd_now=os.stat("publications-A",dir_fd=rootfd,follow_symlinks=False)
            if (pafd_now.st_dev,pafd_now.st_ino)!=(os.fstat(pafd).st_dev,os.fstat(pafd).st_ino): fail("SOURCE_REBOUND")
            if evidence_inventory(pafd)!=inventory: fail("EVIDENCE_INVENTORY_CHANGED")
            assert_ancestry(ancestry)
            if inject: inject("before-commit",temp)
            assert_ancestry(ancestry)
            if not rename_noreplace(pfd,temp,DEST_NAME): fail("DESTINATION_COLLISION")
            committed=True
        finally: os.close(sfd)
        fsync_dir(pfd)
        return "INSTALLED"
    except:
        if not committed and stage_id: remove_tree_at(pfd,temp,stage_id)
        raise
    finally:
        for _,pf,bf,_,_,_ in pubs: os.close(bf); os.close(pf)
        os.close(pafd); os.close(rootfd)
        for fd,_,_ in reversed(ancestry): os.close(fd)
def install_for_test(root,parent,inject=None):
    rb=(Path(root)/"receipts/reproducibility.json").read_bytes(); return install(Path(root),Path(parent),os.geteuid(),digest(rb),REVISION,inject,False,Path(parent))
def main(argv=None):
    if Path(__file__).resolve()!=CAPSULE: fail("SEALED_CAPSULE_REQUIRED")
    ap=argparse.ArgumentParser(allow_abbrev=False); ap.add_argument("--source-evidence-root",required=True); ap.add_argument("--repro-receipt-sha256",required=True); ap.add_argument("--source-revision",required=True); ap.add_argument("--approval",required=True); a=ap.parse_args(argv)
    if Path(a.source_evidence_root)!=EVIDENCE or a.repro_receipt_sha256!=RECEIPT_SHA or a.source_revision!=REVISION or a.approval!=APPROVAL: fail("CLOSED_CLI_ARGUMENT_MISMATCH")
    print(json.dumps({"status":install(EVIDENCE,DEST_PARENT,0,RECEIPT_SHA,REVISION,require_root=True)},sort_keys=True,separators=(",",":")))
if __name__=="__main__":
    try: main()
    except InstallError as e: print(str(e),file=sys.stderr); raise SystemExit(2)
