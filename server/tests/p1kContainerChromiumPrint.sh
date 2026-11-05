#!/usr/bin/env bash
# P1k CI-ONLY: Chromium prints synthetic Arabic fixtures inside isolated Docker.
# This is not a production deployment template.
set -euo pipefail
test -n "$ALSQAYA_PREVIEW_DIR"
command -v docker >/dev/null
command -v pdfinfo >/dev/null
command -v pdftotext >/dev/null
test -s "$ALSQAYA_PREVIEW_DIR/chromium-details-probe.html"
test -s "$ALSQAYA_PREVIEW_DIR/chromium-ack-probe.html"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/input" "$work/output" "$work/hidden"
cp "$ALSQAYA_PREVIEW_DIR/chromium-details-probe.html" "$work/input/details.html"
cp "$ALSQAYA_PREVIEW_DIR/chromium-ack-probe.html" "$work/input/ack.html"
printf 'NOT_ACCESSIBLE_FROM_CONTAINER\n' > "$work/hidden/sentinel.txt"
chmod 755 "$work/input"
chmod 444 "$work/input/"*.html
chmod 777 "$work/output"

# Runner-only image tag. Pin vetted image digest before production.
IMAGE='mcr.microsoft.com/playwright:v1.56.1-noble'
timeout 240s docker run --rm --pull=missing \
  --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 1g --cpus 1 \
  --shm-size 128m \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  --mount "type=bind,src=$work/input,dst=/input,readonly" \
  --mount "type=bind,src=$work/output,dst=/output" \
  "$IMAGE" /bin/bash -euc '
    test "$(id -u)" = "1000"
    test ! -e /hidden/sentinel.txt
    if printf unsafe > /input/details.html 2>/dev/null; then exit 14; fi
    if printf unsafe > /etc/p1k-test 2>/dev/null; then exit 15; fi
    for ip in 1.1.1.1 192.168.20.1; do
      if timeout 2 bash -c "echo hi > /dev/tcp/$ip/80" 2>/dev/null; then
        echo "NETWORK_UNEXPECTEDLY_REACHABLE $ip" >&2
        exit 16
      fi
    done
    chrome=$(find /ms-playwright -type f \( -name chrome -o -name headless_shell \) -print -quit)
    test -n "$chrome"
    export HOME=/tmp
    for kind in details ack; do
      timeout 75s "$chrome" --headless --no-sandbox --disable-gpu \
        --disable-dev-shm-usage --disable-background-networking \
        --disable-extensions --no-first-run --no-pdf-header-footer \
        --user-data-dir="/tmp/chrome-$kind" \
        --print-to-pdf="/output/$kind.pdf" "file:///input/$kind.html"
      test -s "/output/$kind.pdf"
    done
    printf "CONTAINER_CHROMIUM_OK\n" >/output/proof.txt
  '
test "$(cat "$work/output/proof.txt")" = "CONTAINER_CHROMIUM_OK"
for kind in details ack; do
  pdf="$work/output/$kind.pdf"
  test "$(head -c 5 "$pdf")" = '%PDF-'
  pages=$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')
  test "$pages" -gt 0
  test "$pages" -lt 45
  pdftotext -layout -enc UTF-8 "$pdf" "$work/$kind.txt"
  test -s "$work/$kind.txt"
  cp "$pdf" "$ALSQAYA_PREVIEW_DIR/container-chromium-$kind.pdf"
  cp "$work/$kind.txt" "$ALSQAYA_PREVIEW_DIR/container-chromium-$kind-text.txt"
  echo "Containerized Chromium $kind pages=$pages"
done
echo 'P1k isolated container rendered both synthetic Arabic PDFs successfully.'
