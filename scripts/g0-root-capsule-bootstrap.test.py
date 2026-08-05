import hashlib
import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock

P = Path(__file__).with_name("g0-root-capsule-bootstrap.py")
spec = importlib.util.spec_from_file_location("capsule_bootstrap", P)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
INSTALLER = P.with_name(mod.INSTALLER_NAME).read_bytes()


class CapsuleBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name) / "base"
        self.base.mkdir(mode=0o755)
        self.owner = os.geteuid()

    def tearDown(self):
        self.temp.cleanup()

    def run_bootstrap(self, payload=INSTALLER, **kwargs):
        read_fd, write_fd = os.pipe()
        try:
            os.write(write_fd, payload)
        finally:
            os.close(write_fd)
        try:
            return mod.bootstrap_from_fd_for_test(read_fd, self.base, self.owner, **kwargs)
        finally:
            os.close(read_fd)

    @property
    def capsule_dir(self):
        return self.base / "wordle-royale" / "installer-tools" / "ao-v1"

    @property
    def capsule(self):
        return self.capsule_dir / mod.INSTALLER_NAME

    def test_installs_exact_capsule_with_short_writes_and_fsync_reread(self):
        real_write = os.write
        calls = 0

        def short_write(fd, data):
            nonlocal calls
            calls += 1
            return real_write(fd, data[:max(1, len(data) // 5)])

        self.assertEqual(self.run_bootstrap(write=short_write), "INSTALLED")
        self.assertGreater(calls, 1)
        self.assertEqual(self.capsule.read_bytes(), INSTALLER)
        self.assertEqual(hashlib.sha256(self.capsule.read_bytes()).hexdigest(), mod.INSTALLER_SHA256)
        self.assertEqual(stat.S_IMODE(self.capsule.stat().st_mode), 0o555)
        self.assertEqual((self.capsule.stat().st_uid, self.capsule.stat().st_gid), (self.owner, self.owner))
        for directory in (self.base / "wordle-royale", self.base / "wordle-royale/installer-tools", self.capsule_dir):
            self.assertFalse(stat.S_IMODE(directory.stat().st_mode) & 0o022)

    def test_hash_and_length_mismatch_write_nothing(self):
        altered = bytearray(INSTALLER)
        altered[-1] ^= 1
        with self.assertRaisesRegex(mod.BootstrapError, "CAPSULE_HASH_MISMATCH"):
            self.run_bootstrap(bytes(altered))
        self.assertEqual(list(self.base.iterdir()), [])
        with self.assertRaisesRegex(mod.BootstrapError, "CAPSULE_LENGTH_MISMATCH"):
            self.run_bootstrap(INSTALLER[:-1])
        self.assertEqual(list(self.base.iterdir()), [])

    def test_collision_is_never_deleted_or_overwritten(self):
        self.capsule_dir.mkdir(parents=True)
        for directory in (self.base / "wordle-royale", self.base / "wordle-royale/installer-tools", self.capsule_dir):
            directory.chmod(0o755)
        hostile = b"do not replace"
        self.capsule.write_bytes(hostile)
        self.capsule.chmod(0o555)
        with self.assertRaisesRegex(mod.BootstrapError, "CAPSULE_COLLISION"):
            self.run_bootstrap()
        self.assertEqual(self.capsule.read_bytes(), hostile)
        self.assertFalse(any(p.name.startswith(".capsule-stage-") for p in self.capsule_dir.iterdir()))

    def test_identical_replay_is_read_only(self):
        self.assertEqual(self.run_bootstrap(), "INSTALLED")
        before = [(p.relative_to(self.base), p.lstat().st_ino, p.lstat().st_mtime_ns)
                  for p in [self.base / "wordle-royale", self.base / "wordle-royale/installer-tools", self.capsule_dir, self.capsule]]

        def must_not_stage(*_):
            raise AssertionError("replay attempted a write")

        self.assertEqual(self.run_bootstrap(inject=must_not_stage), "IDENTICAL_REPLAY")
        after = [(p.relative_to(self.base), p.lstat().st_ino, p.lstat().st_mtime_ns)
                 for p in [self.base / "wordle-royale", self.base / "wordle-royale/installer-tools", self.capsule_dir, self.capsule]]
        self.assertEqual(before, after)

    def test_ancestor_symlink_unsafe_mode_and_wrong_owner_are_rejected(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (self.base / "wordle-royale").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(mod.BootstrapError):
            self.run_bootstrap()
        self.assertEqual(list(outside.iterdir()), [])
        (self.base / "wordle-royale").unlink()
        self.base.chmod(0o777)
        with self.assertRaisesRegex(mod.BootstrapError, "UNSAFE_ANCESTOR"):
            self.run_bootstrap()
        self.base.chmod(0o755)
        actual_owner = self.owner
        self.owner += 1
        try:
            with self.assertRaisesRegex(mod.BootstrapError, "UNSAFE_ANCESTOR"):
                self.run_bootstrap()
        finally:
            self.owner = actual_owner

    def test_temp_cleanup_is_identity_safe(self):
        replacement = None
        saved = None

        def replace_temp(stage, parent_fd, name, _identity):
            nonlocal replacement, saved
            if stage != "temp-created":
                return
            directory = self.capsule_dir
            original = directory / name
            saved = directory / (name + ".saved")
            original.rename(saved)
            replacement = directory / name
            replacement.write_bytes(b"hostile replacement")
            raise mod.BootstrapError("INJECTED")

        with self.assertRaisesRegex(mod.BootstrapError, "INJECTED"):
            self.run_bootstrap(inject=replace_temp)
        self.assertTrue(replacement.exists())
        self.assertEqual(replacement.read_bytes(), b"hostile replacement")
        self.assertTrue(saved.exists())

    def test_checkout_reader_requires_exact_manifest_hash_and_no_symlinks(self):
        checkout = Path(self.temp.name) / "checkout"
        checkout.mkdir()
        (checkout / mod.MANIFEST_NAME).write_bytes(mod.MANIFEST_BYTES)
        (checkout / mod.INSTALLER_NAME).write_bytes(INSTALLER)
        self.assertEqual(mod.read_exact_capsule_from_checkout(checkout), INSTALLER)
        manifest = checkout / mod.MANIFEST_NAME
        manifest.write_bytes(mod.MANIFEST_BYTES[:-2] + b" \n")
        with self.assertRaisesRegex(RuntimeError, "exact pinned manifest"):
            mod.read_exact_capsule_from_checkout(checkout)
        manifest.unlink()
        manifest.symlink_to(P.with_name(mod.MANIFEST_NAME))
        with self.assertRaises(OSError):
            mod.read_exact_capsule_from_checkout(checkout)

    def test_closed_cli_uses_fixed_argv_stdin_and_never_a_shell(self):
        with mock.patch.object(mod, "read_exact_capsule_from_checkout", return_value=INSTALLER), \
             mock.patch.object(mod.subprocess, "run") as run:
            run.return_value.returncode = 0
            self.assertEqual(mod.invoke_fixed_root_boundary(), 0)
        args, kwargs = run.call_args
        command = args[0]
        self.assertEqual(command[:6], ["/usr/bin/sudo", "/usr/bin/python3", "-I", "-S", "-B", "-c"])
        self.assertEqual(command[6], mod.ROOT_BOOTSTRAP_SOURCE)
        self.assertEqual(kwargs["input"], INSTALLER)
        self.assertNotIn("shell", kwargs)
        self.assertEqual(mod.main([]), 2)


if __name__ == "__main__":
    unittest.main()
