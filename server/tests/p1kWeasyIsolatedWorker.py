#!/usr/bin/env python3
"""Synthetic-only inside-container WeasyPrint printer. Emits fixed evidence TAR to stdout."""
from __future__ import annotations
import io
import os
from pathlib import Path
import re
import socket
import sys
import tarfile

from weasyprint import HTML

INPUT = Path("/input")
OUTPUT = Path("/output")
MAX_BYTES = 12_000_000


def check_boundaries() -> str:
    if os.geteuid() != 10001:
        raise RuntimeError("UID_NOT_RESTRICTED")
    status = Path("/proc/self/status").read_text()
    for key, expected in (("NoNewPrivs", "1"), ("Seccomp", "2")):
        if not re.search(rf"^{key}:\s+{expected}$", status, flags=re.MULTILINE):
            raise RuntimeError(f"{key}_UNSAFE")
    if not re.search(r"^CapEff:\s+0+$", status, flags=re.MULTILINE):
        raise RuntimeError("CAPABILITIES_PRESENT")
    if Path("/hidden/sentinel.txt").exists() or Path("/sensitive/host-secret.txt").exists():
        raise RuntimeError("HOST_SECRET_MOUNTED")
    if not INPUT.is_dir() or not OUTPUT.is_dir():
        raise RuntimeError("MOUNTS_MISSING")
    output_fs = os.statvfs(OUTPUT)
    capacity = output_fs.f_frsize * output_fs.f_blocks
    if capacity > 32 * 1024 * 1024 or capacity < MAX_BYTES:
        raise RuntimeError(f"OUTPUT_QUOTA_UNEXPECTED:{capacity}")
    for attempt in (Path("/etc/p1k-forbidden-write"), INPUT / "details.html"):
        try:
            with attempt.open("wb") as file:
                file.write(b"UNEXPECTED_WRITE")
        except OSError:
            pass
        else:
            raise RuntimeError(f"UNEXPECTED_WRITE:{attempt}")
    with socket.socket() as sock:
        sock.settimeout(2)
        try:
            sock.connect(("1.1.1.1", 80))
        except OSError:
            pass
        else:
            raise RuntimeError("EXTERNAL_NETWORK_ACCESS")
    return "uid=10001 no_new_privs=1 seccomp=2 capeff=0 network=denied input=readonly root=readonly"


def main() -> None:
    proof = check_boundaries()
    files: dict[str, bytes] = {}
    for kind in ("details", "ack"):
        source = INPUT / f"{kind}.html"
        if not source.is_file() or source.is_symlink() or source.stat().st_size > 1_000_000:
            raise RuntimeError(f"BAD_INPUT:{kind}")
        content = source.read_text(encoding="utf-8")

        def reject_fetch(*args: object, **kwargs: object) -> object:
            raise RuntimeError("P1K_EXTERNAL_RESOURCE_DENIED")

        pdf = HTML(string=content, url_fetcher=reject_fetch).write_pdf()
        if not 1000 < len(pdf) <= MAX_BYTES or not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-2048:]:
            raise RuntimeError(f"BAD_PDF:{kind}")
        destination = OUTPUT / f"{kind}.pdf"
        with destination.open("xb") as handle:
            handle.write(pdf)
        files[f"{kind}.pdf"] = pdf

    files["proof.txt"] = ("P1K_WEASY_ISOLATED_BOUNDARY_PASS " + proof + "\n").encode()
    # Only fixed names, fixed count and bounded bytes are exported.
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as archive:
        for name in ("proof.txt", "details.pdf", "ack.pdf"):
            payload = files[name]
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            info.mode = 0o400
            archive.addfile(info, io.BytesIO(payload))
    print("P1K_WEASY_ISOLATED_WORKER_FINISHED", file=sys.stderr)


if __name__ == "__main__":
    main()
