"""CI-only PostgreSQL integration; database contains ONLY synthetic fixtures.

Provision an already migrated disposable source + empty alsqaya_restore_test_* DB.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

import phase24_backup as backup

EMPLOYEE = "00000000-0000-4000-8000-000000002401"
TRANSACTION = "00000000-0000-4000-8000-000000002402"
ATTACHMENT = "ab000000-0000-4000-8000-000000002403"
KEY = f"blobs/{ATTACHMENT[:2]}/{ATTACHMENT[2:4]}/{ATTACHMENT}"
PAYLOAD = b"%PDF-1.7\nSYNTHETIC-PHASE24-D\n"


def main() -> None:
    # Critical: validate *both* endpoints before the first seed INSERT. The
    # restore CLI's own guard is a second, independent layer of protection.
    source = os.environ.get("DATABASE_URL", "")
    restore_target = os.environ.get("RESTORE_TEST_DATABASE_URL", "")
    backup.require_ci_test_database_pair(source, restore_target)
    content_hash = hashlib.sha256(PAYLOAD).hexdigest()
    sql = f"""
      INSERT INTO employees (id,name,title,department)
      VALUES ('{EMPLOYEE}', 'Synthetic Employee', 'Tester', 'Test');
      INSERT INTO transactions (id,number,sequence,document_date,month,direction,category,sub_type,entity,subject,visibility)
      VALUES ('{TRANSACTION}', 'SYN-24', 'SYN', '2026-11-10', '2026-11', 'وارد', 'إدارية', 'testing', 'synthetic-only', 'backup test', '"Administrative"'::jsonb);
      INSERT INTO attachments (id,transaction_id,name,type,original_filename,mime_type,
        file_size,upload_date,size_bytes,created_date,content_hash,storage_key,integrity_state)
      VALUES ('{ATTACHMENT}', '{TRANSACTION}', 'synthetic.pdf', 'pdf', 'synthetic.pdf',
        'application/pdf', '28 bytes','2026-11-10', {len(PAYLOAD)}, '2026-11-10',
        'sha256:{content_hash}', '{KEY}', 'verified');
      INSERT INTO view_logs (transaction_id,employee_id,acknowledged_at)
      VALUES ('{TRANSACTION}','{EMPLOYEE}', now());
      INSERT INTO audit_logs (event_kind,entity_kind,entity_id)
      VALUES ('create','transactions','{TRANSACTION}');
    """
    backup.runner("psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-c", sql], source)
    with tempfile.TemporaryDirectory(prefix="alsqaya-24d-ci-") as temp:
        root = Path(temp)
        filepath = root / "storage" / KEY
        filepath.parent.mkdir(parents=True)
        filepath.write_bytes(PAYLOAD)
        bundle = root / "bundle"
        assert backup.main(["backup", "--output", str(bundle), "--storage-root", str(root / "storage"),
                            "--confirm-writers-stopped"]) == 0
        assert backup.main(["verify", "--bundle", str(bundle)]) == 0
        assert backup.main(["restore-test", "--bundle", str(bundle),
                            "--storage-output", str(root / "restored"),
                            "--confirm-empty-test-db"]) == 0
        assert (root / "restored" / KEY).read_bytes() == PAYLOAD
        # 24-G opt-in: test the *same restored clone* through actual application
        # sessions, HTTP controllers and FileStorage BEFORE corrupting the bundle.
        # The default 24-D exercise remains unchanged unless CI opts in.
        if os.environ.get("ALSQAYA_24G_READBACK") == "true":
            env = dict(os.environ)
            env["ALSQAYA_RESTORED_STORAGE_ROOT"] = str(root / "restored")
            probe = subprocess.run(
                ["node", "--import", "tsx", "server/tests/integration/phase24GRestoredApiReadback.ts"],
                cwd=Path(__file__).resolve().parent.parent,
                env=env, capture_output=True, text=True, check=False, timeout=120,
            )
            marker = "PHASE24_G_RESTORED_APPLICATION_HTTP_PASS"
            if probe.returncode != 0 or marker not in probe.stdout:
                # CI only ever sees synthetic fixture data; limit diagnostics.
                print("24-G restored API readback failed:", probe.stdout[-1500:],
                      probe.stderr[-1500:])
                raise RuntimeError("24-G application readback failed on restored test DB")
            print(marker)
        snapshot = backup.verify(bundle)
        assert snapshot["database"]["counts"]["view_logs"] == 1
        assert snapshot["database"]["counts"]["audit_logs"] == 1
        # A changed byte must invalidate the manifest.
        (bundle / "attachments" / KEY).write_bytes(b"tampered")
        assert backup.main(["verify", "--bundle", str(bundle)]) == 1
    print("Phase24-D migrated PostgreSQL backup/restore integration: PASS")


if __name__ == "__main__":
    main()
