#!/usr/bin/python3
"""AN-4b1 descriptor-relative local publication transaction boundary.

The program consumes one bounded canonical JSON frame, operates exclusively below
inherited publication-parent fd 4, and emits one canonical report.  It never
resolves an ambient path and deliberately has no rename(2) fallback.
"""
import ctypes
import errno
import json
import os
import re
import stat
import sys

SCHEMA = "wordle-royale-g0-bundle-publication-helper/v1"
FRAME_HARD_MAX = 64 * 1024
PARENT_FD = 4
RENAME_NOREPLACE = 1
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0)
LIMIT_FIELDS = {"maxDepth", "maxFrameBytes", "maxNodes"}
COMMON_FIELDS = {
    "action", "expectedParentDev", "expectedParentIno", "expectedScratchDev",
    "expectedScratchIno", "limits", "schemaVersion", "scratchName",
}
PUBLISH_FIELDS = COMMON_FIELDS | {
    "expectedContainerDev", "expectedContainerIno", "publicationName",
}
SCRATCH_RE = re.compile(r"\.an4-tmp-[0-9a-f]{32}\Z")
PUBLICATION_RE = re.compile(r"(?:vercel-58\.4\.4|railway-5\.30\.1|supabase-2\.110\.0)-[0-9a-f]{32}\Z")
DECIMAL_RE = re.compile(r"(?:0|[1-9][0-9]*)\Z")


class TransactionError(Exception):
    def __init__(self, code):
        self.code = code


def fail(code):
    raise TransactionError(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail("FRAME_INVALID")
        result[key] = value
    return result


def decimal(value):
    if type(value) is not str or DECIMAL_RE.fullmatch(value) is None:
        fail("INPUT_SCHEMA")
    number = int(value)
    if number > (1 << 64) - 1:
        fail("INPUT_SCHEMA")
    return number


def identity(st):
    return st.st_dev, st.st_ino


def same_node(left, right):
    return identity(left) == identity(right) and stat.S_IFMT(left.st_mode) == stat.S_IFMT(right.st_mode)


def expected(frame, prefix):
    return decimal(frame[f"expected{prefix}Dev"]), decimal(frame[f"expected{prefix}Ino"])


def parse_frame():
    if len(sys.argv) != 1:
        fail("ARGV_FORBIDDEN")
    data = sys.stdin.buffer.read(FRAME_HARD_MAX + 1)
    if not data or len(data) > FRAME_HARD_MAX or not data.endswith(b"\n") or data.endswith(b"\n\n"):
        fail("FRAME_INVALID")
    try:
        frame = json.loads(data.decode("utf-8"), object_pairs_hook=no_duplicates)
    except TransactionError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail("FRAME_INVALID")
    if type(frame) is not dict or frame.get("action") not in ("publish", "cleanup"):
        fail("INPUT_SCHEMA")
    fields = PUBLISH_FIELDS if frame["action"] == "publish" else COMMON_FIELDS
    if set(frame) != fields or frame.get("schemaVersion") != SCHEMA:
        fail("INPUT_SCHEMA")
    limits = frame.get("limits")
    if type(limits) is not dict or set(limits) != LIMIT_FIELDS:
        fail("INPUT_SCHEMA")
    for value in limits.values():
        if type(value) is not int or value <= 0:
            fail("INPUT_LIMIT_INVALID")
    if limits["maxFrameBytes"] > FRAME_HARD_MAX or limits["maxNodes"] > 20_000 or limits["maxDepth"] > 128:
        fail("INPUT_LIMIT_INVALID")
    if len(data) > limits["maxFrameBytes"] or data != canonical(frame):
        fail("FRAME_INVALID")
    if type(frame["scratchName"]) is not str or SCRATCH_RE.fullmatch(frame["scratchName"]) is None:
        fail("SCRATCH_NAME_INVALID")
    expected(frame, "Parent")
    expected(frame, "Scratch")
    if frame["action"] == "publish":
        if type(frame["publicationName"]) is not str or PUBLICATION_RE.fullmatch(frame["publicationName"]) is None:
            fail("PUBLICATION_NAME_INVALID")
        expected(frame, "Container")
    return frame


def verify_parent(frame):
    try:
        st = os.fstat(PARENT_FD)
    except OSError:
        fail("PARENT_FD_INVALID")
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700:
        fail("PARENT_UNSAFE")
    if identity(st) != expected(frame, "Parent"):
        fail("PARENT_IDENTITY_LOST")
    return st


def open_named_dir(parent_fd, name, wanted, parent_dev, unsafe_code, lost_code, mode=None):
    try:
        named = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
        held = os.fstat(fd)
    except OSError:
        fail(lost_code)
    if not same_node(named, held) or identity(held) != wanted:
        os.close(fd)
        fail(lost_code)
    if not stat.S_ISDIR(held.st_mode) or held.st_dev != parent_dev or held.st_uid != os.getuid():
        os.close(fd)
        fail(unsafe_code)
    if mode is not None and stat.S_IMODE(held.st_mode) != mode:
        os.close(fd)
        fail(unsafe_code)
    return fd, held


def parent_still(frame, original):
    now = verify_parent(frame)
    if not same_node(original, now):
        fail("PARENT_IDENTITY_LOST")


def rename_noreplace(old_fd, old_name, new_fd, new_name):
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        call = libc.renameat2
    except (AttributeError, OSError):
        fail("RENAME_NOREPLACE_UNAVAILABLE")
    call.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    call.restype = ctypes.c_int
    result = call(old_fd, os.fsencode(old_name), new_fd, os.fsencode(new_name), RENAME_NOREPLACE)
    if result == 0:
        return
    number = ctypes.get_errno()
    if number in (errno.EEXIST, errno.ENOTEMPTY):
        fail("COLLISION")
    if number == errno.EXDEV:
        fail("CROSS_DEVICE")
    if number in (errno.ENOSYS, errno.EINVAL, errno.EOPNOTSUPP, errno.ENOTSUP):
        fail("RENAME_NOREPLACE_UNAVAILABLE")
    fail("RENAME_NOREPLACE_FAILED")


def named_matches(parent_fd, name, held_st):
    try:
        named = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except OSError:
        return False
    return same_node(named, held_st)


def publish(frame, parent_st):
    scratch_fd = container_fd = None
    try:
        scratch_fd, scratch_st = open_named_dir(
            PARENT_FD, frame["scratchName"], expected(frame, "Scratch"), parent_st.st_dev,
            "SCRATCH_UNSAFE", "SCRATCH_IDENTITY_LOST", 0o700,
        )
        container_fd, container_st = open_named_dir(
            scratch_fd, frame["publicationName"], expected(frame, "Container"), parent_st.st_dev,
            "CONTAINER_UNSAFE", "CONTAINER_IDENTITY_LOST", 0o700,
        )
        parent_still(frame, parent_st)
        # The only publication operation: Linux atomic no-replace rename.
        rename_noreplace(scratch_fd, frame["publicationName"], PARENT_FD, frame["publicationName"])
        try:
            os.fsync(PARENT_FD)
        except OSError:
            fail("PARENT_FSYNC_FAILED")
        parent_still(frame, parent_st)
        final_fd = None
        try:
            final_fd = os.open(frame["publicationName"], DIR_FLAGS, dir_fd=PARENT_FD)
            final_st = os.fstat(final_fd)
            if not same_node(container_st, final_st):
                fail("CONTAINER_IDENTITY_LOST")
        except TransactionError:
            raise
        except OSError:
            fail("CONTAINER_IDENTITY_LOST")
        finally:
            if final_fd is not None:
                os.close(final_fd)
        if not named_matches(PARENT_FD, frame["scratchName"], scratch_st):
            fail("SCRATCH_IDENTITY_LOST")
        try:
            os.rmdir(frame["scratchName"], dir_fd=PARENT_FD)
        except OSError:
            fail("SCRATCH_REMOVE_FAILED")
        try:
            os.fsync(PARENT_FD)
        except OSError:
            fail("PARENT_FSYNC_FAILED")
        parent_still(frame, parent_st)
        return "PUBLISHED"
    finally:
        for fd in (container_fd, scratch_fd):
            if fd is not None:
                try:
                    os.close(fd)
                except OSError:
                    pass


class Cleaner:
    def __init__(self, frame, root_dev):
        self.frame = frame
        self.root_dev = root_dev
        self.nodes = 0
        self.lost = False
        self.seen_dirs = set()

    def bump(self, depth):
        self.nodes += 1
        if self.nodes > self.frame["limits"]["maxNodes"] or depth > self.frame["limits"]["maxDepth"]:
            fail("CLEANUP_LIMIT")

    def walk(self, fd, depth):
        held_dir = os.fstat(fd)
        # Normalized bundle directories are read-only (0555). Once the exact
        # held, owner/device-checked directory has been selected for cleanup,
        # temporarily restore owner write permission so verified children can
        # be unlinked descriptor-relatively.
        try:
            os.fchmod(fd, 0o700)
            held_dir = os.fstat(fd)
        except OSError:
            self.lost = True
            return
        key = identity(held_dir)
        if key in self.seen_dirs:
            self.lost = True
            return
        self.seen_dirs.add(key)
        try:
            names = os.listdir(fd)
        except OSError:
            self.lost = True
            return
        try:
            names.sort(key=lambda name: os.fsencode(name))
        except (UnicodeEncodeError, TypeError):
            self.lost = True
            return
        for name in names:
            self.bump(depth)
            if type(name) is not str or not name or name in (".", "..") or "/" in name or "\x00" in name:
                self.lost = True
                continue
            try:
                named = os.stat(name, dir_fd=fd, follow_symlinks=False)
            except OSError:
                self.lost = True
                continue
            if named.st_dev != self.root_dev or named.st_uid != os.getuid():
                self.lost = True
                continue
            if stat.S_ISDIR(named.st_mode):
                child_fd = None
                try:
                    child_fd = os.open(name, DIR_FLAGS, dir_fd=fd)
                    child_st = os.fstat(child_fd)
                    if not same_node(named, child_st) or child_st.st_dev != self.root_dev or child_st.st_uid != os.getuid():
                        self.lost = True
                        continue
                    self.walk(child_fd, depth + 1)
                    if not named_matches(fd, name, child_st):
                        self.lost = True
                        continue
                    try:
                        os.rmdir(name, dir_fd=fd)
                    except OSError:
                        self.lost = True
                except OSError:
                    self.lost = True
                finally:
                    if child_fd is not None:
                        os.close(child_fd)
            elif stat.S_ISREG(named.st_mode) and named.st_nlink == 1:
                child_fd = None
                try:
                    child_fd = os.open(name, FILE_FLAGS, dir_fd=fd)
                    child_st = os.fstat(child_fd)
                    if not same_node(named, child_st) or not stat.S_ISREG(child_st.st_mode) or child_st.st_nlink != 1 or child_st.st_dev != self.root_dev:
                        self.lost = True
                        continue
                    latest = os.fstat(child_fd)
                    if not same_node(child_st, latest) or latest.st_nlink != 1 or not named_matches(fd, name, latest):
                        self.lost = True
                        continue
                    try:
                        os.unlink(name, dir_fd=fd)
                    except OSError:
                        self.lost = True
                except OSError:
                    self.lost = True
                finally:
                    if child_fd is not None:
                        os.close(child_fd)
            else:
                # Symlinks, hardlinks and special nodes are attacker replacements,
                # not cleanup authority. Preserve them for unprivileged review.
                self.lost = True
        try:
            os.fsync(fd)
        except OSError:
            self.lost = True


def cleanup(frame, parent_st):
    scratch_fd = None
    try:
        try:
            scratch_fd, scratch_st = open_named_dir(
                PARENT_FD, frame["scratchName"], expected(frame, "Scratch"), parent_st.st_dev,
                "SCRATCH_UNSAFE", "SCRATCH_IDENTITY_LOST", 0o700,
            )
        except TransactionError as exc:
            if exc.code in ("SCRATCH_IDENTITY_LOST", "SCRATCH_UNSAFE"):
                return "CLEANUP_IDENTITY_LOST"
            raise
        cleaner = Cleaner(frame, parent_st.st_dev)
        cleaner.walk(scratch_fd, 1)
        parent_still(frame, parent_st)
        if cleaner.lost or not named_matches(PARENT_FD, frame["scratchName"], scratch_st):
            return "CLEANUP_IDENTITY_LOST"
        try:
            os.rmdir(frame["scratchName"], dir_fd=PARENT_FD)
            os.fsync(PARENT_FD)
        except OSError:
            return "CLEANUP_IDENTITY_LOST"
        parent_still(frame, parent_st)
        return "CLEANED"
    finally:
        if scratch_fd is not None:
            try:
                os.close(scratch_fd)
            except OSError:
                pass


def main():
    try:
        frame = parse_frame()
        parent_st = verify_parent(frame)
        result = publish(frame, parent_st) if frame["action"] == "publish" else cleanup(frame, parent_st)
        sys.stdout.buffer.write(canonical({"status": result}))
        if result in ("PUBLISHED", "CLEANED"):
            return 0
        if result == "CLEANUP_IDENTITY_LOST":
            return 3
        return 2
    except TransactionError as exc:
        if exc.code == "COLLISION":
            sys.stdout.buffer.write(canonical({"status": "COLLISION"}))
            return 2
        sys.stdout.buffer.write(canonical({"error": exc.code}))
        return 1
    except Exception:
        sys.stdout.buffer.write(canonical({"error": "TRANSACTION_INTERNAL"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
