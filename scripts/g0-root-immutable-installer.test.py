import hashlib, importlib.util, json, os, shutil, stat, tempfile, unittest
from pathlib import Path
P=Path(__file__).with_name("g0-root-immutable-installer.py")
spec=importlib.util.spec_from_file_location("ao_installer",P); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
def wire(x): return (json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def sha(b): return "sha256:"+hashlib.sha256(b).hexdigest()
def put(path,data,mode): path.write_bytes(data); path.chmod(mode)
def fixture(base):
 root=base/"evidence"; (root/"receipts").mkdir(parents=True); (root/"publications-A").mkdir(); records=[]
 source=mod.EVIDENCE/"publications-A"
 for provider in mod.PROVIDERS:
  artifact=mod.ARTIFACTS[provider]; original=next(source.glob(artifact+"-*")); docs={n:json.loads((original/n).read_text()) for n in mod.META+("bundle.tree-manifest.json",)}
  payload=(provider+"-payload").encode(); payload_mode=365 if provider=="railway" else 292; manifest={"entries":[{"mode":365,"path":".","type":"directory"},{"mode":365,"path":"dir","type":"directory"},{"mode":payload_mode,"path":"dir/tool.js","sha256":sha(payload),"type":"file"}],"schemaVersion":"wordle-royale-provider-tool-tree-manifest/v1"}; mb=wire(manifest)
  docs["descriptor.json"]["treeManifestSha256"]=sha(mb); db=wire(docs["descriptor.json"]); ab=wire(docs["acquisition-record.json"]); plan=mod.expected_plan(artifact); pb=wire(plan)
  idx={"artifactId":artifact,"canonicalSourceSnapshotSha256":docs["acquisition-record.json"]["canonicalSourceSnapshotSha256"],"members":{"acquisitionRecord":{"mode":256,"path":"acquisition-record.json","sha256":sha(ab)},"bundle":{"path":"bundle","treeManifestSha256":sha(mb)},"descriptor":{"mode":256,"path":"descriptor.json","sha256":sha(db)},"installPlan":{"mode":256,"path":"install-plan.json","sha256":sha(pb)},"treeManifest":{"mode":256,"path":"bundle.tree-manifest.json","sha256":sha(mb)}},"schemaVersion":"wordle-royale-g0-local-publication-index/v1","sourceRevision":mod.REVISION}; ib=wire(idx); cb=wire({"publicationIndexSha256":sha(ib),"schemaVersion":"wordle-royale-g0-local-publication-commit/v1"})
  metadata={"bundle.tree-manifest.json":mb,"descriptor.json":db,"acquisition-record.json":ab,"install-plan.json":pb,"publication-index.json":ib,"COMMIT":cb}; publication=artifact+"-"+sha(ib)[7:39]; pub=root/"publications-A"/publication; bundle=pub/"bundle"/"dir"; bundle.mkdir(parents=True); put(bundle/"tool.js",payload,payload_mode)
  for name,b in metadata.items(): put(pub/name,b,0o400)
  bundle.chmod(0o555); bundle.parent.chmod(0o555); pub.chmod(0o555)
  records.append({"artifactId":artifact,"counts":{"nodeCount":3,"packageCount":1,"payloadBytes":len(payload)},"memberHashes":{k:sha(v) for k,v in metadata.items()},"provider":provider,"publicationId":publication,"treeSha256":sha(mb)})
 receipt={"acquisitionCount":2,"allBytesAndModesReproduced":True,"allSixRegularFileInodeSetsDisjoint":True,"privilegedInstallationAuthorized":False,"providerBundleCount":3,"providerExecutionAuthorized":False,"providers":records,"retryGate":"closed","rootInstallationPerformed":False,"schemaVersion":mod.REPRO_SCHEMA,"sourceRevision":mod.REVISION}
 put(root/"receipts/reproducibility.json",wire(receipt),0o400); root.chmod(0o755); (root/"receipts").chmod(0o555); (root/"publications-A").chmod(0o555); return root
def make_writable(path):
 try:
  for p in path.rglob("*"):
   if p.is_dir() and not p.is_symlink(): p.chmod(0o700)
  path.chmod(0o700)
 except FileNotFoundError: pass
class InstallerTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory(); self.base=Path(self.t.name); self.root=fixture(self.base); self.parent=self.base/"destination"; self.parent.mkdir(mode=0o755)
 def tearDown(self): make_writable(self.base); self.t.cleanup()
 def install(self,inject=None): return mod.install_for_test(self.root,self.parent,inject)
 def output(self): return self.parent/mod.DEST_NAME
 def test_atomic_exact_layout_and_recursive_validation(self):
  self.assertEqual(self.install(),"INSTALLED"); out=self.output(); self.assertEqual(set(p.name for p in out.iterdir()),{"metadata","installation-receipt.json",*mod.ARTIFACTS.values(),*(x+".tree-manifest.json" for x in mod.ARTIFACTS.values())})
  self.assertEqual(set(p.name for p in (out/"metadata").iterdir()),set(mod.ARTIFACTS.values())); self.assertEqual(mod.validate_installed(out,expected_uid=os.geteuid())["providers"].__len__(),3)
 def test_fresh_copies_modes_links_no_xattrs(self):
  self.install(); out=self.output()
  for p in out.rglob("*"):
   s=p.stat(); self.assertEqual(s.st_uid,os.geteuid()); expected=0o555 if p.is_dir() or p==out/mod.ARTIFACTS["railway"]/"dir/tool.js" else 0o444; self.assertEqual(stat.S_IMODE(s.st_mode),expected)
   if p.is_file(): self.assertEqual(s.st_nlink,1); self.assertEqual(os.listxattr(p),[])
  src=next(self.root.glob("publications-A/vercel-*/bundle/dir/tool.js")); dst=out/mod.ARTIFACTS["vercel"]/"dir/tool.js"; self.assertNotEqual((src.stat().st_dev,src.stat().st_ino),(dst.stat().st_dev,dst.stat().st_ino))
 def test_short_write_is_completed_and_destination_is_reread(self):
  real=mod.os.write
  def short(fd,data): return real(fd,data[:max(1,len(data)//3)])
  mod.os.write=short
  try: self.assertEqual(self.install(),"INSTALLED")
  finally: mod.os.write=real
  mod.validate_installed(self.output(),expected_uid=os.geteuid())
 def test_identical_replay_scans_everything_and_tamper_fails(self):
  self.install(); out=self.output(); fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME)
  try: before=mod.evidence_inventory(fd)
  finally: os.close(fd)
  self.assertEqual(self.install(),"IDENTICAL_REPLAY"); fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME)
  try: self.assertEqual(before,mod.evidence_inventory(fd))
  finally: os.close(fd)
  p=out/mod.ARTIFACTS["railway"]/"dir/tool.js"; p.chmod(0o644); p.write_bytes(b"tamper"); p.chmod(0o444)
  with self.assertRaises(mod.InstallError): self.install()
 def test_tampered_installed_metadata_blocks_replay(self):
  self.install(); p=self.output()/"metadata"/mod.ARTIFACTS["supabase"]/"descriptor.json"; p.chmod(0o644); p.write_bytes(b"{}\n"); p.chmod(0o444)
  with self.assertRaises(mod.InstallError): self.install()
 def test_duplicate_keys_and_duplicate_manifest_paths_rejected_before_write(self):
  p=next(self.root.glob("publications-A/vercel-*/descriptor.json")); p.chmod(0o600); b=p.read_bytes(); p.write_bytes(b.replace(b'{',b'{"schemaVersion":"evil",',1)); p.chmod(0o400)
  rec=self.root/"receipts/reproducibility.json"; x=json.loads(rec.read_text()); x["providers"][0]["memberHashes"]["descriptor.json"]=sha(p.read_bytes()); rec.chmod(0o600); put(rec,wire(x),0o400)
  with self.assertRaisesRegex(mod.InstallError,"DUPLICATE_KEY"): self.install()
  self.assertEqual(list(self.parent.iterdir()),[])
 def test_duplicate_manifest_path_rejected(self):
  pub=next(self.root.glob("publications-A/railway-*")); p=pub/"bundle.tree-manifest.json"; m=json.loads(p.read_text()); m["entries"].append(dict(m["entries"][-1])); p.chmod(0o600); put(p,wire(m),0o400)
  rec=self.root/"receipts/reproducibility.json"; x=json.loads(rec.read_text()); r=x["providers"][1]; r["memberHashes"]["bundle.tree-manifest.json"]=sha(p.read_bytes()); r["treeSha256"]=sha(p.read_bytes()); rec.chmod(0o600); put(rec,wire(x),0o400)
  with self.assertRaisesRegex(mod.InstallError,"MANIFEST_DUPLICATE"): self.install()
 def test_source_rebinding_detected(self):
  done=False
  def attack(stage,name):
   nonlocal done
   if not done and stage=="after-directory" and name==".":
    done=True; pub=next(self.root.glob("publications-A/vercel-*")); pub.chmod(0o755); old=pub/"bundle"; old.rename(pub/"old"); shutil.copytree(pub/"old",old); old.chmod(0o555); pub.chmod(0o555)
  with self.assertRaises(mod.InstallError): self.install(attack)
  self.assertFalse(any(p.name.startswith(".g0-") for p in self.parent.iterdir()))
 def test_destination_parent_replacement_detected(self):
  moved=self.base/"moved"
  def attack(stage,name):
   if stage=="before-commit": self.parent.rename(moved); self.parent.mkdir(mode=0o755)
  with self.assertRaisesRegex(mod.InstallError,"DESTINATION_ANCESTRY_CHANGED"): self.install(attack)
  self.assertEqual(list(self.parent.iterdir()),[])
 def test_collision_and_cleanup_identity_safety(self):
  target=self.parent/mod.DEST_NAME; target.write_text("hostile")
  with self.assertRaisesRegex(mod.InstallError,"DESTINATION_COLLISION"): self.install()
  self.assertEqual(target.read_text(),"hostile")
  target.unlink(); replacement=None
  def fault(stage,name):
   nonlocal replacement
   if stage=="before-directory" and name==".":
    staged=next(p for p in self.parent.iterdir() if p.name.startswith(".g0-")); staged.rename(staged.with_name(staged.name+".old")); staged.mkdir(); replacement=staged; raise mod.InstallError("INJECTED")
  with self.assertRaisesRegex(mod.InstallError,"INJECTED"): self.install(fault)
  self.assertTrue(replacement.is_dir())
 def test_tampered_source_member_and_symlink_rejected(self):
  p=next(self.root.glob("publications-A/supabase-*/descriptor.json")); p.chmod(0o600); put(p,b"{}\n",0o400)
  with self.assertRaises(mod.InstallError): self.install()
 def test_capsule_gate_and_closed_cli(self):
  self.assertNotIn("--destination",P.read_text()); old=mod.CAPSULE; mod.CAPSULE=Path("/definitely/not/source")
  try:
   with self.assertRaisesRegex(mod.InstallError,"SEALED_CAPSULE_REQUIRED"): mod.main([])
  finally: mod.CAPSULE=old
if __name__=="__main__": unittest.main()
