"""Phase24-D synthetic regression tests. Never access institution systems."""
import argparse
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import phase24_backup as mod

IDENTITY = "abcdef01-2345-6789-abcd-ef0123456789"
KEY = f"blobs/{IDENTITY[:2]}/{IDENTITY[2:4]}/{IDENTITY}"


def data_state(contents: bytes) -> dict:
    return {
        "counts": {"attachments": 1, "view_logs": 2, "audit_logs": 3,
                   "transactions": 1, "employees": 1, "schema_migrations": 15},
        "attachments": [{"id": IDENTITY, "storage_key": KEY,
                         "content_hash": "sha256:" + hashlib.sha256(contents).hexdigest(),
                         "size_bytes": len(contents)}],
        "migrations": [{"version": 15, "checksum": "synthetic"}],
    }


class SyntheticBundle(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="alsqaya-phase24-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.payload = b"%PDF-1.7\nSYNTHETIC\n"
        self.source = self.root / "source"
        source_file = self.source / KEY
        source_file.parent.mkdir(parents=True)
        source_file.write_bytes(self.payload)
        self.state = data_state(self.payload)

    def make_bundle(self):
        folder = self.root / "backup"
        (folder / "attachments" / KEY).parent.mkdir(parents=True)
        (folder / "attachments" / KEY).write_bytes(self.payload)
        (folder / mod.DUMP_NAME).write_bytes(b"synthetic PGDMP fixture")
        records, index = mod.catalog(folder / "attachments")
        dump = folder / mod.DUMP_NAME
        manifest = {
            "format": mod.FORMAT,
            "consistency": "operator-confirmed-writers-stopped",
            "files": records, "database": self.state,
            "dump": {"path": mod.DUMP_NAME, "size": dump.stat().st_size,
                     "sha256": mod.hash_file(dump)},
            "reference_summary": mod.check_references(self.state, index),
        }
        (folder / mod.MANIFEST_NAME).write_text(json.dumps(manifest))
        return folder

    def test_valid_manifest_and_view_audit_counts(self):
        result = mod.verify(self.make_bundle())
        self.assertEqual(result["database"]["counts"]["view_logs"], 2)
        self.assertEqual(result["database"]["counts"]["audit_logs"], 3)

    def test_missing_manifest_fails_closed(self):
        self.assertRaises(mod.BackupError, mod.verify, self.root)

    def test_missing_reference_fails_closed(self):
        self.assertRaises(mod.BackupError, mod.check_references, self.state, {})

    def test_invalid_stored_hash_fails_closed(self):
        _, index = mod.catalog(self.source)
        self.assertRaises(mod.BackupError, mod.check_references, data_state(b"DIFFERENT"), index)

    def test_bad_size_fails_closed(self):
        _, index = mod.catalog(self.source)
        bad = data_state(self.payload)
        bad["attachments"][0]["size_bytes"] += 1
        self.assertRaises(mod.BackupError, mod.check_references, bad, index)

    def test_corrupted_dump_fails_closed(self):
        folder = self.make_bundle()
        (folder / mod.DUMP_NAME).write_bytes(b"CORRUPTED")
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_corrupted_attachment_fails_closed(self):
        folder = self.make_bundle()
        (folder / "attachments" / KEY).write_bytes(b"ALTERED")
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_manifest_path_traversal_fails_closed(self):
        folder = self.make_bundle()
        file = folder / mod.MANIFEST_NAME
        manifest = json.loads(file.read_text())
        manifest["files"][0]["path"] = "../../outside"
        file.write_text(json.dumps(manifest))
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_duplicate_manifest_file_fails_closed(self):
        folder = self.make_bundle()
        file = folder / mod.MANIFEST_NAME
        manifest = json.loads(file.read_text())
        manifest["files"].append(dict(manifest["files"][0]))
        file.write_text(json.dumps(manifest))
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_unexpected_file_fails_closed(self):
        folder = self.make_bundle()
        (folder / "extra.txt").write_text("not inventoried")
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_symlink_fails_closed(self):
        folder = self.make_bundle()
        link = folder / "attachments" / "outside-link"
        try:
            link.symlink_to(self.root / "source", target_is_directory=True)
        except OSError:
            self.skipTest("Symlinks require elevated privileges on this platform")
        self.assertRaises(mod.BackupError, mod.verify, folder)

    def test_unfinished_upload_fails_closed(self):
        (self.source / "pending.partial").write_bytes(b"pending")
        self.assertRaises(mod.BackupError, mod.catalog, self.source)

    def test_refuses_backup_without_maintenance_ack(self):
        self.assertRaises(mod.BackupError, mod.backup,
                          argparse.Namespace(confirm_writers_stopped=False))

    def test_refuses_restore_without_test_ack(self):
        self.assertRaises(mod.BackupError, mod.restore_test,
                          argparse.Namespace(confirm_empty_test_db=False))

    def test_backup_complete_with_mocked_database_commands(self):
        destination = self.root / "final-backup"
        args = argparse.Namespace(confirm_writers_stopped=True, storage_root=str(self.source),
                                  output=str(destination))
        def fake_runner(exe, command, url, capture=False):
            if exe == "pg_dump":
                out = next(arg for arg in command if arg.startswith("--file="))
                Path(out[7:]).write_bytes(b"synthetic pg_dump")
            return ""
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://synthetic-only"}), \
             patch.object(mod, "db_state", return_value=self.state), \
             patch.object(mod, "assert_schema"), \
             patch.object(mod, "runner", side_effect=fake_runner):
            mod.backup(args)
        self.assertEqual(mod.verify(destination)["database"]["counts"]["audit_logs"], 3)
        self.assertEqual(list(destination.parent.glob(destination.name + ".partial.*")), [])

    def test_failed_pg_dump_leaves_no_final_backup(self):
        destination = self.root / "failed-dump-backup"
        args = argparse.Namespace(confirm_writers_stopped=True, storage_root=str(self.source),
                                  output=str(destination))
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://synthetic-only"}), \
             patch.object(mod, "db_state", return_value=self.state), \
             patch.object(mod, "assert_schema"), \
             patch.object(mod, "runner", side_effect=mod.BackupError("pg_dump failed")):
            self.assertRaises(mod.BackupError, mod.backup, args)
        self.assertFalse(destination.exists())

    def test_backup_db_change_fails_and_no_final_bundle(self):
        destination = self.root / "failed-backup"
        args = argparse.Namespace(confirm_writers_stopped=True, storage_root=str(self.source),
                                  output=str(destination))
        other = json.loads(json.dumps(self.state))
        other["counts"]["audit_logs"] += 1
        def fake_runner(exe, cmd, url, capture=False):
            if exe == "pg_dump":
                Path(next(p for p in cmd if p.startswith("--file="))[7:]).write_bytes(b"dump")
            return ""
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://synthetic-only"}), \
             patch.object(mod, "db_state", side_effect=[self.state, other]), \
             patch.object(mod, "assert_schema"), \
             patch.object(mod, "runner", side_effect=fake_runner):
            self.assertRaises(mod.BackupError, mod.backup, args)
        self.assertFalse(destination.exists())

    def test_restore_refuses_unknown_target_name(self):
        bundle = self.make_bundle()
        args = argparse.Namespace(confirm_empty_test_db=True, bundle=str(bundle),
                                  storage_output=str(self.root / "restore"))
        with patch.dict(os.environ, {"NODE_ENV": "test", "RESTORE_TEST_DATABASE_URL": "synthetic"}), \
             patch.object(mod, "runner", return_value="production\n"):
            self.assertRaises(mod.BackupError, mod.restore_test, args)

    def test_restore_refuses_nonempty_database(self):
        bundle = self.make_bundle()
        args = argparse.Namespace(confirm_empty_test_db=True, bundle=str(bundle),
                                  storage_output=str(self.root / "restore"))
        with patch.dict(os.environ, {"NODE_ENV": "test", "RESTORE_TEST_DATABASE_URL": "synthetic"}), \
             patch.object(mod, "runner", side_effect=["alsqaya_restore_test_24\n", "1\n"]):
            self.assertRaises(mod.BackupError, mod.restore_test, args)

    def test_synthetic_restore_validates_metadata(self):
        bundle = self.make_bundle()
        target = self.root / "restored-files"
        args = argparse.Namespace(confirm_empty_test_db=True, bundle=str(bundle),
                                  storage_output=str(target))
        with patch.dict(os.environ, {"NODE_ENV": "test", "RESTORE_TEST_DATABASE_URL": "synthetic"}), \
             patch.object(mod, "runner", side_effect=["alsqaya_restore_test_24\n", "0\n"]), \
             patch.object(mod, "restore_sql_dump"), \
             patch.object(mod, "db_state", return_value=self.state):
            mod.restore_test(args)
        self.assertEqual((target / KEY).read_bytes(), self.payload)

    def test_synthetic_restore_rejects_bad_counts(self):
        bundle = self.make_bundle()
        target = self.root / "restored-files"
        args = argparse.Namespace(confirm_empty_test_db=True, bundle=str(bundle),
                                  storage_output=str(target))
        wrong = json.loads(json.dumps(self.state))
        wrong["counts"]["view_logs"] += 1
        with patch.dict(os.environ, {"NODE_ENV": "test", "RESTORE_TEST_DATABASE_URL": "synthetic"}), \
             patch.object(mod, "runner", side_effect=["alsqaya_restore_test_24\n", "0\n"]), \
             patch.object(mod, "restore_sql_dump"), \
             patch.object(mod, "db_state", return_value=wrong):
            self.assertRaises(mod.BackupError, mod.restore_test, args)
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
