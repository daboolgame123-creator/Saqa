#!/usr/bin/env python3
"""CI-only paired raster evidence for synthetic Arabic PDF engines.

This program checks metadata and makes matched PNG samples; it does not score
Arabic typography or certify either renderer for deployment.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

root = Path(os.environ["ALSQAYA_PREVIEW_DIR"]).resolve(strict=True)
outputs = []
for engine in ("weasyprint", "chromium"):
    for kind in ("details", "ack"):
        pdf = root / f"{engine}-{kind}-probe.pdf"
        if not pdf.is_file() or pdf.is_symlink():
            raise RuntimeError(f"Missing ordinary synthetic PDF: {pdf.name}")
        data = pdf.read_bytes()
        if not 1000 < len(data) <= 12_000_000 or not data.startswith(b"%PDF-"):
            raise RuntimeError(f"Unacceptable synthetic PDF: {pdf.name}")
        info = subprocess.run(
            ["pdfinfo", str(pdf)], capture_output=True, text=True,
            check=True, timeout=30,
        ).stdout
        match = re.search(r"^Pages:\s*(\d+)\s*$", info, re.MULTILINE)
        if not match or not 1 <= int(match.group(1)) < 50:
            raise RuntimeError(f"Missing/bad page count: {pdf.name}")
        pages = int(match.group(1))
        images = []
        for label, page in (("first", 1), ("last", pages)):
            prefix = root / f"alt03a-{engine}-{kind}-{label}"
            subprocess.run(
                ["pdftoppm", "-f", str(page), "-l", str(page),
                 "-singlefile", "-r", "110", "-png", str(pdf), str(prefix)],
                check=True, timeout=90, capture_output=True,
            )
            png = prefix.with_suffix(".png")
            if not png.is_file() or png.stat().st_size < 1000:
                raise RuntimeError(f"Missing raster output: {png.name}")
            images.append(png.name)
        outputs.append({
            "engine": engine, "kind": kind, "pages": pages,
            "pdf": pdf.name, "pdf_bytes": len(data),
            "pdf_sha256": hashlib.sha256(data).hexdigest(),
            "png_samples": images, "raster_dpi": 110,
        })
        print(f"P1K_ALT03A_RASTER_PASS engine={engine} kind={kind} pages={pages} samples=2")
manifest = root / "p1k-alt03a-paired-evidence.json"
manifest.write_text(json.dumps(outputs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("P1K_ALT03A_PAIRED_EVIDENCE_READY pairs=2 pdfs=4 pngs=8 visual_approval=no")
