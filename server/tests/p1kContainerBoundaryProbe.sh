#!/usr/bin/env bash
# Phase 23/P1k: independent CI-only Linux container boundary probe.
# Uses synthetic contents. DOES NOT launch Chromium or certify production.
set -euo pipefail
if ! command -v docker >/dev/null 2>&1; then
  echo "P1k FAIL: Docker is required for the container boundary probe" >&2
  exit 1
fi
docker info >/dev/null
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/input" "$work/output" "$work/sensitive"
printf 'SYNTHETIC_P1K_INPUT\n' > "$work/input/report.txt"
printf 'DO_NOT_EXPOSE_P1K_HOST_SECRET\n' > "$work/sensitive/host-secret.txt"
chmod 755 "$work/input" "$work/sensitive"
chmod 444 "$work/input/report.txt"
chmod 777 "$work/output"

# Docker image tag is only for CI exploration. Production needs a pinned,
# vetted digest, reviewed browser image and container deployment controls.
# No host network, no privileged/root user, no host directory except the
# allowlisted input/output mounts, read-only root, bounded resources.
timeout 100s docker run --rm --pull=missing \
  --network none \
  --read-only \
  --user 10001:10001 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 64 \
  --memory 256m \
  --cpus 1 \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=16m \
  --mount "type=bind,src=$work/input,dst=/input,readonly" \
  --mount "type=bind,src=$work/output,dst=/output" \
  ubuntu:24.04 \
  /bin/bash -euc '
    [[ "$(id -u)" == "10001" ]] || exit 11
    [[ "$(cat /input/report.txt)" == "SYNTHETIC_P1K_INPUT" ]] || exit 12
    [[ ! -e /host-secret.txt ]] || exit 13
    [[ ! -e /sensitive/host-secret.txt ]] || exit 14
    # Explicitly prove mounted input cannot be written by the unprivileged user.
    if printf changed >/input/report.txt 2>/dev/null; then exit 15; fi
    # Explicitly prove root filesystem cannot be written to.
    if printf changed >/etc/p1k-forbidden-write 2>/dev/null; then exit 16; fi
    # Deny attempted public, representative LAN and host-loopback TCP access.
    for target in 1.1.1.1 192.168.20.1 127.0.0.1; do
      if timeout 3 bash -c "echo unexpected > /dev/tcp/$target/80" 2>/dev/null; then
        echo "Unexpected network access to $target" >&2
        exit 17
      fi
    done
    printf "P1K_CONTAINER_PASS\n" >/output/proof.txt
  '
[[ "$(cat "$work/output/proof.txt")" == "P1K_CONTAINER_PASS" ]] || {
  echo 'P1k FAIL: container probe did not produce proof' >&2
  exit 1
}
[[ "$(cat "$work/sensitive/host-secret.txt")" == "DO_NOT_EXPOSE_P1K_HOST_SECRET" ]] || {
  echo 'P1k FAIL: host sentinel was modified' >&2
  exit 1
}
echo 'P1k CI-only container egress, mounts, non-root and read-only boundary probe passed.'
