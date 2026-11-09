#!/usr/bin/env python3
"""CI-only bounded WeasyPrint experiment with synthetic data; NOT an OS sandbox."""
from __future__ import annotations
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
from tempfile import TemporaryDirectory

LIMIT_BYTES = 12_000_000
ADDRESS_SPACE_BYTES = 1_610_612_736


def limits() -> None:
    resource.setrlimit(resource.RLIMIT_AS, (ADDRESS_SPACE_BYTES, ADDRESS_SPACE_BYTES))
    resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT_BYTES, LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def run_bounded(args: list[str], seconds: int) -> subprocess.CompletedProcess[bytes]:
    process = subprocess.Popen(
        [sys.executable, __file__, *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, preexec_fn=limits,
    )
    try:
        stdout, stderr = process.communicate(timeout=seconds)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise
    if len(stdout) + len(stderr) > 100_000:
        raise AssertionError("Excess worker logging")
    return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)


def worker(dest: Path) -> None:
    from weasyprint import HTML

    def reject_fetch(*args: object, **kwargs: object) -> object:
        raise RuntimeError("P1K_DENY_FETCH")

    html = (
        '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">'
        '<body><h1>السقاية</h1>'
        '<p>اختبار عربي اصطناعي ALSQAYA_BOUND_123</p></body></html>'
    )
    pdf = HTML(string=html, url_fetcher=reject_fetch).write_pdf()
    if not 1000 < len(pdf) <= LIMIT_BYTES:
        raise AssertionError("Out-of-budget PDF")
    with dest.open("xb") as handle:
        handle.write(pdf)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "render":
            worker(Path(sys.argv[2]))
        elif sys.argv[1] == "stall":
            import time
            time.sleep(30)
        else:
            raise SystemExit(2)
    else:
        with TemporaryDirectory(prefix="p1k-weasy-bounded-") as directory:
            pdf_path = Path(directory) / "synthetic.pdf"
            result = run_bounded(["render", str(pdf_path)], 30)
            if result.returncode != 0:
                raise RuntimeError(
                    "Bounded worker failed: " +
                    result.stderr.decode(errors="replace")[-1000:]
                )
            pdf = pdf_path.read_bytes()
            if not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-2048:]:
                raise AssertionError("Invalid PDF")
            extracted = subprocess.run(
                ["pdftotext", "-enc", "UTF-8", str(pdf_path), "-"],
                capture_output=True, text=True, check=True, timeout=15,
            ).stdout
            # A stable ASCII marker proves PDF content extraction.
            # Exact Arabic extraction requires a separately licensed font review.
            if "ALSQAYA_BOUND_123" not in extracted:
                raise AssertionError("Synthetic content marker missing")
            print(f"P1K_WEASY_BOUNDED_RENDER_PASS bytes={len(pdf)}")
            try:
                run_bounded(["stall"], 1)
                raise AssertionError("Stalled worker was not killed")
            except subprocess.TimeoutExpired:
                print("P1K_WEASY_BOUNDED_TIMEOUT_PASS killed=1")
        print("P1K_WEASY_BOUNDED_CLEANUP_PASS temporary_directory_removed=1")
