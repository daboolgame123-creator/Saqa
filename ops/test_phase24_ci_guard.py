"""24-G security regression: fail closed before *any* PostgreSQL connection.

No tests in this file access a real DB or network. A mocked runner is used to
prove validation rejects bad endpoints before issuing even the initial SQL.
"""
import argparse
import os
import unittest
from unittest.mock import patch

import phase24_backup as backup
import test_phase24_pg_integration as exercise

SOURCE = "postgresql://alsqaya:synthetic_ci_only@127.0.0.1:5432/alsqaya_24_source"
TARGET = "postgresql://alsqaya:synthetic_ci_only@127.0.0.1:5432/alsqaya_restore_test_ci"


class IsolatedPgGuardTests(unittest.TestCase):
    def setUp(self):
        context = patch.dict(os.environ, {
            "NODE_ENV": "test", "CI": "true",
            "DATABASE_URL": SOURCE, "RESTORE_TEST_DATABASE_URL": TARGET,
        })
        context.start()
        self.addCleanup(context.stop)

    def assert_harness_denies_before_psql(self, *, source=SOURCE, target=TARGET, ci="true"):
        with patch.dict(os.environ, {
            "DATABASE_URL": source, "RESTORE_TEST_DATABASE_URL": target, "CI": ci,
        }), patch.object(backup, "runner") as sql:
            with self.assertRaises(backup.BackupError):
                exercise.main()
            sql.assert_not_called()

    def test_local_pair_is_accepted_for_ci_only(self):
        backup.require_ci_test_database_pair(SOURCE, TARGET)

    def test_remote_source_is_rejected_before_any_insert(self):
        self.assert_harness_denies_before_psql(
            source=SOURCE.replace("127.0.0.1", "192.0.2.40"))

    def test_remote_restore_target_is_rejected_before_source_insert(self):
        self.assert_harness_denies_before_psql(
            target=TARGET.replace("127.0.0.1", "192.0.2.41"))

    def test_localhost_alias_is_not_accepted(self):
        self.assert_harness_denies_before_psql(source=SOURCE.replace("127.0.0.1", "localhost"))

    def test_source_database_name_must_be_exact(self):
        self.assert_harness_denies_before_psql(
            source=SOURCE.replace("alsqaya_24_source", "institution_db"))

    def test_restore_database_name_must_be_exact_in_harness(self):
        self.assert_harness_denies_before_psql(
            target=TARGET.replace("alsqaya_restore_test_ci", "alsqaya_restore_test_other"))

    def test_wrong_test_identity_is_rejected_before_sql(self):
        self.assert_harness_denies_before_psql(
            source=SOURCE.replace("alsqaya:", "postgres:"))

    def test_mismatched_test_credentials_are_rejected(self):
        self.assert_harness_denies_before_psql(
            target=TARGET.replace("synthetic_ci_only", "a_different_password"))

    def test_uri_query_redirect_is_rejected(self):
        self.assert_harness_denies_before_psql(target=TARGET + "?hostaddr=192.0.2.42")

    def test_nonstandard_pg_port_is_rejected(self):
        self.assert_harness_denies_before_psql(target=TARGET.replace(":5432/", ":6543/"))

    def test_same_database_is_rejected_before_sql(self):
        self.assert_harness_denies_before_psql(target=SOURCE)

    def test_ci_must_be_enabled(self):
        self.assert_harness_denies_before_psql(ci="false")

    def test_restore_cli_refuses_remote_target_before_even_initial_psql(self):
        args = argparse.Namespace(confirm_empty_test_db=True, bundle="/unused",
                                  storage_output="/unused_restore")
        remote = TARGET.replace("127.0.0.1", "198.51.100.100")
        with patch.dict(os.environ, {"RESTORE_TEST_DATABASE_URL": remote}), \
             patch.object(backup, "verify", return_value={}), \
             patch.object(backup, "runner") as sql:
            with self.assertRaises(backup.BackupError):
                backup.restore_test(args)
            sql.assert_not_called()

    def test_restore_cli_refuses_query_redirect_before_psql(self):
        args = argparse.Namespace(confirm_empty_test_db=True, bundle="/unused",
                                  storage_output="/unused_restore")
        with patch.dict(os.environ, {"RESTORE_TEST_DATABASE_URL": TARGET + "?hostaddr=192.0.2.42"}), \
             patch.object(backup, "verify", return_value={}), \
             patch.object(backup, "runner") as sql:
            with self.assertRaises(backup.BackupError):
                backup.restore_test(args)
            sql.assert_not_called()

    def test_libpq_environment_cannot_override_explicit_local_host(self):
        with patch.dict(os.environ, {"PGHOSTADDR": "198.51.100.77",
                                    "PGSERVICE": "production",
                                    "PGSERVICEFILE": "/tmp/production.conf"}):
            env = backup.postgres_env(TARGET)
            self.assertEqual(env["PGHOST"], "127.0.0.1")
            self.assertEqual(env["PGPORT"], "5432")
            self.assertEqual(env["PGDATABASE"], "alsqaya_restore_test_ci")
            for key in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
                self.assertNotIn(key, env)


if __name__ == "__main__":
    unittest.main()
