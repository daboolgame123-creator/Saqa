#!/usr/bin/env bash
# ALT-09 CI-only: ALT-07 JSON -> fixed escaped template -> real WeasyPrint in restricted Docker.
set -euo pipefail
: "${ALSQAYA_PREVIEW_DIR:?Synthetic fixture directory required}"
command -v docker >/dev/null
command -v pdftotext >/dev/null
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/input" "$work/hidden"
for kind in details ack; do
  source="$ALSQAYA_PREVIEW_DIR/p1k-alt08-$kind.json"
  test -s "$source"
  cp "$source" "$work/input/$kind.json"
  chmod 444 "$work/input/$kind.json"
done
chmod 755 "$work/input"
printf 'SYNTHETIC_HOST_SENTINEL_UNMOUNTED\n' > "$work/hidden/sentinel.txt"
IMAGE="alsqaya-p1k-weasyprint-isolated:ci"
timeout 300s docker build --pull -f server/tests/Dockerfile.p1k-weasyprint -t "$IMAGE" .
docker image inspect --format '{{.Id}}' "$IMAGE" > "$ALSQAYA_PREVIEW_DIR/p1k-json-isolated-image-id.txt"
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
    --entrypoint python "$IMAGE" /opt/p1k/jsonworker.py > "$work/evidence.tar"
)
python3 - "$work/evidence.tar" "$ALSQAYA_PREVIEW_DIR" <<'PY'
from pathlib import Path
import re
import subprocess
import sys
import tarfile
src=Path(sys.argv[1])
root=Path(sys.argv[2])
if not 0 < src.stat().st_size <= 26_000_000:
    raise AssertionError("Invalid evidence TAR size")
with tarfile.open(src, "r:") as archive:
    members=archive.getmembers()
    if [m.name for m in members] != ["proof.txt","details.pdf","ack.pdf"]:
        raise AssertionError("Unexpected TAR member list")
    if any(not m.isfile() or m.size < 0 or m.size > 12_000_000 for m in members):
        raise AssertionError("Unsafe TAR members")
    parts={m.name: archive.extractfile(m).read() for m in members}
expected="P1K_JSON_ISOLATED_BOUNDARY_PASS uid=10001 no_new_privs=1 seccomp=2 capeff=0 network=denied input=readonly root=readonly\n"
if parts["proof.txt"].decode("ascii") != expected:
    raise AssertionError("Container boundary evidence mismatch")
(root/"p1k-alt09-isolated-boundary.txt").write_bytes(parts["proof.txt"])
for kind, marker, wanted in (
    ("details","سجل",["ALT08_ROW_001","ALT08_ROW_002","ALT08_ROW_003"]),
    ("ack","إقرار",["ALT08_CIRCULAR_001","ALT08_ACK_001","ALT08_ACK_002"]),
):
    data=parts[f"{kind}.pdf"]
    if not 1000 < len(data) <= 12_000_000 or not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
        raise AssertionError("Invalid isolated output PDF")
    text=subprocess.run(["pdftotext","-layout","-enc","UTF-8","-","-"],
        input=data,capture_output=True,check=True,timeout=30).stdout.decode("utf8")
    text=re.sub("[\u202a-\u202e\u2066-\u2069]","",text)
    if any(value not in text for value in wanted):
        raise AssertionError(f"Missing synthetic marker: {kind}")
    record_ids=[int(x) for x in re.findall(rf"{marker}\s+رقم\s+(\d+)",text)]
    count=3 if kind=="details" else 2
    if record_ids != list(range(1,count+1)):
        raise AssertionError(f"Record continuity mismatch {kind}: {record_ids}")
    if "file:///etc/passwd" in text and kind == "details":
        # This is expected as inert report text; it must not be fetched.
        pass
    (root/f"p1k-alt09-isolated-{kind}.pdf").write_bytes(data)
    print(f"P1K_ALT09_ISOLATED_JSON_PDF_PASS kind={kind} records={count} markers={len(wanted)} bytes={len(data)}")
print("P1K_ALT09_ISOLATED_JSON_ALL_PASS documents=2 network=none data_only=1")
PY
test "$(cat "$work/hidden/sentinel.txt")" = "SYNTHETIC_HOST_SENTINEL_UNMOUNTED"
