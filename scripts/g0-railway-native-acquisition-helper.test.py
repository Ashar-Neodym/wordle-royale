#!/usr/bin/python3
"""Hostile, network-free tests for the fixed Railway native acquisition helper."""
import hashlib
import importlib.util
import io
import os
import pathlib
import stat
import tarfile
import tempfile
import unittest
import urllib.parse
import warnings

# Failed extraction intentionally abandons a helper-owned spooled output whose
# only reference is in the cleared exception frame; suppress that CPython GC
# diagnostic so hostile rejection tests have deterministic output.
warnings.filterwarnings("ignore", category=ResourceWarning)

HELPER_PATH = pathlib.Path(__file__).with_name("g0-railway-native-acquisition-helper.py")
SPEC = importlib.util.spec_from_file_location("g0_railway_native_acquisition_helper", HELPER_PATH)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


def redirect_url(**changes):
    query = {key: "value" for key in helper.REDIRECT_QUERY_KEYS}
    query.update({
        "sp": "r", "sr": "b", "spr": "https",
        "rscd": "attachment; filename=railway-v5.30.1-x86_64-unknown-linux-gnu.tar.gz",
        "rsct": "application/octet-stream",
        "response-content-disposition": "attachment; filename=railway-v5.30.1-x86_64-unknown-linux-gnu.tar.gz",
        "response-content-type": "application/octet-stream",
    })
    query.update(changes.pop("query", {}))
    path = changes.pop("path", helper.REDIRECT_PATH_PREFIX + "a" * 36)
    origin = changes.pop("origin", helper.REDIRECT_ORIGIN)
    assert not changes
    return origin + path + "?" + urllib.parse.urlencode(query)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as bundle:
        for name, data, mode, kind, linkname in entries:
            info = tarfile.TarInfo(name)
            info.mode = mode
            info.type = kind
            info.linkname = linkname
            if kind == tarfile.REGTYPE:
                info.size = len(data)
                bundle.addfile(info, io.BytesIO(data))
            else:
                bundle.addfile(info)
    output.seek(0)
    return output


def one_entry(name="railway", data=b"fixed-binary", mode=0o755,
              kind=tarfile.REGTYPE, linkname=""):
    return archive([(name, data, mode, kind, linkname)])


class RailwayNativeHelperTests(unittest.TestCase):
    def assert_code(self, code, operation):
        with self.assertRaises(helper.AcquisitionError) as caught:
            operation()
        self.assertEqual(str(caught.exception), code)

    def test_import_is_inert_and_pin_matches_reviewed_helper(self):
        self.assertEqual(hashlib.sha256(HELPER_PATH.read_bytes()).hexdigest(),
                         "90a986ce871c15e6e6770728b7551fe0b0afa60774b59866f44d95beea4e0c16")
        self.assertEqual(stat.S_IMODE(HELPER_PATH.stat().st_mode), 0o644)
        self.assertEqual(helper.EXPECTED_SHA256,
                         "26f5c4d8e22c8af4b6523e54d33a44cfe861a40442f171d4aa0fee8ec800a3b2")

    def test_exact_signed_redirect_is_allowed(self):
        self.assertTrue(helper.allowed_redirect(helper.INITIAL_URL, redirect_url(), 1))

    def test_redirect_origin_path_repository_id_and_count_are_closed(self):
        attacks = [
            (helper.INITIAL_URL, redirect_url(origin="https://evil.example"), 1),
            (helper.INITIAL_URL, redirect_url(path="/wrong/" + "a" * 36), 1),
            (helper.INITIAL_URL, redirect_url(path=helper.REDIRECT_PATH_PREFIX.replace("300385058", "300385059") + "a" * 36), 1),
            (helper.INITIAL_URL, redirect_url(path=helper.REDIRECT_PATH_PREFIX + "a" * 35), 1),
            (helper.INITIAL_URL, redirect_url(), 2),
            ("https://github.com/other", redirect_url(), 1),
        ]
        for source, target, count in attacks:
            with self.subTest(target=target, count=count):
                self.assertFalse(helper.allowed_redirect(source, target, count))
        self.assert_code("RAILWAY_URL_FORBIDDEN", lambda: helper.allowed_redirect(
            helper.INITIAL_URL, redirect_url().replace("https://", "https://user@", 1), 1))

    def test_redirect_query_keys_duplicates_filename_and_content_type_are_closed(self):
        valid = redirect_url()
        parsed = urllib.parse.urlsplit(valid)
        pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        missing = parsed._replace(query=urllib.parse.urlencode(pairs[:-1])).geturl()
        duplicate = valid + "&sp=r"
        extra = valid + "&extra=value"
        blank = redirect_url(query={"jwt": ""})
        wrong_filename = redirect_url(query={"rscd": "attachment; filename=other.tar.gz"})
        wrong_response_filename = redirect_url(query={"response-content-disposition": "attachment; filename=other.tar.gz"})
        wrong_type = redirect_url(query={"rsct": "text/html"})
        wrong_response_type = redirect_url(query={"response-content-type": "text/html"})
        for target in [missing, duplicate, extra, blank, wrong_filename,
                       wrong_response_filename, wrong_type, wrong_response_type]:
            with self.subTest(target=target):
                self.assertFalse(helper.allowed_redirect(helper.INITIAL_URL, target, 1))

    def test_redirect_handler_rejects_an_extra_redirect(self):
        handler = helper.ClosedRedirect()
        first = handler.redirect_request(
            type("Request", (), {"full_url": helper.INITIAL_URL})(), None, 302, "Found",
            {}, redirect_url())
        self.assertEqual(len(handler.redirects), 1)
        self.assert_code("RAILWAY_REDIRECT_FORBIDDEN", lambda: handler.redirect_request(
            first, None, 302, "Found", {}, redirect_url()))

    def test_exact_regular_archive_passes_with_pinned_digest(self):
        data = b"synthetic railway binary"
        old_hash = helper.EXPECTED_SHA256
        helper.EXPECTED_SHA256 = hashlib.sha256(data).hexdigest()
        try:
            binary, size = helper.extract_exact(one_entry(data=data))
            try:
                self.assertEqual(binary.read(), data)
                self.assertEqual(size, len(data))
            finally:
                binary.close()
        finally:
            helper.EXPECTED_SHA256 = old_hash

    def test_archive_rejects_traversal_extra_entries_and_non_regular_types(self):
        fixtures = {
            "traversal": one_entry(name="../railway"),
            "absolute": one_entry(name="/railway"),
            "extra": archive([
                ("railway", b"x", 0o755, tarfile.REGTYPE, ""),
                ("extra", b"x", 0o755, tarfile.REGTYPE, ""),
            ]),
            "directory": one_entry(kind=tarfile.DIRTYPE),
            "symlink": one_entry(kind=tarfile.SYMTYPE, linkname="target"),
            "hardlink": one_entry(kind=tarfile.LNKTYPE, linkname="target"),
            "fifo": one_entry(kind=tarfile.FIFOTYPE),
            "character-device": one_entry(kind=tarfile.CHRTYPE),
        }
        for name, fixture in fixtures.items():
            with self.subTest(name=name):
                expected = "RAILWAY_ARCHIVE_ENTRIES_INVALID" if name == "extra" else "RAILWAY_ARCHIVE_ENTRY_INVALID"
                self.assert_code(expected, lambda fixture=fixture: helper.extract_exact(fixture))

    def test_archive_rejects_wrong_mode_oversize_and_hash(self):
        self.assert_code("RAILWAY_ARCHIVE_MODE_INVALID", lambda: helper.extract_exact(one_entry(mode=0o700)))
        self.assert_code("RAILWAY_BINARY_HASH_MISMATCH", lambda: helper.extract_exact(one_entry(data=b"wrong")))
        old_limit = helper.MAX_BINARY_BYTES
        helper.MAX_BINARY_BYTES = 3
        try:
            self.assert_code("RAILWAY_ARCHIVE_ENTRY_INVALID", lambda: helper.extract_exact(one_entry(data=b"four")))
        finally:
            helper.MAX_BINARY_BYTES = old_limit

    def test_install_rejects_destination_collision_without_mutation(self):
        with tempfile.TemporaryDirectory() as root:
            os.chmod(root, 0o700)
            path = pathlib.Path(root)
            for part in helper.TARGET_PARTS:
                path /= part
                path.mkdir(mode=0o700)
            target = path / helper.TARGET_NAME
            target.write_bytes(b"preserve")
            os.chmod(target, 0o600)
            root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            old_fd, old_hash = helper.SOURCE_FD, helper.EXPECTED_SHA256
            helper.SOURCE_FD = root_fd
            binary = io.BytesIO(b"new")
            helper.EXPECTED_SHA256 = hashlib.sha256(b"new").hexdigest()
            try:
                self.assert_code("RAILWAY_TARGET_EXISTS", lambda: helper.install(binary, 3))
                self.assertEqual(target.read_bytes(), b"preserve")
            finally:
                helper.SOURCE_FD, helper.EXPECTED_SHA256 = old_fd, old_hash
                os.close(root_fd)

    def test_install_rejects_group_writable_and_symlink_directories(self):
        for attack in ("writable", "symlink"):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as root:
                os.chmod(root, 0o700)
                path = pathlib.Path(root)
                if attack == "writable":
                    first = path / helper.TARGET_PARTS[0]
                    first.mkdir(mode=0o700)
                    os.chmod(first, 0o770)
                else:
                    outside = path / "outside"
                    outside.mkdir(mode=0o700)
                    (path / helper.TARGET_PARTS[0]).symlink_to(outside, target_is_directory=True)
                root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
                old_fd = helper.SOURCE_FD
                helper.SOURCE_FD = root_fd
                try:
                    self.assert_code("RAILWAY_TARGET_DIRECTORY_UNSAFE",
                                     lambda: helper.install(io.BytesIO(b"x"), 1))
                finally:
                    helper.SOURCE_FD = old_fd
                    os.close(root_fd)


if __name__ == "__main__":
    unittest.main(warnings="ignore")
