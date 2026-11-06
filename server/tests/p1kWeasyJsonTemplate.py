#!/usr/bin/env python3
"""ALT-08 fixed, escaped RTL HTML template. CI proof only, no HTTP activation."""
from __future__ import annotations
from html import escape
import json
from pathlib import Path
import re

MAX_BYTES = 512_000
EXPECTED = {"schemaVersion", "title", "summary", "details", "acknowledgements", "hasAcknowledgements"}
LABELS = ("التاريخ", "النوع", "القسم", "المنتسب", "الحالة", "المصدر", "العنوان", "الملاحظات")
ACK_LABELS = ("المنتسب", "تاريخ الإقرار", "موضوع الكتاب")


class InvalidPdfInput(ValueError):
    pass


def validate_text(value: object) -> str:
    if not isinstance(value, str) or len(value) > 4000:
        raise InvalidPdfInput("invalid string")
    if any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
        raise InvalidPdfInput("unpaired unicode surrogate")
    return value


def check_rows(value: object, cols: int, max_count: int) -> list[list[str]]:
    if not isinstance(value, list) or len(value) > max_count:
        raise InvalidPdfInput("invalid row count")
    result = []
    for row in value:
        if not isinstance(row, list) or len(row) != cols:
            raise InvalidPdfInput("wrong number of columns")
        clean = [validate_text(v) for v in row]
        if cols != 2 and sum(map(len, clean)) > 1200:
            raise InvalidPdfInput("row too long")
        result.append(clean)
    return result


def decode(data: bytes) -> dict:
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_BYTES:
        raise InvalidPdfInput("bad input byte count")
    try:
        obj = json.loads(data.decode("utf-8", errors="strict"))
    except (UnicodeError, ValueError) as exc:
        raise InvalidPdfInput("invalid JSON/UTF-8") from exc
    if not isinstance(obj, dict) or set(obj) != EXPECTED or obj["schemaVersion"] != 1:
        raise InvalidPdfInput("unexpected envelope")
    if type(obj["hasAcknowledgements"]) is not bool:
        raise InvalidPdfInput("ack flag type")
    title = validate_text(obj["title"])
    summary = check_rows(obj["summary"], 2, 100)
    details = check_rows(obj["details"], 8, 250)
    ack = check_rows(obj["acknowledgements"], 3, 250)
    if not obj["hasAcknowledgements"] and ack:
        raise InvalidPdfInput("acknowledgements forbidden")
    total = len(title) + sum(len(s) for row in summary + details + ack for s in row)
    if total > 180_000:
        raise InvalidPdfInput("text limit")
    return dict(schemaVersion=1, title=title, summary=summary, details=details,
                acknowledgements=ack, hasAcknowledgements=obj["hasAcknowledgements"])


def field(label: str, value: str) -> str:
    if not value:
        return ""
    # Never insert data into HTML attributes, CSS, URLs or scripts.
    iso_date = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value))
    tag = "bdi" if iso_date else "span"
    direction = ' dir="ltr"' if iso_date else ""
    return (f'<div class="field"><span class="label">{escape(label, quote=True)}</span>'
            f'<{tag}{direction} class="value">{escape(value, quote=True)}</{tag}></div>')


def make_html(doc: dict) -> str:
    pieces = ['<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">',
              "<style>@page{size:A4;margin:14mm 14mm 16mm 14mm}"
              "html{font-family:'DejaVu Sans',sans-serif;color:#152b3e;direction:rtl}"
              "body{margin:0;font-size:10pt;line-height:1.55}"
              "h1{font-size:17pt;margin:0 0 5mm}"
              ".record{border:1px solid #ccd8e2;border-radius:4px;margin:0 0 2mm;"
              "padding:1.5mm 3mm;break-inside:avoid;page-break-inside:avoid}"
              ".record-title{font-weight:bold;margin:0 0 1mm}"
              ".field{display:flex;gap:4mm;align-items:flex-start;overflow-wrap:anywhere}"
              ".label{font-weight:600;flex:0 0 29mm}"
              ".value{min-width:0;flex:1 1 0;unicode-bidi:isolate}"
              "bdi.value{direction:ltr;text-align:right;white-space:nowrap}"
              "</style></head><body>",
              f'<h1>{escape(doc["title"], quote=True)}</h1>',
              '<h2>الملخص الإحصائي</h2>']
    for key, value in doc["summary"]:
        pieces.append(field(key, value))
    pieces.append('<h2>جدول التفاصيل</h2>')
    for i, row in enumerate(doc["details"], 1):
        pieces.append(f'<section class="record"><div class="record-title">سجل رقم {i}</div>')
        pieces.extend(field(label, v) for label, v in zip(LABELS, row))
        pieces.append("</section>")
    if doc["hasAcknowledgements"]:
        pieces.append('<h2>الإقرارات الرسمية</h2>')
        for i, row in enumerate(doc["acknowledgements"], 1):
            pieces.append(f'<section class="record"><div class="record-title">إقرار رقم {i}</div>')
            pieces.extend(field(label, v) for label, v in zip(ACK_LABELS, row))
            pieces.append("</section>")
    pieces.append("</body></html>")
    return "".join(pieces)


def render_pdf(payload: bytes) -> bytes:
    from weasyprint import HTML
    doc = decode(payload)
    html = make_html(doc)

    def reject_fetch(url: str, *args: object, **kwargs: object) -> object:
        raise InvalidPdfInput("external resource request denied")

    pdf = HTML(string=html, url_fetcher=reject_fetch).write_pdf()
    if not 1000 < len(pdf) <= 12_000_000 or not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-2048:]:
        raise InvalidPdfInput("bad PDF")
    return pdf


if __name__ == "__main__":
    import os
    directory = Path(os.environ["ALSQAYA_PREVIEW_DIR"]).resolve(strict=True)
    for kind in ("details", "ack"):
        source = directory / f"p1k-alt08-{kind}.json"
        if source.is_symlink() or source.stat().st_size > MAX_BYTES:
            raise InvalidPdfInput("unsafe input file")
        data = source.read_bytes()
        doc = decode(data)
        html = make_html(doc)
        if "<script>" in html or "<img " in html:
            raise AssertionError("literal report values were interpreted as markup")
        output = directory / f"p1k-alt08-{kind}.pdf"
        output.write_bytes(render_pdf(data))
        print(f"P1K_ALT08_JSON_PDF_PASS kind={kind} rows={len(doc['details'])} acknowledgements={len(doc['acknowledgements'])} bytes={output.stat().st_size}")
