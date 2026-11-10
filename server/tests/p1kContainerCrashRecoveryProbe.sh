#!/usr/bin/env bash
# P1k S5 — controlled abrupt termination of a synthetic partial PDF job.
# Runs inside pinned Chromium CI image but intentionally uses a synthetic writer;
# it does NOT prove a live Chromium process was killed mid-render.
set -euo pipefail
: "${ALSQAYA_PREVIEW_DIR:?Evidence directory must be supplied}"
test -d "$ALSQAYA_PREVIEW_DIR"
command -v docker >/dev/null
IMAGE='mcr.microsoft.com/playwright@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a'
NAME="alsqaya-p1k-crash-${GITHUB_RUN_ID:-local}-$$-$RANDOM"
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker pull "$IMAGE" >/dev/null
# Every writable path is in ephemeral tmpfs. No writable host bind mounts.
COMMON=(
  --network none --read-only --user 1000:1000
  --cap-drop ALL --security-opt no-new-privileges
  --pids-limit 64 --memory 256m --cpus 1
  --ulimit nofile=1024:1024 --ulimit core=0:0
  --ulimit fsize=12582912:12582912
  --tmpfs /tmp:rw,nosuid,nodev,size=16m,mode=1777
  --tmpfs /output:rw,nosuid,nodev,size=32m,mode=1777
)
# Simulate an exporter that wrote an incomplete PDF before its container failed.
timeout 40s docker run -d --pull=never --name "$NAME" "${COMMON[@]}" "$IMAGE" \
  /bin/sh -c 'printf "%s\n" "%PDF-1.7" "partial synthetic report" > /output/partial.pdf; printf ready > /output/ready; while :; do sleep 1; done' >/dev/null
ready=0
for _ in $(seq 1 50); do
  if docker exec "$NAME" /bin/sh -c 'test -s /output/partial.pdf && test -s /output/ready' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done
if [ "$ready" -ne 1 ]; then
  echo "Synthetic container did not reach partial-output state" >&2
  exit 31
fi
# Verify the limits were applied to the exact container prior to force-stopping it.
test "$(docker exec "$NAME" /bin/sh -c 'df -B1 --output=size /output | tail -n 1 | tr -d " "')" = 33554432
docker exec "$NAME" /bin/sh -c 'grep -Eq "^NoNewPrivs:[[:space:]]+1$" /proc/self/status'
docker exec "$NAME" /bin/sh -c 'grep -Eq "^Seccomp:[[:space:]]+2$" /proc/self/status'
docker exec "$NAME" /bin/sh -c 'grep -Eq "^CapEff:[[:space:]]+0+$" /proc/self/status'
timeout 15s docker kill "$NAME" >/dev/null
test "$(docker inspect -f '{{.State.Running}}' "$NAME")" = false
timeout 15s docker rm "$NAME" >/dev/null
if docker inspect "$NAME" >/dev/null 2>&1; then
  echo "Terminated container still exists" >&2
  exit 32
fi
# A newly created container gets a clean private /output, with no persisted PDF.
timeout 40s docker run --rm --pull=never "${COMMON[@]}" "$IMAGE" /bin/sh -c '
  test ! -e /output/partial.pdf
  test ! -e /output/ready
  test -z "$(find /output -mindepth 1 -maxdepth 1 -print -quit)"
  printf recovered > /output/recovery.txt
  test "$(cat /output/recovery.txt)" = recovered
  rm /output/recovery.txt
  test -z "$(find /output -mindepth 1 -maxdepth 1 -print -quit)"
' >/dev/null
printf 'P1K_CONTAINER_CRASH_RECOVERY_PASS partial=1 forced_stop=1 removed=1 new_output_empty=1 recovery=ok\n' \
  > "$ALSQAYA_PREVIEW_DIR/p1k-container-crash-recovery-proof.txt"
grep -Fxq 'P1K_CONTAINER_CRASH_RECOVERY_PASS partial=1 forced_stop=1 removed=1 new_output_empty=1 recovery=ok' \
  "$ALSQAYA_PREVIEW_DIR/p1k-container-crash-recovery-proof.txt"
echo 'P1k synthetic container crash and recovery proof completed.'
