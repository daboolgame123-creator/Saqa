#!/usr/bin/env bash
# P1k S5 — synthetic-only aggregate output quota probe, separate from PDF printer.
# This is proof of a candidate bounded tmpfs, NOT integration or production approval.
set -euo pipefail
: "${ALSQAYA_PREVIEW_DIR:?Synthetic evidence directory required}"
test -d "$ALSQAYA_PREVIEW_DIR"
command -v docker >/dev/null
IMAGE='mcr.microsoft.com/playwright@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a'
# The immutable CI fixture is already pulled by earlier CI steps, but support standalone use.
docker pull "$IMAGE" >/dev/null
timeout 90s docker run --rm --pull=never \
  --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 256m --cpus 1 \
  --ulimit nofile=1024:1024 --ulimit core=0:0 \
  --ulimit fsize=12582912:12582912 \
  --tmpfs /tmp:rw,nosuid,nodev,size=16m,mode=1777 \
  --tmpfs /output:rw,nosuid,nodev,size=32m,mode=1777 \
  "$IMAGE" /bin/bash -euc '
    test "$(id -u)" = "1000"
    grep -Eq "^NoNewPrivs:[[:space:]]+1$" /proc/self/status
    grep -Eq "^Seccomp:[[:space:]]+2$" /proc/self/status
    grep -Eq "^CapEff:[[:space:]]+0+$" /proc/self/status
    grep -Eq "^[^ ]+ /output tmpfs " /proc/mounts
    size=$(df -B1 --output=size /output | tail -n 1 | tr -d " ")
    test "$size" = "33554432" || { echo "UNEXPECTED_OUTPUT_CAPACITY=$size" >&2; exit 31; }
    # Each file is under RLIMIT_FSIZE, but the collection exceeds 32 MiB.
    for n in 1 2 3; do
      dd if=/dev/zero of="/output/fixture-$n.bin" bs=1048576 count=10 status=none
      test "$(stat -c %s "/output/fixture-$n.bin")" = "10485760"
    done
    set +e
    timeout 15s dd if=/dev/zero of=/output/fixture-4.bin bs=1048576 count=10 status=none >/tmp/quota-out 2>/tmp/quota-err
    rejected=$?
    set -e
    if [ "$rejected" -eq 0 ]; then echo "AGGREGATE_QUOTA_UNEXPECTED_SUCCESS" >&2; exit 32; fi
    # The tmpfs capacity is the kernel-backed aggregate limit, not our own sum check.
    used=$(df -B1 --output=used /output | tail -n 1 | tr -d " ")
    test "$used" -le 33554432 || { echo "AGGREGATE_QUOTA_OVERFLOW=$used" >&2; exit 33; }
    rm -f /output/fixture-1.bin /output/fixture-2.bin /output/fixture-3.bin /output/fixture-4.bin
    test -z "$(find /output -mindepth 1 -maxdepth 1 -print -quit)"
    printf recovered > /output/recovery.txt
    test "$(cat /output/recovery.txt)" = recovered
    rm -f /output/recovery.txt
    test -z "$(find /output -mindepth 1 -maxdepth 1 -print -quit)"
    printf "P1K_TOTAL_QUOTA_PASS total_bytes=33554432 attempted_bytes=41943040 rejected=1 recovery=ok\n"
  ' > "$ALSQAYA_PREVIEW_DIR/p1k-container-total-quota-proof.txt"
grep -Fxq 'P1K_TOTAL_QUOTA_PASS total_bytes=33554432 attempted_bytes=41943040 rejected=1 recovery=ok' "$ALSQAYA_PREVIEW_DIR/p1k-container-total-quota-proof.txt"
echo 'P1k synthetic total-quota candidate verified (not wired to PDF exporter).'
