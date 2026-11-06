#!/usr/bin/env python3
"""CI-only WeasyPrint comparison. Synthetic fixtures only; no HTTP integration."""
from __future__ import annotations
import os
from pathlib import Path
import re
import subprocess

from weasyprint import HTML

root = Path(os.environ["ALSQAYA_PREVIEW_DIR"]).resolve(strict=True)
MAX_PDF_BYTES = 12_000_000
for name, expected, marker in (("details", 85, "سجل"), ("ack", 38, "إقرار")):
    source = root / f"chromium-{name}-probe.html"
    if not source.is_file() or source.is_symlink() or source.stat().st_size > 1_000_000:
        raise ValueError("Missing or oversized synthetic HTML fixture")

    def reject_fetch(url: str, *args: object, **kwargs: object) -> object:
        raise ValueError("P1K_WEASYPRINT_EXTERNAL_RESOURCE_DENIED")

    # No URL/file resource access is permitted from the HTML/CSS.
    html = HTML(string=source.read_text(encoding="utf-8"), url_fetcher=reject_fetch)
    pdf = html.write_pdf()
    if not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-2048:]:
        raise ValueError("Invalid WeasyPrint PDF signature/trailer")
    if not 1000 < len(pdf) <= MAX_PDF_BYTES:
        raise ValueError("WeasyPrint PDF exceeds budget or is unexpectedly small")
    output = root / f"weasyprint-{name}-probe.pdf"
    with output.open("xb") as handle:
        handle.write(pdf)
    text = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(output), "-"],
        check=True, capture_output=True, text=True, timeout=30,
    ).stdout
    # Remove Unicode directional controls but retain logical record IDs.
    text = re.sub("[\u202a-\u202e\u2066-\u2069]", "", text)
    ids = [int(m) for m in re.findall(rf"{marker}\s+رقم\s+(\d+)", text)]
    if ids != list(range(1, expected + 1)):
        raise ValueError(f"WeasyPrint {name} continuity mismatch: {len(ids)} / {expected}, head={ids[:8]}")
    if not re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", text):
        raise ValueError(f"WeasyPrint {name} missing ISO timestamps")
    (root / f"weasyprint-{name}-text.txt").write_text(text, encoding="utf-8")
    print(f"P1K_WEASYPRINT_CONTINUITY_PASS kind={name} records={expected} bytes={len(pdf)}")
(root / "p1k-weasyprint-proof.txt").write_text(
    "P1K_WEASYPRINT_ALTERNATIVE_PASS details=85 acknowledgements=38 network_fetch=denied\n",
    encoding="utf-8",
)
