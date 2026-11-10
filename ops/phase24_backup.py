#!/usr/bin/env python3
"""ALSQAYA Phase 24-D: offline PostgreSQL + attachment backup / synthetic restore.

Python stdlib + PostgreSQL clients only. Not a production restore utility.
The operator MUST independently enforce a write-free maintenance window.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

FORMAT = "alsqaya-offline-backup-v1"
TABLES = ("attachments", "view_logs", "audit_logs", "transactions", "employees", "schema_migrations")
DUMP_NAME = "database.pgdump"
MANIFEST_NAME = "manifest.json"


class BackupError(RuntimeError):
    pass


def require(condition: bool, explanation: str) -> None:
    if not condition:
        raise BackupError(explanation)


def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def runner(executable: str, arguments: list[str], url: str, capture: bool = False) -> str:
    """Never pass a connection URI through process argv or echo tool stderr."""
    require(bool(url), "Database connection environment variable is missing")
    env = dict(os.environ, PGDATABASE=url, PGCONNECT_TIMEOUT="10")
    try:
        result = subprocess.run(
            [executable, *arguments], env=env, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, timeout=900, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise BackupError(f"{executable} unavailable or timed out") from None
    require(result.returncode == 0, f"{executable} failed (exit {result.returncode}); no credentials logged")
    return result.stdout.decode("utf-8") if capture else ""


def db_json(url: str, expression: str) -> object:
    result = runner("psql", ["-X", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1", "-c", expression], url, True)
    try:
        return json.loads(result.strip())
    except (json.JSONDecodeError, ValueError):
        raise BackupError("Unexpected PostgreSQL JSON response") from None


def db_state(url: str) -> dict:
    counts = db_json(url, "SELECT json_build_object(" + ",".join(
        f"'{t}', (SELECT count(*) FROM public.{t})" for t in TABLES
    ) + ")::text")
    attachments = db_json(url, """SELECT COALESCE(json_agg(json_build_object(
        'id', id::text, 'storage_key', storage_key, 'content_hash', content_hash,
        'size_bytes', size_bytes) ORDER BY id), '[]'::json)::text FROM public.attachments""")
    migrations = db_json(url, """SELECT COALESCE(json_agg(json_build_object(
        'version', version, 'checksum', checksum) ORDER BY version), '[]'::json)::text
        FROM public.schema_migrations""")
    require(isinstance(counts, dict) and isinstance(attachments, list) and isinstance(migrations, list),
            "Unexpected database snapshot shape")
    return {"counts": counts, "attachments": attachments, "migrations": migrations}


def assert_schema(state: dict) -> None:
    expected_path = Path(__file__).resolve().parent.parent / "server/migrations/0015_transaction_cursor_index.sql"
    require(expected_path.is_file(), "Required migration 0015 file is missing")
    expected = hash_file(expected_path)
    matching = [m for m in state["migrations"] if m.get("version") == 15]
    require(len(matching) == 1 and matching[0].get("checksum") == expected,
            "Migration 0015 is absent or has a different checksum")


def safe_path(rel: str) -> PurePosixPath:
    require(isinstance(rel, str) and bool(rel) and "\\" not in rel and "\x00" not in rel,
            "Unsafe file path in manifest")
    p = PurePosixPath(rel)
    require(not p.is_absolute() and all(part not in ("", ".", "..") for part in rel.split("/")),
            "Unsafe relative path in manifest")
    return p


def inventory(root: Path) -> list[Path]:
    require(root.is_dir() and not root.is_symlink(), "Attachment root must be a real directory")
    result: list[Path] = []
    for base, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            node = Path(base) / name
            mode = node.lstat().st_mode
            require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), "Symlink or special file in attachments is forbidden")
            require(not node.is_symlink(), "Symlink in attachments is forbidden")
        dirs.sort()
        for name in sorted(files):
            item = Path(base) / name
            require(not name.endswith(".partial"), "Unfinished attachment write detected")
            result.append(item)
    return result


def catalog(root: Path) -> tuple[list[dict], dict[str, dict]]:
    records = []
    by_path = {}
    for source in inventory(root):
        rel = source.relative_to(root).as_posix()
        safe_path(rel)
        record = {"path": rel, "size": source.stat().st_size, "sha256": hash_file(source)}
        records.append(record)
        by_path[rel] = record
    return records, by_path


def check_references(state: dict, by_path: dict[str, dict]) -> dict[str, int]:
    unknown = 0
    legacy = 0
    referenced = set()
    for row in state["attachments"]:
        identity = row.get("id")
        key = row.get("storage_key")
        require(isinstance(identity, str) and bool(identity), "Invalid attachment ID in database")
        if key is None:
            legacy += 1
            continue
        require(isinstance(key, str), "Invalid attachment storage key")
        expected_key = f"blobs/{identity[:2]}/{identity[2:4]}/{identity}"
        require(key == expected_key, "Attachment storage key does not match its stable ID")
        entry = by_path.get(key)
        require(entry is not None, "An attachment referenced by PostgreSQL is missing")
        referenced.add(key)
        if row.get("size_bytes") is not None:
            require(int(row["size_bytes"]) == entry["size"], "Attachment size mismatch")
        stored_hash = row.get("content_hash")
        if isinstance(stored_hash, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", stored_hash):
            require(stored_hash[7:] == entry["sha256"], "Attachment content hash differs from database")
        else:
            unknown += 1
    return {"referenced_files": len(referenced), "legacy_without_key": legacy,
            "unverifiable_db_hash": unknown, "unreferenced_files": len(by_path) - len(referenced)}


def verify(bundle: Path) -> dict:
    require(bundle.is_dir() and not bundle.is_symlink(), "Backup bundle is not a directory")
    manifest_path = bundle / MANIFEST_NAME
    require(manifest_path.is_file() and not manifest_path.is_symlink(), "Incomplete backup: manifest missing")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        raise BackupError("Invalid backup manifest") from None
    require(isinstance(manifest, dict) and manifest.get("format") == FORMAT and
            manifest.get("consistency") == "operator-confirmed-writers-stopped", "Unsupported backup format")
    dump = manifest.get("dump")
    require(isinstance(dump, dict) and dump.get("path") == DUMP_NAME, "Invalid database dump entry")
    expected_files = {DUMP_NAME}
    entries = manifest.get("files")
    require(isinstance(entries, list), "Invalid file inventory")
    for entry in [dump, *entries]:
        require(isinstance(entry, dict), "Invalid file entry")
        path = safe_path(entry.get("path"))
        relative = path.as_posix()
        archive_relative = relative if entry is dump else "attachments/" + relative
        require(archive_relative not in expected_files if entry is not dump else True, "Duplicate file entry")
        expected_files.add(archive_relative)
        item = bundle / archive_relative
        require(item.is_file() and not item.is_symlink(), "Backup file missing or unsafe")
        require(isinstance(entry.get("size"), int) and entry["size"] >= 0 and
                entry["size"] == item.stat().st_size, "Backup file size mismatch")
        require(isinstance(entry.get("sha256"), str) and
                re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) and
                entry["sha256"] == hash_file(item), "Backup SHA-256 mismatch")
    actual = {p.relative_to(bundle).as_posix() for p in inventory(bundle)}
    require(actual == expected_files | {MANIFEST_NAME}, "Missing or unexpected files in backup bundle")
    state = manifest.get("database")
    require(isinstance(state, dict) and isinstance(state.get("attachments"), list) and
            isinstance(state.get("counts"), dict) and isinstance(state.get("migrations"), list),
            "Incomplete database manifest")
    require(state["counts"].get("attachments") == len(state["attachments"]), "Attachment count inconsistent")
    check_references(state, {entry["path"]: entry for entry in entries})
    return manifest


def backup(args: argparse.Namespace) -> None:
    require(args.confirm_writers_stopped, "Stop ALL application/worker/DB writers and confirm maintenance first")
    url = os.environ.get("DATABASE_URL", "")
    require(bool(url), "DATABASE_URL is required")
    source = Path(args.storage_root).resolve(strict=True)
    destination = Path(args.output).absolute()
    require(not destination.exists() and not destination.is_symlink(), "Output backup path must not exist")
    require(not (destination == source or source in destination.parents or destination in source.parents),
            "Backup destination and attachment root must be separate")
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = destination.parent / (destination.name + ".partial." + uuid.uuid4().hex)
    stage.mkdir(mode=0o700)
    try:
        first = db_state(url)
        assert_schema(first)
        runner("pg_dump", ["--no-password", "--format=custom", "--file=" + str(stage / DUMP_NAME)], url)
        attachments_dest = stage / "attachments"
        attachments_dest.mkdir(mode=0o700)
        files, original = catalog(source)
        check_references(first, original)
        for entry in files:
            src = source / entry["path"]
            target = attachments_dest / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, target, follow_symlinks=False)
            require(hash_file(target) == entry["sha256"] and hash_file(src) == entry["sha256"],
                    "Attachment changed during backup")
        second = db_state(url)
        require(first == second, "Database metadata changed during backup; maintenance violated")
        current, _ = catalog(source)
        require(current == files, "Attachment source changed during backup")
        dump_path = stage / DUMP_NAME
        manifest = {"format": FORMAT, "created_at_utc": datetime.now(timezone.utc).isoformat(),
                    "consistency": "operator-confirmed-writers-stopped",
                    "dump": {"path": DUMP_NAME, "size": dump_path.stat().st_size,
                             "sha256": hash_file(dump_path)},
                    "files": files, "database": first,
                    "reference_summary": check_references(first, original)}
        (stage / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        verify(stage)
        stage.rename(destination)
        print("Backup verified and finalized; counts:", json.dumps(first["counts"], sort_keys=True))
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def restore_sql_dump(bundle: Path, url: str) -> None:
    """Stream pg_restore SQL into psql -1; a URL is never exposed in argv."""
    env = dict(os.environ, PGDATABASE=url, PGCONNECT_TIMEOUT="10")
    try:
        producer = subprocess.Popen(
            ["pg_restore", "--no-owner", "--no-acl", str(bundle / DUMP_NAME)],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
        )
        try:
            consumer = subprocess.Popen(
                ["psql", "-X", "-w", "-v", "ON_ERROR_STOP=1", "-1", "-f", "-"],
                stdin=producer.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
            )
        except BaseException:
            producer.kill()
            producer.wait()
            raise
        assert producer.stdout is not None
        producer.stdout.close()
        try:
            psql_status = consumer.wait(timeout=900)
            pg_restore_status = producer.wait(timeout=900)
        except subprocess.TimeoutExpired:
            consumer.kill()
            producer.kill()
            consumer.wait()
            producer.wait()
            raise BackupError("Restore timed out") from None
    except OSError:
        raise BackupError("pg_restore or psql unavailable") from None
    require(psql_status == 0 and pg_restore_status == 0, "Restore failed; discard the synthetic target database")


def restore_test(args: argparse.Namespace) -> None:
    require(args.confirm_empty_test_db and os.environ.get("NODE_ENV") == "test",
            "Test restore requires NODE_ENV=test and explicit empty-target confirmation")
    manifest = verify(Path(args.bundle))
    url = os.environ.get("RESTORE_TEST_DATABASE_URL", "")
    require(bool(url), "RESTORE_TEST_DATABASE_URL required")
    db_name = runner("psql", ["-X", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1",
                              "-c", "SELECT current_database()"], url, True).strip()
    require(re.fullmatch(r"alsqaya_restore_test_[a-z0-9_]+", db_name) is not None,
            "Target DB must have the dedicated alsqaya_restore_test_ prefix")
    count = runner("psql", ["-X", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1",
                            "-c", "SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n"
                                  " ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')"],
                   url, True).strip()
    require(count == "0", "Target database contains objects; refusing overwrite")
    target = Path(args.storage_output).absolute()
    require(not target.exists() and not target.is_symlink(), "Restore file target must not exist")
    bundle = Path(args.bundle).resolve(strict=True)
    require(bundle not in target.parents and target not in bundle.parents, "Restore target overlaps backup")
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.parent / (target.name + ".partial." + uuid.uuid4().hex)
    stage.mkdir(mode=0o700)
    try:
        restore_sql_dump(bundle, url)
        state = db_state(url)
        require(state == manifest["database"], "Restored database does not match backup metadata")
        for entry in manifest["files"]:
            dst = stage / entry["path"]
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(bundle / "attachments" / entry["path"], dst, follow_symlinks=False)
            require(hash_file(dst) == entry["sha256"], "Restored attachment SHA-256 mismatch")
        check_references(state, catalog(stage)[1])
        stage.rename(target)
        print("Synthetic restore verified; counts:", json.dumps(state["counts"], sort_keys=True))
    except BaseException:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    b = sub.add_parser("backup")
    b.add_argument("--output", required=True)
    b.add_argument("--storage-root", required=True)
    b.add_argument("--confirm-writers-stopped", action="store_true")
    v = sub.add_parser("verify")
    v.add_argument("--bundle", required=True)
    r = sub.add_parser("restore-test")
    r.add_argument("--bundle", required=True)
    r.add_argument("--storage-output", required=True)
    r.add_argument("--confirm-empty-test-db", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.operation == "backup":
            backup(args)
        elif args.operation == "verify":
            manifest = verify(Path(args.bundle))
            print("Verified backup:", len(manifest["files"]), "files")
        else:
            restore_test(args)
        return 0
    except (BackupError, OSError, ValueError, KeyError, TypeError) as exc:
        print("Phase24-D refused:", str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
