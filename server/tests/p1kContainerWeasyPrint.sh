#!/usr/bin/env bash
# CI-only: real WeasyPrint in restrictive Docker, fixed synthetic evidence only.
set -euo pipefail
: "${ALSQAYA_PREVIEW_DIR:?Synthetic preview directory required}"
command -v docker >/dev/null
command -v pdftotext >/dev/null
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/input" "$work/hidden"
for kind in details ack; do
  test -s "$ALSQAYA_PREVIEW_DIR/chromium-$kind-probe.html"
  cp "$ALSQAYA_PREVIEW_DIR/chromium-$kind-probe.html" "$work/input/$kind.html"
  chmod 444 "$work/input/$kind.html"
done
printf 'UNMOUNTED_SYNTHETIC_SECRET\n' > "$work/hidden/sentinel.txt"
chmod 755 "$work/input"
IMAGE="alsqaya-p1k-weasyprint-isolated:ci"
# Image installation/build may access package registries; RUN is offline.
timeout 300s docker build --pull -f server/tests/Dockerfile.p1k-weasyprint -t "$IMAGE" .
docker image inspect --format '{{.Id}}' "$IMAGE" > "$ALSQAYA_PREVIEW_DIR/p1k-weasy-image-id.txt"
(
  ulimit -f 65536
  timeout 120s docker run --rm --pull=never \
    --network none --read-only --user 10001:10001 \
    --cap-drop ALL --security-opt no-new-privileges \
    --pids-limit 64 --memory 768m --cpus 1 \
    --ulimit nofile=1024:1024 --ulimit core=0:0 \
    --ulimit fsize=12582912:12582912 \
    --tmpfs /tmp:rw,nosuid,nodev,size=32m,mode=1777 \
    --tmpfs /output:rw,nosuid,nodev,size=32m,mode=1777 \
    --mount "type=bind,src=$work/input,dst=/input,readonly" \
    "$IMAGE" > "$work/evidence.tar"
)
# Never blindly untar untrusted evidence; validate every member in memory.
python3 - "$work/evidence.tar" "$ALSQAYA_PREVIEW_DIR" <<'PY'
import io
from pathlib import Path
import re
import subprocess
import sys
import tarfile
source = Path(sys.argv[1])
out = Path(sys.argv[2])
if source.stat().st_size > 26_000_000:
    raise AssertionError("Oversized evidence archive")
with tarfile.open(source, "r:") as archive:
    members = archive.getmembers()
    if [m.name for m in members] != ["proof.txt", "details.pdf", "ack.pdf"]:
        raise AssertionError("Unexpected evidence archive contents")
    if any(not m.isfile() or m.size < 0 or m.size > 12_000_000 for m in members):
        raise AssertionError("Unsafe evidence member")
    parts = {m.name: archive.extractfile(m).read() for m in members}
proof = parts["proof.txt"].decode("ascii")
if not proof.startswith("P1K_WEASY_ISOLATED_BOUNDARY_PASS ") or "network=denied" not in proof:
    raise AssertionError("Missing container boundary marker")
for kind, count, marker in (("details", 85, "سجل"), ("ack", 38, "إقرار")):
    pdf = parts[f"{kind}.pdf"]
    if not 1000 < len(pdf) <= 12_000_000 or not pdf.startswith(b"%PDF-") or b"%%EOF" not in pdf[-2048:]:
        raise AssertionError(f"Invalid isolated {kind} PDF")
    extraction = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", "-", "-"],
        input=pdf, check=True, capture_output=True, timeout=30,
    ).stdout.decode("utf-8", errors="strict")
    extraction = re.sub("[\u202a-\u202e\u2066-\u2069]", "", extraction)
    ids = [int(n) for n in re.findall(rf"{marker}\s+رقم\s+(\d+)", extraction)]
    dates = re.findall(r"2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", extraction)
    if ids != list(range(1, count+1)) or len(dates) != count:
        raise AssertionError(f"Isolated {kind} continuity failure: {len(ids)} / {len(dates)}")
    (out / f"container-weasyprint-{kind}.pdf").write_bytes(pdf)
    print(f"P1K_WEASY_ISOLATED_PDF_PASS kind={kind} records={count} dates={count} bytes={len(pdf)}")
(out / "p1k-weasy-isolated-proof.txt").write_text(proof, encoding="ascii")
print("P1K_WEASY_ISOLATED_ALL_PASS synthetic=1 documents=2 network=none")
PY
test "$(cat "$work/hidden/sentinel.txt")" = "UNMOUNTED_SYNTHETIC_SECRET"
