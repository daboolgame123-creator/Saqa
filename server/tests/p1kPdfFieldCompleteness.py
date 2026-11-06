#!/usr/bin/env python3
"""CI-only semantic field-completeness check of actual synthetic PDFs."""
from __future__ import annotations
import os
from pathlib import Path
import re
import subprocess

root = Path(os.environ["ALSQAYA_PREVIEW_DIR"]).resolve(strict=True)
DATE = re.compile(r"2026-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z")
DIRECTIONAL = re.compile("[\\u202a-\\u202e\\u2066-\\u2069]")
for engine in ("weasyprint", "chromium"):
    for kind, expected, marker, labels in (
        ("details", 85, "سجل", ("تاريخ التسجيل", "النوع", "الحالة", "العنوان")),
        ("ack", 38, "إقرار", ("المنتسب", "موضوع الكتاب")),
    ):
        path = root / f"{engine}-{kind}-probe.pdf"
        if not path.is_file() or path.is_symlink() or not 1000 < path.stat().st_size <= 12_000_000:
            raise AssertionError(f"Untrusted or missing synthetic PDF {path.name}")
        output = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30,
        ).stdout.decode("utf-8", errors="strict")
        output = DIRECTIONAL.sub("", output)
        ids = [int(x) for x in re.findall(rf"{marker}\\s+رقم\\s+(\\d+)", output)]
        if ids != list(range(1, expected + 1)):
            raise AssertionError(f"{path.name}: record IDs do not match 1..{expected}")
        dates = DATE.findall(output)
        if len(dates) != expected:
            raise AssertionError(f"{path.name}: timestamps={len(dates)} expected={expected}")
        for label in labels:
            count = output.count(label)
            if count != expected:
                raise AssertionError(f"{path.name}: label={label!r}, count={count}, expected={expected}")
        print(f"P1K_PDF_FIELDS_PASS engine={engine} kind={kind} records={expected} dates={len(dates)} labels={len(labels)}")
print("P1K_PDF_FIELDS_ALL_PASS pdfs=4 details=85 acknowledgements=38")
