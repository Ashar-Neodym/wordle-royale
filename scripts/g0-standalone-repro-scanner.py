#!/usr/bin/python3
"""Independent, descriptor-relative AN-5 publication scanner (Python stdlib only)."""
import hashlib
import json
import os
import re
import stat
import sys

MAX_JSON = 256 * 1024
MAX_MANIFEST = 2 * 1024 * 1024
MAX_FILE = 224 * 1024 * 1024
MAX_NODES = 8500
MAX_OUTPUT = 4 * 1024 * 1024
MEMBERS = ["COMMIT", "acquisition-record.json", "bundle", "bundle.tree-manifest.json", "descriptor.json", "install-plan.json", "publication-index.json"]
FILES = ["COMMIT", "acquisition-record.json", "bundle.tree-manifest.json", "descriptor.json", "install-plan.json", "publication-index.json"]
ARTIFACTS = {"vercel-58.4.4": "vercel", "railway-5.30.1": "railway", "supabase-2.110.0": "supabase"}


def fail(code):
    raise RuntimeError(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"


def component(value):
    return isinstance(value, str) and value not in ("", ".", "..") and "/" not in value and "\0" not in value and len(value.encode()) <= 255


def safe_path(value):
    if value == ".":
        return True
    return isinstance(value, str) and not value.startswith("/") and "\\" not in value and "\0" not in value and all(component(x) for x in value.split("/")) and len(value.encode()) <= 1024


def open_dir(name, parent_fd, mode, device, uid):
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if not stat.S_ISDIR(before.st_mode) or stat.S_ISLNK(before.st_mode) or stat.S_IMODE(before.st_mode) != mode or before.st_dev != device or before.st_uid != uid:
        fail("STANDALONE_DIRECTORY_POLICY")
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    after = os.fstat(fd)
    if (before.st_dev, before.st_ino, before.st_mode, before.st_uid) != (after.st_dev, after.st_ino, after.st_mode, after.st_uid):
        os.close(fd); fail("STANDALONE_FILESYSTEM_CHANGED")
    return fd


def read_file(name, parent_fd, relative, mode, device, uid, limit):
    before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode) or stat.S_IMODE(before.st_mode) != mode or before.st_dev != device or before.st_uid != uid or before.st_nlink != 1 or before.st_size < 0 or before.st_size > limit:
        fail("STANDALONE_FILE_POLICY")
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        held = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (held.st_dev, held.st_ino, held.st_mode, held.st_size, held.st_mtime_ns, held.st_ctime_ns):
            fail("STANDALONE_FILESYSTEM_CHANGED")
        digest = hashlib.sha256(); chunks = []; remaining = held.st_size
        while remaining:
            chunk = os.read(fd, min(65536, remaining))
            if not chunk: fail("STANDALONE_FILESYSTEM_CHANGED")
            chunks.append(chunk); digest.update(chunk); remaining -= len(chunk)
        after = os.fstat(fd)
        if (held.st_dev, held.st_ino, held.st_mode, held.st_size, held.st_mtime_ns, held.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            fail("STANDALONE_FILESYSTEM_CHANGED")
        return {"path": relative, "type": "file", "mode": mode, "size": held.st_size, "sha256": "sha256:" + digest.hexdigest()}, f"{held.st_dev}:{held.st_ino}", b"".join(chunks)
    finally:
        os.close(fd)


def strict_json(raw, cap):
    if len(raw) < 3 or len(raw) > cap: fail("STANDALONE_JSON_INVALID")
    try: value = json.loads(raw.decode("utf-8"))
    except Exception: fail("STANDALONE_JSON_INVALID")
    if canonical(value) != raw: fail("STANDALONE_JSON_NONCANONICAL")
    return value


def list_names(fd):
    names = os.listdir(fd)
    if len(names) != len(set(names)) or any(not component(x) for x in names): fail("STANDALONE_PATH_INVALID")
    return sorted(names, key=lambda x: x.encode())


def scan_bundle(fd, device, uid):
    entries, detailed, identities = [], [], []
    payload = 0
    def visit(directory_fd, relative):
        nonlocal payload
        names_before = list_names(directory_fd)
        st_before = os.fstat(directory_fd)
        entries.append({"path": relative, "type": "directory", "mode": 0o555})
        detailed.append({"path": relative, "type": "directory", "mode": 0o555})
        if len(entries) > MAX_NODES: fail("STANDALONE_NODE_LIMIT")
        for name in names_before:
            rel = name if relative == "." else relative + "/" + name
            if not safe_path(rel): fail("STANDALONE_PATH_INVALID")
            st = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
            if stat.S_ISLNK(st.st_mode) or st.st_dev != device: fail("STANDALONE_NODE_POLICY")
            if stat.S_ISDIR(st.st_mode):
                child = open_dir(name, directory_fd, 0o555, device, uid)
                try: visit(child, rel)
                finally: os.close(child)
            elif stat.S_ISREG(st.st_mode):
                wanted = stat.S_IMODE(st.st_mode)
                if wanted not in (0o444, 0o555): fail("STANDALONE_FILE_POLICY")
                item, inode, _ = read_file(name, directory_fd, rel, wanted, device, uid, MAX_FILE)
                entries.append({k: item[k] for k in ("path", "type", "mode", "sha256")})
                detailed.append(item); identities.append(inode); payload += item["size"]
                if payload > 224 * 1024 * 1024: fail("STANDALONE_PAYLOAD_LIMIT")
            else: fail("STANDALONE_NODE_POLICY")
            if len(entries) > MAX_NODES: fail("STANDALONE_NODE_LIMIT")
        if names_before != list_names(directory_fd) or (st_before.st_dev, st_before.st_ino, st_before.st_mode, st_before.st_mtime_ns, st_before.st_ctime_ns) != tuple(getattr(os.fstat(directory_fd), x) for x in ("st_dev", "st_ino", "st_mode", "st_mtime_ns", "st_ctime_ns")):
            fail("STANDALONE_FILESYSTEM_CHANGED")
    visit(fd, ".")
    entries.sort(key=lambda x: x["path"].encode()); detailed.sort(key=lambda x: x["path"].encode())
    package_count = sum(1 for x in entries if x["type"] == "directory" and x["path"] != "." and ((lambda p: len(p) >= 2 and p[-2] == "node_modules" and not p[-1].startswith("@"))(x["path"].split("/")) or (lambda p: len(p) >= 3 and p[-3] == "node_modules" and p[-2].startswith("@") and not p[-1].startswith("@"))(x["path"].split("/"))))
    return entries, detailed, identities, package_count, payload


def main():
    if len(sys.argv) != 3 or not sys.argv[1].isdigit() or not component(sys.argv[2]): fail("STANDALONE_INPUT_INVALID")
    parent_fd = int(sys.argv[1]); publication_name = sys.argv[2]
    parent = os.fstat(parent_fd); uid = os.getuid(); device = parent.st_dev
    container = open_dir(publication_name, parent_fd, 0o700, device, uid)
    try:
        if list_names(container) != MEMBERS: fail("STANDALONE_MEMBERS_INVALID")
        member_hashes, member_inventory, identities, documents = {}, [], [], {}
        for name in FILES:
            item, inode, raw = read_file(name, container, name, 0o400, device, uid, MAX_MANIFEST if name == "bundle.tree-manifest.json" else MAX_JSON)
            member_hashes[name] = item["sha256"]; member_inventory.append(item); identities.append(inode); documents[name] = strict_json(raw, MAX_MANIFEST if name == "bundle.tree-manifest.json" else MAX_JSON)
        bundle_fd = open_dir("bundle", container, 0o555, device, uid)
        try: entries, tree, tree_ids, package_count, payload = scan_bundle(bundle_fd, device, uid)
        finally: os.close(bundle_fd)
        identities.extend(tree_ids)
        if len(identities) != len(set(identities)): fail("STANDALONE_HARDLINK_FORBIDDEN")
        manifest = documents["bundle.tree-manifest.json"]
        if not isinstance(manifest, dict) or manifest.get("entries") != entries: fail("STANDALONE_MANIFEST_MISMATCH")
        index = documents["publication-index.json"]; acquisition = documents["acquisition-record.json"]; commit = documents["COMMIT"]
        artifact = index.get("artifactId") if isinstance(index, dict) else None
        provider = ARTIFACTS.get(artifact)
        index_hash = member_hashes["publication-index.json"]
        derived = f"{artifact}-{index_hash[7:39]}"
        if provider is None or publication_name != derived or commit.get("publicationIndexSha256") != index_hash or acquisition.get("canonicalSourceSnapshotSha256") != index.get("canonicalSourceSnapshotSha256"):
            fail("STANDALONE_BINDING_INVALID")
        report = {"artifactId": artifact, "canonicalSourceSnapshotSha256": index["canonicalSourceSnapshotSha256"], "counts": {"nodeCount": len(entries), "packageCount": package_count, "payloadBytes": payload}, "memberHashes": member_hashes, "memberInventory": member_inventory, "provider": provider, "publicationId": derived, "schemaVersion": "wordle-royale-g0-standalone-repro-scan/v1", "sourceRevision": index.get("sourceRevision"), "tree": tree, "treeSha256": member_hashes["bundle.tree-manifest.json"]}
        result = {"contentReport": report, "regularFileIdentities": sorted(identities, key=lambda x: tuple(map(int, x.split(":"))))}
        output = canonical(result)
        if len(output) > MAX_OUTPUT: fail("STANDALONE_OUTPUT_LIMIT")
        os.write(1, output)
    finally: os.close(container)


if __name__ == "__main__":
    try: main()
    except Exception as error:
        code = str(error)
        os.write(2, (code if re.fullmatch(r"[A-Z0-9_]+", code) else "STANDALONE_SCAN_FAILED").encode() + b"\n")
        raise SystemExit(1)
