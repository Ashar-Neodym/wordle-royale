#!/usr/bin/python3
"""Fixed Railway 5.30.1 native acquisition helper; no lifecycle or provider execution."""
import hashlib
import http.client
import json
import os
import ssl
import stat
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

SOURCE_FD = 6
INITIAL_URL = "https://github.com/railwayapp/cli/releases/download/v5.30.1/railway-v5.30.1-x86_64-unknown-linux-gnu.tar.gz"
INITIAL_ORIGIN = "https://github.com"
REDIRECT_ORIGIN = "https://release-assets.githubusercontent.com"
REDIRECT_PATH_PREFIX = "/github-production-release-asset/300385058/"
REDIRECT_QUERY_KEYS = {"sp", "sv", "sr", "spr", "se", "rscd", "rsct", "skoid", "sktid", "skt", "ske", "sks", "skv", "sig", "jwt", "response-content-disposition", "response-content-type"}
TARGET_PARTS = ("node_modules", "@railway", "cli", "bin")
TARGET_NAME = "railway"
EXPECTED_SHA256 = "26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2"
MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_BINARY_BYTES = 64 * 1024 * 1024
MAX_REDIRECTS = 1
TIMEOUT_SECONDS = 90

class AcquisitionError(Exception):
    pass

def fail(code):
    raise AcquisitionError(code)

def origin(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment:
        fail("RAILWAY_URL_FORBIDDEN")
    return f"https://{parsed.hostname}" if parsed.port is None else f"https://{parsed.hostname}:{parsed.port}"

def allowed_redirect(source, target, count):
    if count != 1 or source != INITIAL_URL or origin(target) != REDIRECT_ORIGIN:
        return False
    parsed = urllib.parse.urlsplit(target)
    try:
        pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    except ValueError:
        return False
    query = dict(pairs)
    return (parsed.port is None and parsed.path.startswith(REDIRECT_PATH_PREFIX)
            and len(parsed.path.removeprefix(REDIRECT_PATH_PREFIX)) == 36
            and len(pairs) == len(query) and set(query) == REDIRECT_QUERY_KEYS
            and query["sp"] == "r" and query["sr"] == "b" and query["spr"] == "https"
            and query["rscd"] == "attachment; filename=railway-v5.30.1-x86_64-unknown-linux-gnu.tar.gz"
            and query["rsct"] == "application/octet-stream"
            and query["response-content-disposition"] == "attachment; filename=railway-v5.30.1-x86_64-unknown-linux-gnu.tar.gz"
            and query["response-content-type"] == "application/octet-stream"
            and all(query[key] for key in REDIRECT_QUERY_KEYS))

class ClosedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.redirects = []
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = urllib.parse.urljoin(req.full_url, newurl)
        count = len(self.redirects) + 1
        if code not in (301, 302, 303, 307, 308) or count > MAX_REDIRECTS or not allowed_redirect(req.full_url, target, count):
            fail("RAILWAY_REDIRECT_FORBIDDEN")
        self.redirects.append(target)
        return urllib.request.Request(target, headers={"User-Agent": "wordle-royale-an5-railway-native/1", "Accept": "application/octet-stream"}, method="GET")

def download(opener):
    archive = tempfile.SpooledTemporaryFile(max_size=MAX_ARCHIVE_BYTES)
    request = urllib.request.Request(INITIAL_URL, headers={"User-Agent": "wordle-royale-an5-railway-native/1", "Accept": "application/octet-stream"}, method="GET")
    try:
        response = opener.open(request, timeout=TIMEOUT_SECONDS)
        with response:
            if response.status != 200 or origin(response.url) != REDIRECT_ORIGIN:
                fail("RAILWAY_RESPONSE_FORBIDDEN")
            length = response.headers.get("Content-Length")
            if length is not None and (not length.isascii() or not length.isdigit() or int(length) > MAX_ARCHIVE_BYTES):
                fail("RAILWAY_ARCHIVE_LIMIT")
            total = 0
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_ARCHIVE_BYTES:
                    fail("RAILWAY_ARCHIVE_LIMIT")
                archive.write(chunk)
    except AcquisitionError:
        raise
    except (OSError, urllib.error.URLError, http.client.HTTPException, ssl.SSLError):
        fail("RAILWAY_DOWNLOAD_FAILED")
    archive.seek(0)
    return archive, total, response.url

def extract_exact(archive):
    try:
        with tarfile.open(fileobj=archive, mode="r:gz") as bundle:
            members = bundle.getmembers()
            if len(members) != 1:
                fail("RAILWAY_ARCHIVE_ENTRIES_INVALID")
            member = members[0]
            if member.name != TARGET_NAME or not member.isreg() or member.issym() or member.islnk() or member.size < 1 or member.size > MAX_BINARY_BYTES:
                fail("RAILWAY_ARCHIVE_ENTRY_INVALID")
            if member.mode != 0o755:
                fail("RAILWAY_ARCHIVE_MODE_INVALID")
            source = bundle.extractfile(member)
            if source is None:
                fail("RAILWAY_ARCHIVE_ENTRY_INVALID")
            output = tempfile.SpooledTemporaryFile(max_size=MAX_BINARY_BYTES)
            digest = hashlib.sha256(); total = 0
            while True:
                chunk = source.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > member.size or total > MAX_BINARY_BYTES:
                    fail("RAILWAY_BINARY_LIMIT")
                digest.update(chunk); output.write(chunk)
            if total != member.size or digest.hexdigest() != EXPECTED_SHA256:
                fail("RAILWAY_BINARY_HASH_MISMATCH")
            output.seek(0)
            return output, total
    except AcquisitionError:
        raise
    except (tarfile.TarError, EOFError, OSError):
        fail("RAILWAY_ARCHIVE_INVALID")

def safe_target_directory():
    fd = os.dup(SOURCE_FD)
    root = os.fstat(fd)
    if not stat.S_ISDIR(root.st_mode) or root.st_uid != os.getuid() or stat.S_IMODE(root.st_mode) != 0o700:
        os.close(fd); fail("RAILWAY_SOURCE_ROOT_UNSAFE")
    try:
        for part in TARGET_PARTS:
            before = os.stat(part, dir_fd=fd, follow_symlinks=False)
            if not stat.S_ISDIR(before.st_mode) or before.st_dev != root.st_dev or before.st_uid != os.getuid() or stat.S_IMODE(before.st_mode) & 0o022:
                fail("RAILWAY_TARGET_DIRECTORY_UNSAFE")
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), dir_fd=fd)
            after = os.fstat(nxt)
            if (before.st_dev, before.st_ino, before.st_mode, before.st_uid) != (after.st_dev, after.st_ino, after.st_mode, after.st_uid):
                os.close(nxt); fail("RAILWAY_TARGET_DIRECTORY_CHANGED")
            os.close(fd); fd = nxt
        return fd
    except AcquisitionError:
        os.close(fd); raise
    except OSError:
        os.close(fd); fail("RAILWAY_TARGET_DIRECTORY_UNSAFE")

def install(binary, size):
    directory = safe_target_directory()
    try:
        try:
            fd = os.open(TARGET_NAME, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | getattr(os, "O_CLOEXEC", 0), 0o600, dir_fd=directory)
        except FileExistsError:
            fail("RAILWAY_TARGET_EXISTS")
        except OSError:
            fail("RAILWAY_TARGET_CREATE_FAILED")
        digest = hashlib.sha256(); total = 0
        try:
            while True:
                chunk = binary.read(64 * 1024)
                if not chunk: break
                digest.update(chunk); total += len(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(fd, view)
                    if written <= 0: fail("RAILWAY_TARGET_WRITE_FAILED")
                    view = view[written:]
            os.fchmod(fd, 0o700); os.fsync(fd)
            st = os.fstat(fd)
            if total != size or digest.hexdigest() != EXPECTED_SHA256 or not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700:
                fail("RAILWAY_TARGET_POLICY_MISMATCH")
        finally:
            os.close(fd)
    finally:
        os.close(directory)

def main():
    if os.getuid() != 1000 or os.environ != {"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "TZ": "UTC", "SSL_CERT_FILE": "/etc/ssl/certs/ca-certificates.crt"}:
        fail("RAILWAY_ENVIRONMENT_INVALID")
    redirect = ClosedRedirect()
    opener = urllib.request.build_opener(redirect, urllib.request.ProxyHandler({}))
    archive, archive_bytes, final_url = download(opener)
    try: binary, binary_bytes = extract_exact(archive)
    finally: archive.close()
    try: install(binary, binary_bytes)
    finally: binary.close()
    if len(redirect.redirects) != 1 or redirect.redirects[0] != final_url:
        fail("RAILWAY_REDIRECT_EVIDENCE_INVALID")
    print(json.dumps({"archiveBytes": archive_bytes, "binaryBytes": binary_bytes, "binaryMode": 0o700, "binarySha256": "sha256:" + EXPECTED_SHA256, "httpOrigins": [INITIAL_ORIGIN, REDIRECT_ORIGIN], "initialUrl": INITIAL_URL, "redirectCount": 1}, sort_keys=True, separators=(",", ":")))

if __name__ == "__main__":
    try: main()
    except AcquisitionError as error:
        print(json.dumps({"error": str(error)}, separators=(",", ":")))
        raise SystemExit(1)
