#!/usr/bin/python3
"""Race-resistant, descriptor-relative copier for selected package payloads.

This is intentionally a small standalone boundary.  It consumes one canonical JSON
frame, uses no ambient configuration, and emits either one canonical result frame or
one fixed error frame.
"""
import hashlib
import base64
import json
import os
import stat
import sys

SCHEMA = "wordle-g0-bundle-copy/v2"
FRAME_HARD_MAX = 1024 * 1024
ROOT_FIELDS = {"schemaVersion", "sourceRoot", "destinationRoot", "selectedPackagePaths", "installedPackagePaths", "nativeExecutablePaths", "generatedFiles", "limits"}
GENERATED_FIELDS = {"path", "bytesBase64", "mode"}
LIMIT_FIELDS = {"maxPackages", "maxNodes", "maxSourceNodes", "maxPayloadBytes", "maxFileBytes", "maxPathBytes", "maxComponentBytes", "maxFrameBytes"}
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)

class CopyError(Exception):
    def __init__(self, code):
        self.code = code


def fail(code):
    raise CopyError(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"


def exact_object(value, fields, code):
    if type(value) is not dict or set(value) != fields:
        fail(code)


def ident(st):
    return (st.st_dev, st.st_ino, stat.S_IFMT(st.st_mode), stat.S_IMODE(st.st_mode), st.st_nlink,
            st.st_uid, st.st_gid, st.st_size, st.st_ctime_ns, st.st_mtime_ns)


def norm_absolute(path):
    if type(path) is not str or not path.startswith("/") or path == "/" or "\x00" in path or "\\" in path:
        fail("INPUT_PATH_INVALID")
    parts = path.split("/")[1:]
    if any(not p or p in (".", "..") for p in parts) or "/" + "/".join(parts) != path:
        fail("INPUT_PATH_INVALID")
    return parts


def validate_rel(path, limits, package=False):
    if type(path) is not str or not path or path.startswith("/") or "\x00" in path or "\\" in path:
        fail("INPUT_PATH_INVALID")
    try:
        raw = path.encode("utf-8")
    except UnicodeEncodeError:
        fail("INPUT_PATH_INVALID")
    parts = path.split("/")
    if any(not p or p in (".", "..") for p in parts):
        fail("INPUT_PATH_INVALID")
    if len(raw) > limits["maxPathBytes"] or any(len(p.encode("utf-8")) > limits["maxComponentBytes"] for p in parts):
        fail("PATH_LIMIT")
    if package:
        # A physical package path consists of one or more node_modules/package
        # segments; scoped package names consume two components.
        i = 0
        while i < len(parts):
            if parts[i] != "node_modules" or i + 1 >= len(parts):
                fail("PACKAGE_PATH_INVALID")
            i += 1
            if parts[i].startswith("@"):
                if len(parts[i]) == 1 or i + 1 >= len(parts):
                    fail("PACKAGE_PATH_INVALID")
                i += 2
            else:
                if parts[i].startswith("@"):
                    fail("PACKAGE_PATH_INVALID")
                i += 1
        if parts[-1] == "node_modules":
            fail("PACKAGE_PATH_INVALID")
    return parts


def sorted_unique(values, limits, package=False):
    if type(values) is not list:
        fail("INPUT_SCHEMA")
    for value in values:
        validate_rel(value, limits, package)
    if values != sorted(values, key=lambda x: x.encode("utf-8")) or len(set(values)) != len(values):
        fail("INPUT_ORDER")
    return values


def open_abs(parts):
    fd = os.open("/", DIR_FLAGS)
    try:
        for component in parts:
            nxt = os.open(component, DIR_FLAGS, dir_fd=fd)
            os.close(fd)
            fd = nxt
        return fd
    except Exception:
        os.close(fd)
        raise


def raw_names(fd, limits):
    names = []
    try:
        listed = os.listdir(fd)
    except OSError:
        fail("SOURCE_CHANGED")
    folded = set()
    for name in listed:
        try:
            raw = name.encode("utf-8")
        except UnicodeEncodeError:
            fail("SOURCE_NAME_INVALID")
        if not name or name in (".", "..") or b"/" in raw or b"\x00" in raw:
            fail("SOURCE_NAME_INVALID")
        if len(raw) > limits["maxComponentBytes"]:
            fail("PATH_LIMIT")
        key = name.casefold()
        if key in folded:
            fail("CASE_COLLISION")
        folded.add(key)
        names.append((raw, name))
    names.sort(key=lambda item: item[0])
    return names


def xattr_free(fd):
    try:
        if os.listxattr(fd):
            fail("SOURCE_XATTR")
    except CopyError:
        raise
    except (AttributeError, OSError):
        # Unsupported xattr queries are safe only for errors meaning unsupported.
        # Linux's procfs-style descriptors may report ENOTSUP; regular source
        # filesystems used here support fd queries.
        import errno
        try:
            os.listxattr(fd)
        except OSError as exc:
            if exc.errno not in (errno.ENOTSUP, errno.EOPNOTSUPP):
                fail("SOURCE_XATTR")


def validate_meta(st, root_dev, is_file=False):
    if st.st_dev != root_dev:
        fail("MOUNT_CROSSING")
    if stat.S_IMODE(st.st_mode) & (stat.S_ISUID | stat.S_ISGID | stat.S_ISVTX):
        fail("SOURCE_MODE")
    if is_file:
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            fail("SOURCE_NODE_UNSAFE")
        if st.st_size and st.st_blocks * 512 < st.st_size:
            fail("SOURCE_SPARSE")
    elif not stat.S_ISDIR(st.st_mode):
        fail("SOURCE_NODE_UNSAFE")


class Copier:
    def __init__(self, frame, src_fd, dst_fd):
        self.frame = frame
        self.limits = frame["limits"]
        self.src_fd = src_fd
        self.dst_fd = dst_fd
        self.root_dev = os.fstat(src_fd).st_dev
        self.installed = set(frame["installedPackagePaths"])
        self.selected = set(frame["selectedPackagePaths"])
        self.native = set(frame["nativeExecutablePaths"])
        self.nodes = 1                 # the destination root entry
        self.payload = 0
        self.file_inodes = set()
        self.snapshot = []
        self.entries = {}
        self.created_dirs = {"."}
        self.entries["."] = {"path": ".", "type": "directory", "mode": 0o555}

    def discover_packages(self, root_fd):
        """Independently enumerate physical roots below every node_modules."""
        found = []
        seen_dirs = set()
        source_nodes = 1

        def visit(fd, rel):
            nonlocal source_nodes
            st = os.fstat(fd)
            key = (st.st_dev, st.st_ino)
            if key in seen_dirs:
                fail("SOURCE_CHANGED")
            seen_dirs.add(key)
            for _, name in raw_names(fd, self.limits):
                source_nodes += 1
                if source_nodes > self.limits["maxSourceNodes"]:
                    fail("SOURCE_NODE_LIMIT")
                if name == ".bin" and rel.split("/")[-1] == "node_modules":
                    continue
                try:
                    child_st = os.stat(name, dir_fd=fd, follow_symlinks=False)
                except OSError:
                    fail("SOURCE_CHANGED")
                if not stat.S_ISDIR(child_st.st_mode):
                    continue
                child = name if rel == "." else f"{rel}/{name}"
                cfd, _ = self.source_dir(fd, name)
                try:
                    parts = rel.split("/")
                    candidate = (parts[-1] == "node_modules" and not name.startswith("@") and not name.startswith(".")) or (
                        len(parts) >= 2 and parts[-2] == "node_modules" and parts[-1].startswith("@"))
                    if candidate:
                        found.append(child)
                    visit(cfd, child)
                finally:
                    os.close(cfd)

        visit(root_fd, ".")
        return sorted(found, key=lambda x: x.encode("utf-8"))

    def bump_path(self, path):
        raw = path.encode("utf-8")
        if len(raw) > self.limits["maxPathBytes"]:
            fail("PATH_LIMIT")
        self.nodes += 1
        if self.nodes > self.limits["maxNodes"]:
            fail("NODE_LIMIT")

    def source_dir(self, parent_fd, name, expected=None):
        try:
            before = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
            after = os.fstat(fd)
        except OSError:
            fail("SOURCE_CHANGED")
        if ident(before) != ident(after) or not stat.S_ISDIR(after.st_mode):
            os.close(fd); fail("SOURCE_CHANGED")
        validate_meta(after, self.root_dev)
        xattr_free(fd)
        if expected is not None and ident(after) != expected:
            os.close(fd); fail("SOURCE_CHANGED")
        return fd, after

    def ensure_dest_dir(self, path):
        if path in self.created_dirs:
            return
        parent, name = path.rsplit("/", 1) if "/" in path else (".", path)
        self.ensure_dest_dir(parent)
        pfd = self.open_dest(parent)
        try:
            os.mkdir(name, 0o700, dir_fd=pfd)
            st1 = os.stat(name, dir_fd=pfd, follow_symlinks=False)
            fd = os.open(name, DIR_FLAGS, dir_fd=pfd)
            st2 = os.fstat(fd)
            if ident(st1) != ident(st2) or st2.st_nlink < 2:
                fail("DESTINATION_COLLISION")
            os.close(fd)
        except FileExistsError:
            fail("DESTINATION_COLLISION")
        except CopyError:
            raise
        except OSError:
            fail("DESTINATION_FAILURE")
        finally:
            os.close(pfd)
        self.created_dirs.add(path)
        self.entries[path] = {"path": path, "type": "directory", "mode": 0o555}
        self.bump_path(path)

    def open_dest(self, path):
        fd = os.dup(self.dst_fd)
        if path == ".":
            return fd
        try:
            for part in path.split("/"):
                nxt = os.open(part, DIR_FLAGS, dir_fd=fd)
                os.close(fd); fd = nxt
            return fd
        except OSError:
            os.close(fd); fail("DESTINATION_CHANGED")

    def copy_file(self, parent_fd, name, rel, st_l, out_snapshot):
        if st_l.st_size > self.limits["maxFileBytes"]:
            fail("FILE_LIMIT")
        key = (st_l.st_dev, st_l.st_ino)
        if key in self.file_inodes:
            fail("SOURCE_HARDLINK")
        self.file_inodes.add(key)
        try:
            sfd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
            st0 = os.fstat(sfd)
        except OSError:
            fail("SOURCE_CHANGED")
        try:
            if ident(st_l) != ident(st0):
                fail("SOURCE_CHANGED")
            validate_meta(st0, self.root_dev, True)
            xattr_free(sfd)
            parent, leaf = rel.rsplit("/", 1) if "/" in rel else (".", rel)
            self.ensure_dest_dir(parent)
            dfd = self.open_dest(parent)
            mode = 0o555 if rel in self.native else 0o444
            try:
                out = os.open(leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=dfd)
            except FileExistsError:
                fail("DESTINATION_COLLISION")
            except OSError:
                fail("DESTINATION_FAILURE")
            finally:
                os.close(dfd)
            digest = hashlib.sha256()
            total = 0
            try:
                while True:
                    chunk = os.read(sfd, 64 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    self.payload += len(chunk)
                    if total > self.limits["maxFileBytes"]:
                        fail("FILE_LIMIT")
                    if self.payload > self.limits["maxPayloadBytes"]:
                        fail("PAYLOAD_LIMIT")
                    digest.update(chunk)
                    view = memoryview(chunk)
                    while view:
                        written = os.write(out, view)
                        if written <= 0:
                            fail("DESTINATION_FAILURE")
                        view = view[written:]
                os.fchmod(out, mode)
                dst_st = os.fstat(out)
                if dst_st.st_nlink != 1 or not stat.S_ISREG(dst_st.st_mode):
                    fail("DESTINATION_CHANGED")
            finally:
                os.close(out)
            st1 = os.fstat(sfd)
            try:
                path_st = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            except OSError:
                fail("SOURCE_CHANGED")
            if total != st0.st_size or ident(st0) != ident(st1) or ident(st0) != ident(path_st):
                fail("SOURCE_CHANGED")
            sha = digest.hexdigest()
            self.entries[rel] = {"path": rel, "type": "file", "mode": mode, "sha256": "sha256:" + sha}
            self.bump_path(rel)
            out_snapshot.append((rel, "f", ident(st0), sha))
        finally:
            os.close(sfd)

    def write_generated(self, record):
        rel = record["path"]
        try:
            data = base64.b64decode(record["bytesBase64"], validate=True)
        except Exception:
            fail("GENERATED_INVALID")
        parent, leaf = rel.rsplit("/", 1) if "/" in rel else (".", rel)
        self.ensure_dest_dir(parent)
        dfd = self.open_dest(parent)
        try:
            try:
                out = os.open(leaf, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=dfd)
            except FileExistsError:
                fail("GENERATED_COLLISION")
            except OSError:
                fail("DESTINATION_FAILURE")
        finally:
            os.close(dfd)
        try:
            view = memoryview(data)
            while view:
                written = os.write(out, view)
                if written <= 0:
                    fail("DESTINATION_FAILURE")
                view = view[written:]
            os.fchmod(out, 0o444)
            st = os.fstat(out)
            if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
                fail("DESTINATION_CHANGED")
        finally:
            os.close(out)
        self.payload += len(data)
        if self.payload > self.limits["maxPayloadBytes"]:
            fail("PAYLOAD_LIMIT")
        self.entries[rel] = {"path": rel, "type": "file", "mode": 0o444,
                             "sha256": "sha256:" + hashlib.sha256(data).hexdigest()}
        self.bump_path(rel)

    def descend_path(self, root_fd, path):
        fd = os.dup(root_fd)
        ancestry = []
        try:
            prefix = []
            for part in path.split("/"):
                # Enumerating every held parent detects invalid UTF-8 and case
                # collisions in package-path ancestors, and binds their entry sets.
                parent_st = os.fstat(fd)
                parent_names = raw_names(fd, self.limits)
                parent_hash = hashlib.sha256(b"\0".join(raw for raw, _ in parent_names)).hexdigest()
                if part not in {name for _, name in parent_names}:
                    fail("SOURCE_CHANGED")
                prefix.append(part)
                nxt, st = self.source_dir(fd, part)
                os.close(fd); fd = nxt
                ancestry.append(("/".join(prefix[:-1]) or ".", ident(parent_st), parent_hash,
                                 "/".join(prefix), ident(st)))
            return fd, ancestry
        except Exception:
            os.close(fd)
            raise

    def walk(self, fd, rel, copy, out_snapshot):
        start = os.fstat(fd)
        validate_meta(start, self.root_dev)
        xattr_free(fd)
        names = raw_names(fd, self.limits)
        name_bytes = tuple(raw for raw, _ in names)
        out_snapshot.append((rel, "d", ident(start), hashlib.sha256(b"\0".join(name_bytes)).hexdigest()))
        if copy:
            self.ensure_dest_dir(rel)
        for _, name in names:
            child = f"{rel}/{name}"
            # node_modules/.bin is the sole ignored source entry, regardless of type.
            if name == ".bin" and rel.split("/")[-1] == "node_modules":
                continue
            # Recognize physical package roots while traversing nested
            # node_modules. Scope directories are containers, not packages.
            rel_parts = rel.split("/")
            package_candidate = (rel_parts[-1] == "node_modules" and not name.startswith("@")) or (
                len(rel_parts) >= 2 and rel_parts[-2] == "node_modules" and rel_parts[-1].startswith("@"))
            if package_candidate and child != rel:
                if child not in self.installed:
                    fail("UNTRACKED_NESTED_PACKAGE")
                if child in self.selected:
                    continue
                fail("UNSELECTED_NESTED_PACKAGE")
            try:
                st_l = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except OSError:
                fail("SOURCE_CHANGED")
            validate_meta(st_l, self.root_dev, stat.S_ISREG(st_l.st_mode))
            if stat.S_ISDIR(st_l.st_mode):
                cfd, _ = self.source_dir(fd, name)
                try:
                    self.walk(cfd, child, copy, out_snapshot)
                finally:
                    os.close(cfd)
            elif stat.S_ISREG(st_l.st_mode):
                if copy:
                    self.copy_file(fd, name, child, st_l, out_snapshot)
                else:
                    self.hash_file(fd, name, child, st_l, out_snapshot)
            else:
                fail("SOURCE_NODE_UNSAFE")
        end = os.fstat(fd)
        if ident(start) != ident(end) or name_bytes != tuple(raw for raw, _ in raw_names(fd, self.limits)):
            fail("SOURCE_CHANGED")

    def hash_file(self, parent_fd, name, rel, st_l, out_snapshot):
        try:
            fd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
            st0 = os.fstat(fd)
        except OSError:
            fail("SOURCE_CHANGED")
        try:
            if ident(st_l) != ident(st0): fail("SOURCE_CHANGED")
            validate_meta(st0, self.root_dev, True); xattr_free(fd)
            h = hashlib.sha256(); total = 0
            while True:
                data = os.read(fd, 64 * 1024)
                if not data: break
                total += len(data)
                if total > self.limits["maxFileBytes"]: fail("FILE_LIMIT")
                h.update(data)
            st1 = os.fstat(fd)
            path_st = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
            if total != st0.st_size or ident(st0) != ident(st1) or ident(st0) != ident(path_st): fail("SOURCE_CHANGED")
            out_snapshot.append((rel, "f", ident(st0), h.hexdigest()))
        finally:
            os.close(fd)

    def run(self):
        if self.discover_packages(self.src_fd) != self.frame["installedPackagePaths"]:
            fail("INSTALLED_PACKAGE_SET_MISMATCH")
        first = []
        ancestry_first = []
        for package in self.frame["selectedPackagePaths"]:
            fd, ancestry = self.descend_path(self.src_fd, package)
            ancestry_first.append((package, ancestry))
            try: self.walk(fd, package, True, first)
            finally: os.close(fd)
        if set(self.native) - set(self.entries):
            fail("NATIVE_PATH_MISSING")
        if any(self.entries[p]["type"] != "file" for p in self.native):
            fail("NATIVE_PATH_INVALID")
        for record in self.frame["generatedFiles"]:
            self.write_generated(record)
        # Reopen the source by its absolute name, proving the held root itself was
        # not detached/replaced, then independently enumerate and hash everything.
        fresh = open_abs(norm_absolute(self.frame["sourceRoot"]))
        try:
            if ident(os.fstat(fresh)) != ident(os.fstat(self.src_fd)):
                fail("SOURCE_CHANGED")
            if self.discover_packages(fresh) != self.frame["installedPackagePaths"]:
                fail("INSTALLED_PACKAGE_SET_MISMATCH")
            second = []
            ancestry_second = []
            for package in self.frame["selectedPackagePaths"]:
                fd, ancestry = self.descend_path(fresh, package)
                ancestry_second.append((package, ancestry))
                try: self.walk(fd, package, False, second)
                finally: os.close(fd)
        finally:
            os.close(fresh)
        if first != second or ancestry_first != ancestry_second:
            fail("SOURCE_CHANGED")
        # Final destination normalization happens only after source acceptance.
        for path in sorted(self.created_dirs, key=lambda p: (p.count("/"), p.encode("utf-8")), reverse=True):
            fd = self.open_dest(path)
            try:
                xattr_free(fd)
                os.fchmod(fd, 0o555)
            finally: os.close(fd)
        entries = [self.entries[p] for p in sorted(self.entries, key=lambda p: p.encode("utf-8"))]
        snapshot_bytes = canonical([[p, t, list(meta), sha] for p, t, meta, sha in first])
        return {"schemaVersion": SCHEMA, "packageCount": len(self.selected), "nodeCount": len(entries),
                "payloadBytes": self.payload, "entries": entries,
                "sourceSnapshotSha256": "sha256:" + hashlib.sha256(snapshot_bytes).hexdigest()}


def parse_frame():
    if len(sys.argv) != 1:
        fail("ARGV_FORBIDDEN")
    data = sys.stdin.buffer.read(FRAME_HARD_MAX + 1)
    if not data or len(data) > FRAME_HARD_MAX or not data.endswith(b"\n") or data.endswith(b"\n\n"):
        fail("FRAME_INVALID")
    try:
        text = data.decode("utf-8")
        frame = json.loads(text)
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail("FRAME_INVALID")
    exact_object(frame, ROOT_FIELDS, "INPUT_SCHEMA")
    exact_object(frame.get("limits"), LIMIT_FIELDS, "INPUT_SCHEMA")
    limits = frame["limits"]
    for key, value in limits.items():
        if type(value) is not int or value <= 0 or value > 1 << 40:
            fail("INPUT_LIMIT_INVALID")
    if limits["maxComponentBytes"] > 255 or limits["maxPathBytes"] > 1024 or limits["maxSourceNodes"] > 20_000 or limits["maxFileBytes"] > 224 * 1024 * 1024 or limits["maxFrameBytes"] > FRAME_HARD_MAX:
        fail("INPUT_LIMIT_INVALID")
    if len(data) > limits["maxFrameBytes"] or data != canonical(frame):
        fail("FRAME_INVALID")
    if frame["schemaVersion"] != SCHEMA:
        fail("INPUT_SCHEMA")
    norm_absolute(frame["sourceRoot"]); dest_parts = norm_absolute(frame["destinationRoot"])
    selected = sorted_unique(frame["selectedPackagePaths"], limits, True)
    installed = sorted_unique(frame["installedPackagePaths"], limits, True)
    natives = sorted_unique(frame["nativeExecutablePaths"], limits, False)
    generated = frame["generatedFiles"]
    if type(generated) is not list or len(generated) != 2:
        fail("GENERATED_INVALID")
    generated_paths = []
    for record in generated:
        exact_object(record, GENERATED_FIELDS, "GENERATED_INVALID")
        validate_rel(record["path"], limits)
        if record["mode"] != 0o444 or type(record["bytesBase64"]) is not str:
            fail("GENERATED_INVALID")
        try:
            decoded = base64.b64decode(record["bytesBase64"], validate=True)
        except Exception:
            fail("GENERATED_INVALID")
        if base64.b64encode(decoded).decode("ascii") != record["bytesBase64"] or len(decoded) > min(limits["maxFileBytes"], 256 * 1024):
            fail("GENERATED_INVALID")
        generated_paths.append(record["path"])
    if generated_paths != sorted(generated_paths, key=lambda x: x.encode("utf-8")) or len(set(generated_paths)) != 2:
        fail("GENERATED_INVALID")
    if set(generated_paths) != {"package-lock.json", next((p for p in generated_paths if p.startswith("invocation-profiles/") and p.endswith("/1.json")), "")}:
        fail("GENERATED_INVALID")
    if len(selected) > limits["maxPackages"] or not set(selected) <= set(installed):
        fail("PACKAGE_SET_INVALID")
    # Exact native subset means each native belongs to one selected package and
    # every listed path is strictly below that package.
    if any(not any(n.startswith(p + "/") for p in selected) for n in natives):
        fail("NATIVE_SET_INVALID")
    return frame, dest_parts


def main():
    src_fd = parent_fd = dst_fd = check_parent_fd = check_dst_fd = None
    try:
        frame, dest_parts = parse_frame()
        src_fd = open_abs(norm_absolute(frame["sourceRoot"]))
        src_st = os.fstat(src_fd)
        if src_st.st_uid != os.getuid() or stat.S_IMODE(src_st.st_mode) & 0o022 or not stat.S_ISDIR(src_st.st_mode):
            fail("SOURCE_ROOT_UNSAFE")
        xattr_free(src_fd)
        parent_fd = open_abs(dest_parts[:-1])
        pst = os.fstat(parent_fd)
        if pst.st_uid != os.getuid() or stat.S_IMODE(pst.st_mode) & 0o077:
            fail("DESTINATION_PARENT_UNSAFE")
        leaf = dest_parts[-1]
        try:
            os.mkdir(leaf, 0o700, dir_fd=parent_fd)
        except FileExistsError:
            fail("DESTINATION_COLLISION")
        except OSError:
            fail("DESTINATION_FAILURE")
        lst = os.stat(leaf, dir_fd=parent_fd, follow_symlinks=False)
        dst_fd = os.open(leaf, DIR_FLAGS, dir_fd=parent_fd)
        if ident(lst) != ident(os.fstat(dst_fd)):
            fail("DESTINATION_CHANGED")
        result = Copier(frame, src_fd, dst_fd).run()
        # Bind success to the still-named destination. All writes above are
        # descriptor-relative, but a same-UID actor could detach the held parent
        # or leaf while copying. A detached staging tree is never accepted.
        check_parent_fd = open_abs(dest_parts[:-1])
        if ident(os.fstat(check_parent_fd)) != ident(os.fstat(parent_fd)):
            fail("DESTINATION_CHANGED")
        try:
            check_dst_fd = os.open(leaf, DIR_FLAGS, dir_fd=check_parent_fd)
        except OSError:
            fail("DESTINATION_CHANGED")
        if check_dst_fd is None or ident(os.fstat(check_dst_fd)) != ident(os.fstat(dst_fd)):
            fail("DESTINATION_CHANGED")
        sys.stdout.buffer.write(canonical(result))
        return 0
    except CopyError as exc:
        sys.stdout.buffer.write(canonical({"error": exc.code}))
        return 1
    except Exception:
        sys.stdout.buffer.write(canonical({"error": "COPY_INTERNAL"}))
        return 1
    finally:
        for fd in (check_dst_fd, check_parent_fd, dst_fd, parent_fd, src_fd):
            if fd is not None:
                try: os.close(fd)
                except OSError: pass

if __name__ == "__main__":
    raise SystemExit(main())
