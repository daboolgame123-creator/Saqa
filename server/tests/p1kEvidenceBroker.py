#!/usr/bin/env python3
"""P1k CI-only broker: validate a synthetic tar stream before extracting fixed artifacts.

No untrusted tar paths, links, devices, directories, duplicate members, or oversize
entries are followed. This is test infrastructure, not a production PDF service.
"""
from __future__ import annotations
import os
import pathlib
import sys
import tarfile

NAMES = (
    "proof.txt", "p1k-file-limit-proof.txt", "native-sandbox-status.txt",
    "native-sandbox-environment.txt", "native-sandbox-diagnostics.txt",
    "native-sandbox-namespace-context.txt", "userns-capability.txt",
    "alternate-native-sandbox-status.txt", "alternate-native-sandbox-diagnostics.txt",
    "details.pdf", "ack.pdf", "aggregate-output-proof.txt",
)
MAX_BYTES = 32 * 1024 * 1024
MAX_PDF_BYTES = 12 * 1024 * 1024

def extract(archive: pathlib.Path, destination: pathlib.Path) -> None:
    if not destination.is_dir():
        raise ValueError("Trusted existing output directory required")
    if destination.is_symlink():
        raise ValueError("Output directory cannot be symlink")
    with tarfile.open(archive, "r:") as tf:
        members = tf.getmembers()
        if len(members) != len(NAMES) or {m.name for m in members} != set(NAMES):
            raise ValueError("Archive members must match strict evidence allowlist")
        if any(not m.isfile() for m in members):
            raise ValueError("Archive contains non-regular member")
        if any(m.size <= 0 or m.size > (MAX_PDF_BYTES if m.name.endswith(".pdf") else 64_000) for m in members):
            raise ValueError("Invalid evidence file size")
        if sum(m.size for m in members) > MAX_BYTES:
            raise ValueError("Aggregate evidence exceeds approved cap")
        for member in members:
            content = tf.extractfile(member)
            if content is None:
                raise ValueError("Missing evidence payload")
            # Destination filenames are fixed literals already validated above.
            fd = os.open(destination / member.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                with os.fdopen(fd, "wb") as dst:
                    remaining = member.size
                    while remaining:
                        chunk = content.read(min(65536, remaining))
                        if not chunk:
                            raise ValueError("Short evidence archive payload")
                        dst.write(chunk)
                        remaining -= len(chunk)
            finally:
                content.close()
            if member.name.endswith(".pdf"):
                data = (destination / member.name).read_bytes()
                if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
                    raise ValueError("Invalid synthetic PDF signature or EOF")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: p1kEvidenceBroker.py <archive> <output-dir>")
    extract(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    print("P1K_EVIDENCE_BROKER_PASS count=12")
