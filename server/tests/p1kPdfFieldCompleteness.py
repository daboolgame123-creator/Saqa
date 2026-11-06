#!/usr/bin/env python3
"""CI-only semantic field-completeness check of actual synthetic PDFs."""
from __future__ import annotations
import os
from pathlib import Path
import re
import subprocess

root = Path(os.environ["ALSQAYA_PREVIEW_DIR"]).resolve(strict=True)
DATE = re.compile(r"2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
DIRECTIONAL = re.compile("[\u202a-\u202e\u2066-\u2069]")
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
        ids = [int(x) for x in re.findall(rf"{marker}\s+رقم\s+(\d+)", output)]
        if ids != list(range(1, expected + 1)):
            raise AssertionError(f"{path.name}: record IDs do not match 1..{expected}")
        dates = DATE.findall(output)
        if len(dates) != expected:
            raise AssertionError(f"{path.name}: timestamps={len(dates)} expected={expected}")
        for label in labels:
            count = output.count(label)
            if count != expected:
                raise AssertionError(f"{path.name}: label={label!r}, count={count}, expected={expected}")
        # Form-feed boundaries come from actual PDF pages, not layout guesses.
        pages = output.split("\f")
        if pages and not pages[-1].strip():
            pages.pop()  # pdftotext appends a final form feed
        if not pages:
            raise AssertionError(f"{path.name}: no extracted PDF pages")
        page_ids: list[int] = []
        for page_number, page in enumerate(pages, start=1):
            if not page.strip():
                raise AssertionError(f"{path.name}: blank page {page_number}")
            current_ids = [int(x) for x in re.findall(rf"{marker}\s+رقم\s+(\d+)", page)]
            current_dates = DATE.findall(page)
            if not current_ids or len(current_ids) != len(current_dates):
                raise AssertionError(
                    f"{path.name}: page {page_number}: "
                    f"records={len(current_ids)} timestamps={len(current_dates)}"
                )
            for label in labels:
                if page.count(label) != len(current_ids):
                    raise AssertionError(
                        f"{path.name}: page {page_number} missing field {label!r}"
                    )
            page_ids.extend(current_ids)
        if page_ids != ids:
            raise AssertionError(f"{path.name}: page order differs from complete report")
        print(f"P1K_PDF_FIELDS_PASS engine={engine} kind={kind} records={expected} dates={len(dates)} labels={len(labels)}")
print("P1K_PDF_FIELDS_ALL_PASS pdfs=4 details=85 acknowledgements=38")
