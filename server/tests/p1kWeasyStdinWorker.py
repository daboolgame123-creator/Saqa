#!/usr/bin/env python3
"""CI-only C2: strict JSON stdin -> fixed escaped RTL template -> real PDF stdout.

The host starts this *only* inside a reviewed no-network/read-only Docker
candidate. No HTTP route, arbitrary HTML, input paths or network URLs.
This script alone cannot attest actual production host/container isolation.
"""
from __future__ import annotations

import os
from pathlib import Path
import re
import sys

from p1kWeasyJsonTemplate import InvalidPdfInput, render_pdf

MAX_JSON_BYTES = 512_000
MAX_PDF_BYTES = 12_000_000


def check_synthetic_container_boundary() -> None:
    # These are defense-in-depth assertions, NOT a host-level certification.
    if os.geteuid() != 10001 or os.getegid() != 10001:
        raise RuntimeError("UNPRIVILEGED_UID_GID_REQUIRED")
    status = Path("/proc/self/status").read_text(encoding="ascii")
    for field, wanted in (("NoNewPrivs", "1"), ("Seccomp", "2")):
        if not re.search(rf"^{field}:\s+{wanted}$", status, flags=re.MULTILINE):
            raise RuntimeError("MISSING_SANDBOX_STATUS")
    if not re.search(r"^CapEff:\s+0+$", status, flags=re.MULTILINE):
        raise RuntimeError("UNEXPECTED_EFFECTIVE_CAPABILITIES")
    if not os.path.ismount("/tmp"):
        raise RuntimeError("DEDICATED_TMPFS_REQUIRED")
    size = os.statvfs("/tmp")
    if size.f_frsize * size.f_blocks > 32 * 1024 * 1024:
        raise RuntimeError("TMPFS_UNBOUNDED")
    if Path("/hidden/sentinel.txt").exists() or Path("/sensitive/host-secret.txt").exists():
        raise RuntimeError("INSTITUTIONAL_MOUNT_EXPOSED")
    try:
        with Path("/etc/p1k-forbidden-write").open("wb") as out:
            out.write(b"WRITABLE_ROOT_UNSAFE")
    except OSError:
        pass
    else:
        raise RuntimeError("ROOT_FILESYSTEM_NOT_READ_ONLY")


def main() -> None:
    check_synthetic_container_boundary()
    raw = sys.stdin.buffer.read(MAX_JSON_BYTES + 1)
    if not 0 < len(raw) <= MAX_JSON_BYTES:
        raise InvalidPdfInput("INVALID_STDIN_JSON_SIZE")
    pdf = render_pdf(raw)  # strict v1 decoder and fixed escaped HTML, URL fetcher always denied
    if not 1000 < len(pdf) <= MAX_PDF_BYTES or not pdf.startswith(b"%PDF-"):
        raise InvalidPdfInput("INVALID_RENDERED_PDF_BYTES")
    # Never print JSON or source data to stderr; only the bounded PDF to stdout.
    sys.stdout.buffer.write(pdf)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Fail closed without diagnostics containing personal report content.
        print("C2_OFFLINE_RENDER_FAILED", file=sys.stderr)
        sys.exit(1)
