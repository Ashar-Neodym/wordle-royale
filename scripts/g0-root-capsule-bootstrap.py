#!/usr/bin/python3
"""Exact-hash bootstrap coordinator for the sealed AO root installer capsule.

The coordinator is unprivileged.  Its only privileged child is an isolated
stdlib Python interpreter executing ROOT_BOOTSTRAP_SOURCE from argv; capsule
bytes travel over stdin.  Root never imports or executes this checkout file.
"""
from __future__ import annotations

import hashlib
import os
import stat
import subprocess
import sys
from pathlib import Path

INSTALLER_NAME = "g0-root-immutable-installer.py"
MANIFEST_NAME = "g0-root-installer-capsule.json"
INSTALLER_SHA256 = "1cdadd186f5f4256b89664f24f613d47a79f55c458aa1eb84ed5488f36b1fba8"
INSTALLER_SIZE = 31174
MANIFEST_BYTES = b'{"capsulePath":"/opt/wordle-royale/installer-tools/ao-v1/g0-root-immutable-installer.py","installerSha256":"sha256:1cdadd186f5f4256b89664f24f613d47a79f55c458aa1eb84ed5488f36b1fba8","python":"/usr/bin/python3","pythonFlags":["-I","-S","-B"],"schemaVersion":"wordle-royale-g0-root-installer-capsule/v1","sourceRevision":"6cc4944a6f4051d5aa72edd6eb7e0a9b2e2e941f"}\n'

# This is the complete privileged boundary.  Keep it stdlib-only and closed:
# stdin is the sole input and every filesystem name and policy is fixed here.
ROOT_BOOTSTRAP_SOURCE = r'''import ctypes, errno, hashlib, os, secrets, stat, sys
EXPECTED_SHA="1cdadd186f5f4256b89664f24f613d47a79f55c458aa1eb84ed5488f36b1fba8"
EXPECTED_SIZE=31174
PARTS=("wordle-royale","installer-tools","ao-v1")
FINAL="g0-root-immutable-installer.py"
O_DIR=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_NOATIME
O_FILE=os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME
RENAME_NOREPLACE=1
libc=ctypes.CDLL(None,use_errno=True)
class BootstrapError(RuntimeError): pass
def fail(code): raise BootstrapError(code)
def identity(st): return (st.st_dev,st.st_ino,st.st_mode,st.st_nlink,st.st_uid,st.st_gid,st.st_size,st.st_atime_ns,st.st_mtime_ns,st.st_ctime_ns)
def policy(st,owner,is_dir):
    if st.st_uid!=owner or st.st_gid!=owner or stat.S_IMODE(st.st_mode)&0o022: fail("UNSAFE_ANCESTOR" if is_dir else "UNSAFE_CAPSULE")
    if is_dir and not stat.S_ISDIR(st.st_mode): fail("UNSAFE_ANCESTOR")
    if not is_dir and (not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o555): fail("UNSAFE_CAPSULE")
def read_exact(fd,limit):
    out=[]; total=0
    while total<limit:
        chunk=os.read(fd,min(131072,limit-total))
        if not chunk: break
        out.append(chunk); total+=len(chunk)
    if total!=limit or os.read(fd,1): fail("CAPSULE_LENGTH_MISMATCH")
    return b"".join(out)
def write_all(fd,data,write=os.write):
    view=memoryview(data)
    while view:
        n=write(fd,view)
        if not isinstance(n,int) or n<=0 or n>len(view): fail("CAPSULE_SHORT_WRITE")
        view=view[n:]
def reread(fd,expected):
    before=os.fstat(fd); policy(before,before.st_uid,False); os.lseek(fd,0,0); h=hashlib.sha256(); size=0
    while True:
        b=os.read(fd,131072)
        if not b: break
        h.update(b); size+=len(b)
    after=os.fstat(fd)
    if identity(before)!=identity(after) or size!=EXPECTED_SIZE or h.hexdigest()!=EXPECTED_SHA or h.digest()!=hashlib.sha256(expected).digest(): fail("CAPSULE_REREAD_MISMATCH")
def named_same(parent_fd,name,fd):
    try: named=os.stat(name,dir_fd=parent_fd,follow_symlinks=False)
    except OSError: fail("ANCESTOR_REBOUND")
    held=os.fstat(fd)
    if (named.st_dev,named.st_ino)!=(held.st_dev,held.st_ino): fail("ANCESTOR_REBOUND")
def open_or_create(parent_fd,name,owner):
    try: fd=os.open(name,O_DIR,dir_fd=parent_fd)
    except FileNotFoundError:
        try: os.mkdir(name,0o755,dir_fd=parent_fd)
        except FileExistsError: fail("ANCESTOR_COLLISION")
        fd=os.open(name,O_DIR,dir_fd=parent_fd)
        os.fchmod(fd,0o755); os.fsync(fd); os.fsync(parent_fd)
    except OSError: fail("ANCESTOR_COLLISION")
    st=os.fstat(fd); policy(st,owner,True); named_same(parent_fd,name,fd); return fd
def existing_identical(parent_fd,payload,owner):
    try: fd=os.open(FINAL,O_FILE,dir_fd=parent_fd)
    except FileNotFoundError: return False
    except OSError: fail("CAPSULE_COLLISION")
    try:
        policy(os.fstat(fd),owner,False); named_same(parent_fd,FINAL,fd); reread(fd,payload); named_same(parent_fd,FINAL,fd)
        return True
    except BootstrapError: fail("CAPSULE_COLLISION")
    finally: os.close(fd)
def rename_noreplace(parent_fd,old):
    fn=getattr(libc,"renameat2",None)
    if fn is None: fail("RENAME_NOREPLACE_UNAVAILABLE")
    if fn(parent_fd,os.fsencode(old),parent_fd,os.fsencode(FINAL),RENAME_NOREPLACE):
        e=ctypes.get_errno()
        if e==errno.EEXIST: return False
        fail("RENAME_NOREPLACE_FAILED_"+str(e))
    return True
def cleanup_own_temp(parent_fd,name,wanted):
    try: st=os.stat(name,dir_fd=parent_fd,follow_symlinks=False)
    except FileNotFoundError: return
    if stat.S_ISREG(st.st_mode) and (st.st_dev,st.st_ino)==wanted:
        try: os.unlink(name,dir_fd=parent_fd)
        except FileNotFoundError: pass
def bootstrap_from_fd_for_test(input_fd,base,owner,require_root=False,write=os.write,inject=None):
    if require_root and (os.geteuid()!=0 or owner!=0): fail("ROOT_REQUIRED")
    payload=read_exact(input_fd,EXPECTED_SIZE)
    if hashlib.sha256(payload).hexdigest()!=EXPECTED_SHA: fail("CAPSULE_HASH_MISMATCH")
    base_fd=os.open(os.fspath(base),O_DIR); held=[base_fd]; temp=None; temp_id=None; committed=False
    try:
        policy(os.fstat(base_fd),owner,True)
        parent=base_fd
        for part in PARTS:
            child=open_or_create(parent,part,owner); held.append(child); parent=child
        for index in range(1,len(held)):
            named_same(held[index-1],PARTS[index-1],held[index])
        if existing_identical(parent,payload,owner): return "IDENTICAL_REPLAY"
        temp=".capsule-stage-"+secrets.token_hex(16)
        fd=os.open(temp,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_NOATIME,0o600,dir_fd=parent)
        try:
            st=os.fstat(fd); temp_id=(st.st_dev,st.st_ino)
            if st.st_uid!=owner or st.st_gid!=owner or st.st_nlink!=1: fail("TEMP_POLICY")
            if inject: inject("temp-created",parent,temp,temp_id)
            write_all(fd,payload,write); os.fchmod(fd,0o555); os.fsync(fd); reread(fd,payload)
            named=os.stat(temp,dir_fd=parent,follow_symlinks=False)
            if (named.st_dev,named.st_ino)!=temp_id: fail("TEMP_REBOUND")
            for index in range(1,len(held)): named_same(held[index-1],PARTS[index-1],held[index])
            if inject: inject("before-rename",parent,temp,temp_id)
            if not rename_noreplace(parent,temp):
                if existing_identical(parent,payload,owner): return "IDENTICAL_REPLAY"
                fail("CAPSULE_COLLISION")
            committed=True
        finally: os.close(fd)
        os.fsync(parent)
        if not existing_identical(parent,payload,owner): fail("COMMITTED_CAPSULE_INVALID")
        return "INSTALLED"
    finally:
        if temp is not None and not committed and temp_id is not None: cleanup_own_temp(held[-1],temp,temp_id)
        for fd in reversed(held): os.close(fd)
def main():
    try:
        status=bootstrap_from_fd_for_test(0,"/opt",0,True)
        os.write(1,(status+"\n").encode())
    except BootstrapError as e:
        os.write(2,(str(e)+"\n").encode()); raise SystemExit(2)
if __name__=="__main__": main()
'''

_bootstrap_namespace = {"__name__": "g0_root_capsule_bootstrap_boundary"}
exec(ROOT_BOOTSTRAP_SOURCE, _bootstrap_namespace)
BootstrapError = _bootstrap_namespace["BootstrapError"]
bootstrap_from_fd_for_test = _bootstrap_namespace["bootstrap_from_fd_for_test"]


def _identity(st: os.stat_result) -> tuple[int, ...]:
    return (st.st_dev, st.st_ino, st.st_mode, st.st_nlink, st.st_uid, st.st_gid,
            st.st_size, st.st_atime_ns, st.st_mtime_ns, st.st_ctime_ns)


def _stable_read_at(directory_fd: int, name: str, expected_size: int) -> bytes:
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NOATIME, dir_fd=directory_fd)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size != expected_size:
            raise RuntimeError(f"unsafe checkout member: {name}")
        chunks = []
        while True:
            chunk = os.read(fd, 131072)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        if _identity(before) != _identity(after):
            raise RuntimeError(f"checkout member changed while reading: {name}")
        named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if (named.st_dev, named.st_ino) != (after.st_dev, after.st_ino):
            raise RuntimeError(f"checkout member rebound while reading: {name}")
        return b"".join(chunks)
    finally:
        os.close(fd)


def read_exact_capsule_from_checkout(script_directory: Path | None = None) -> bytes:
    directory = script_directory if script_directory is not None else Path(__file__).parent
    directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        manifest = _stable_read_at(directory_fd, MANIFEST_NAME, len(MANIFEST_BYTES))
        if manifest != MANIFEST_BYTES:
            raise RuntimeError("capsule manifest is not the exact pinned manifest")
        installer = _stable_read_at(directory_fd, INSTALLER_NAME, INSTALLER_SIZE)
        if hashlib.sha256(installer).hexdigest() != INSTALLER_SHA256:
            raise RuntimeError("installer does not match the exact pinned SHA-256")
        return installer
    finally:
        os.close(directory_fd)


def invoke_fixed_root_boundary() -> int:
    payload = read_exact_capsule_from_checkout()
    command = ["/usr/bin/sudo", "/usr/bin/python3", "-I", "-S", "-B", "-c", ROOT_BOOTSTRAP_SOURCE]
    completed = subprocess.run(command, input=payload, check=False)
    return completed.returncode


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args != ["--invoke-sudo"]:
        print("usage: g0-root-capsule-bootstrap.py --invoke-sudo", file=sys.stderr)
        return 2
    return invoke_fixed_root_boundary()


if __name__ == "__main__":
    raise SystemExit(main())
