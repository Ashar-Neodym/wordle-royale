#!/usr/bin/python3
"""Linux-only persistent subreaper for the Wave AI G2 adapter boundary.

The parent pins this source, Python, and the adapter with open descriptors.  This
process owns every adapter fork so orphaned descendants are adopted here and
removed before a framed response is returned.
"""
import base64
import ctypes
import errno
import hashlib
import json
import os
import selectors
import signal
import struct
import sys
import time

PR_SET_PDEATHSIG = 1
PR_SET_CHILD_SUBREAPER = 36
SIGKILL = signal.SIGKILL
MAX_FRAME = 1_048_576
ADAPTER_FD = 5
DESCRIPTOR_FD = 3
MAX_DESCRIPTOR = 4096
MAX_CONTEXT = 8192
EMPTY_SCANS_REQUIRED = 3
SCAN_SLEEP = 0.01
CLEANUP_SECONDS = 2.0
ENV = {"LANG": "C", "LC_ALL": "C", "PATH": "/usr/bin:/bin", "TZ": "UTC"}

libc = ctypes.CDLL(None, use_errno=True)
if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
    raise SystemExit(70)
collector_pid = os.getppid()
if libc.prctl(PR_SET_PDEATHSIG, int(signal.SIGTERM), 0, 0, 0) != 0 or os.getppid() != collector_pid:
    raise SystemExit(70)

class Shutdown(Exception):
    pass

shutdown_requested = False

def on_signal(_signum, _frame):
    global shutdown_requested
    # Parent death and pipe closure can race, and Linux may deliver more than
    # one termination signal while the collector's thread group exits.  A
    # raised asynchronous exception can interrupt cleanup itself and let an
    # adopted grandchild outlive this subreaper.  Latch shutdown instead;
    # read EOF wakes the protocol loop and execute() polls this flag.
    shutdown_requested = True

signal.signal(signal.SIGTERM, on_signal)
signal.signal(signal.SIGINT, on_signal)
signal.signal(signal.SIGHUP, on_signal)
signal.signal(signal.SIGPIPE, signal.SIG_IGN)

def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate")
        result[key] = value
    return result

def read_exact(length):
    chunks = []
    remaining = length
    while remaining:
        chunk = os.read(0, remaining)
        if not chunk:
            if remaining == length:
                return None
            raise ValueError("truncated")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)

def read_frame():
    header = read_exact(4)
    if header is None:
        return None
    length = struct.unpack(">I", header)[0]
    if length < 2 or length > MAX_FRAME:
        raise ValueError("frame")
    body = read_exact(length)
    if body is None:
        raise ValueError("truncated")
    return json.loads(body.decode("utf-8", "strict"), object_pairs_hook=strict_object)

def write_frame(value):
    body = json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("ascii")
    if len(body) > MAX_FRAME:
        raise ValueError("response")
    os.write(1, struct.pack(">I", len(body)) + body)

def proc_snapshot():
    result = {}
    try:
        names = os.listdir("/proc")
    except OSError:
        return result
    for name in names:
        if not name.isdigit():
            continue
        pid = int(name)
        try:
            with open("/proc/" + name + "/stat", "rb", buffering=0) as handle:
                raw = handle.read(4096)
            end = raw.rfind(b")")
            fields = raw[end + 2:].split()
            result[pid] = (int(fields[1]), int(fields[19]))
        except (OSError, ValueError, IndexError):
            continue
    return result

def descendant_identities(initial_pid, known):
    snapshot = proc_snapshot()
    mine = os.getpid()
    selected = set()
    # Adopted or direct children are authoritative roots.  Preserve identities
    # already observed so PID reuse cannot redirect a signal.
    for pid, identity in snapshot.items():
        if identity[0] == mine or (pid in known and known[pid] == identity[1]):
            selected.add(pid)
    if initial_pid in snapshot:
        selected.add(initial_pid)
    changed = True
    while changed:
        changed = False
        for pid, identity in snapshot.items():
            if identity[0] in selected and pid not in selected:
                selected.add(pid)
                changed = True
    identities = {pid: snapshot[pid][1] for pid in selected if pid != mine}
    known.update(identities)
    return identities

def reap_all():
    while True:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
            if pid == 0:
                return
        except ChildProcessError:
            return
        except InterruptedError:
            continue

def drain(fd, target, limit):
    try:
        chunk = os.read(fd, 65536)
    except BlockingIOError:
        return True, False
    if not chunk:
        return False, False
    target.extend(chunk)
    return True, len(target) > limit

def cleanup(initial_pid, pgid, known, pipes, deadline=None, overflow=None):
    end = deadline if deadline is not None else time.monotonic() + CLEANUP_SECONDS
    if pgid > 0:
        try:
            os.killpg(pgid, SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    empty = 0
    targets = {item[0]: item[1:] for item in pipes if item and item[0] is not None}
    pipe_open = set(targets)
    for fd in pipe_open:
        os.set_blocking(fd, False)
    while time.monotonic() < end:
        identities = descendant_identities(initial_pid, known)
        for pid, start in identities.items():
            current = proc_snapshot().get(pid)
            if current is not None and current[1] == start:
                try:
                    os.kill(pid, SIGKILL)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    return False
        reap_all()
        for fd in tuple(pipe_open):
            try:
                while True:
                    chunk = os.read(fd, 65536)
                    if not chunk:
                        pipe_open.discard(fd)
                        break
                    target, limit, code = targets[fd]
                    target.extend(chunk)
                    if len(target) > limit and overflow is not None and not overflow:
                        overflow.append(code)
            except BlockingIOError:
                pass
            except OSError:
                pipe_open.discard(fd)
        remaining = descendant_identities(initial_pid, known)
        if not remaining and not pipe_open:
            empty += 1
            if empty >= EMPTY_SCANS_REQUIRED:
                reap_all()
                return True
        else:
            empty = 0
        time.sleep(SCAN_SLEEP)
    return False

def descriptor_bytes(request):
    context = "adapterContext" in request
    if not context and "toolDescriptor" not in request:
        return None
    encoded = request["adapterContext" if context else "toolDescriptor"]
    digest = request["adapterContextSha256" if context else "toolDescriptorSha256"]
    if not isinstance(encoded, str) or not isinstance(digest, str) or not digest.startswith("sha256:") or len(digest) != 71:
        raise ValueError("descriptor")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        raise ValueError("descriptor")
    if not raw or len(raw) > (MAX_CONTEXT if context else MAX_DESCRIPTOR) or base64.b64encode(raw).decode("ascii") != encoded:
        raise ValueError("descriptor")
    if "sha256:" + hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("descriptor")
    try:
        value = json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=strict_object,
                           parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("constant")))
        canonical = (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode("utf-8")
    except (UnicodeError, ValueError, TypeError):
        raise ValueError("descriptor")
    if not isinstance(value, dict) or canonical != raw:
        raise ValueError("descriptor")
    if context:
        if set(value) != {"schemaVersion", "toolDescriptor", "issuedAt", "observationDeadline"} or value["schemaVersion"] != "wordle-royale-g0-adapter-context/v1" or not isinstance(value["toolDescriptor"], dict):
            raise ValueError("context")
        for field in ("issuedAt", "observationDeadline"):
            timestamp = value[field]
            if not isinstance(timestamp, str) or len(timestamp) != 24 or timestamp[4] != "-" or timestamp[7] != "-" or timestamp[10] != "T" or timestamp[13] != ":" or timestamp[16] != ":" or timestamp[19] != "." or not timestamp.endswith("Z"):
                raise ValueError("context")
    return raw

def execute(request):
    argv = request["argv"]
    timeout_ms = request["timeoutMs"]
    stdout_limit = request["stdoutBytes"]
    stderr_limit = request["stderrBytes"]
    descriptor = descriptor_bytes(request)
    out_r, out_w = os.pipe2(os.O_CLOEXEC)
    err_r, err_w = os.pipe2(os.O_CLOEXEC)
    desc_r = desc_w = None
    if descriptor is not None:
        desc_r, desc_w = os.pipe2(os.O_CLOEXEC)
    expected_parent = os.getpid()
    try:
        pid = os.fork()
    except OSError:
        for fd in (out_r, out_w, err_r, err_w, desc_r, desc_w):
            if fd is None:
                continue
            os.close(fd)
        return {"ok": False, "code": "PROCESS_SPAWN_FAILED"}
    if pid == 0:
        try:
            os.setsid()
            if libc.prctl(PR_SET_PDEATHSIG, int(signal.SIGKILL), 0, 0, 0) != 0 or os.getppid() != expected_parent:
                os._exit(126)
            os.dup2(out_w, 1)
            os.dup2(err_w, 2)
            devnull = os.open("/dev/null", os.O_RDONLY | os.O_CLOEXEC)
            os.dup2(devnull, 0)
            if descriptor is not None:
                os.close(desc_w)
                os.dup2(desc_r, DESCRIPTOR_FD)
                os.set_inheritable(DESCRIPTOR_FD, True)
            keep = {0, 1, 2, ADAPTER_FD}
            if descriptor is not None:
                keep.add(DESCRIPTOR_FD)
            for fd in range(3, 256):
                if fd not in keep:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
            path = "/proc/self/fd/" + str(ADAPTER_FD)
            os.execve(path, [path] + argv, ENV)
        except BaseException:
            os._exit(127)
    os.close(out_w)
    os.close(err_w)
    if descriptor is not None:
        os.close(desc_r)
        try:
            if os.write(desc_w, descriptor) != len(descriptor):
                raise OSError(errno.EIO, "descriptor")
        finally:
            os.close(desc_w)
    os.set_blocking(out_r, False)
    os.set_blocking(err_r, False)
    selector = selectors.DefaultSelector()
    out_buffer, err_buffer = bytearray(), bytearray()
    selector.register(out_r, selectors.EVENT_READ, (out_buffer, stdout_limit, "STDOUT_LIMIT"))
    selector.register(err_r, selectors.EVENT_READ, (err_buffer, stderr_limit, "STDERR_LIMIT"))
    known = {}
    status = None
    reason = None
    deadline = time.monotonic() + timeout_ms / 1000.0
    try:
        while status is None and reason is None:
            if shutdown_requested:
                raise Shutdown()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                reason = "PROCESS_TIMEOUT"
                break
            for key, _events in selector.select(min(remaining, 0.02)):
                target, limit, code = key.data
                opened, exceeded = drain(key.fd, target, limit)
                if not opened:
                    selector.unregister(key.fd)
                if exceeded:
                    reason = code
                    break
            try:
                waited, candidate = os.waitpid(pid, os.WNOHANG)
                if waited == pid:
                    status = candidate
            except ChildProcessError:
                status = 0
            descendant_identities(pid, known)
        # Successful primary exit is not a containment success until every
        # detached writer/pipe holder has been killed, reaped, and pipes EOF.
        overflow = []
        clean = cleanup(pid, pid, known,
                        ((out_r, out_buffer, stdout_limit, "STDOUT_LIMIT"),
                         (err_r, err_buffer, stderr_limit, "STDERR_LIMIT")),
                        overflow=overflow)
        if not clean:
            return {"ok": False, "code": "DESCENDANT_CLEANUP_FAILED"}
        if reason or overflow:
            return {"ok": False, "code": reason or overflow[0]}
        exit_code = os.waitstatus_to_exitcode(status) if status is not None else -1
        out = bytes(out_buffer)
        err = bytes(err_buffer)
        return {"ok": True, "exitCode": exit_code, "signal": None,
                "stdout": base64.b64encode(out).decode("ascii"),
                "stderr": base64.b64encode(err).decode("ascii")}
    except Shutdown:
        cleanup(pid, pid, known,
                ((out_r, out_buffer, stdout_limit, "STDOUT_LIMIT"),
                 (err_r, err_buffer, stderr_limit, "STDERR_LIMIT")))
        raise
    finally:
        selector.close()
        for fd in (out_r, err_r):
            try:
                os.close(fd)
            except OSError:
                pass

def validate_request(value, sequence):
    v1 = {"type", "seq", "argv", "timeoutMs", "stdoutBytes", "stderrBytes"}
    v2 = v1 | {"toolDescriptor", "toolDescriptorSha256"}
    v3 = v1 | {"adapterContext", "adapterContextSha256"}
    if not isinstance(value, dict) or set(value) not in (v1, v2, v3):
        raise ValueError("fields")
    if value["type"] != "run" or value["seq"] != sequence or type(sequence) is not int:
        raise ValueError("sequence")
    if not isinstance(value["argv"], list) or not value["argv"] or any(not isinstance(x, str) or "\0" in x or len(x) > 16384 for x in value["argv"]):
        raise ValueError("argv")
    for field, maximum in (("timeoutMs", 900000), ("stdoutBytes", 1048576), ("stderrBytes", 1048576)):
        if type(value[field]) is not int or value[field] < 1 or value[field] > maximum:
            raise ValueError("limit")
    descriptor_bytes(value)

active_pid = 0
try:
    sequence = 1
    while True:
        message = read_frame()
        if message is None:
            break
        if isinstance(message, dict) and set(message) == {"type", "seq"} and message.get("type") == "shutdown" and message.get("seq") == sequence:
            write_frame({"type": "shutdown", "seq": sequence, "ok": True})
            break
        validate_request(message, sequence)
        response = execute(message)
        response.update({"type": "result", "seq": sequence})
        write_frame(response)
        sequence += 1
except (Shutdown, BrokenPipeError):
    pass
except BaseException:
    # Closed protocol: malformed/truncated/oversized input terminates the helper.
    pass
finally:
    cleanup(0, 0, {}, ())
    reap_all()
