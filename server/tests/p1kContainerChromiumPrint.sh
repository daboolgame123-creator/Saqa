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

# CI fixture is pinned to the exact observed image digest from verified run
# 42104990917. This is reproducibility only: NOT a vetted production image.
IMAGE='mcr.microsoft.com/playwright@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a'
IMAGE_LABEL='mcr.microsoft.com/playwright:v1.56.1-noble (historical test label)'
docker pull "$IMAGE" >/dev/null
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$IMAGE")
test -n "$IMAGE_ID"
printf '%s\n' "$IMAGE_ID" > "$ALSQAYA_PREVIEW_DIR/p1k-container-browser-image-id.txt"
REPO_DIGEST=$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE")
test "$REPO_DIGEST" = "$IMAGE" || {
  echo "Resolved browser digest does not match approved CI fixture" >&2
  exit 1
}
printf '%s\n' "$REPO_DIGEST" > "$ALSQAYA_PREVIEW_DIR/p1k-container-browser-repo-digest.txt"
printf '%s\n' "$IMAGE_LABEL" > "$ALSQAYA_PREVIEW_DIR/p1k-container-browser-image-tag.txt"
timeout 240s docker run --rm --pull=never \
  --network none --read-only --user 1000:1000 \
  --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 128 --memory 1g --cpus 1 \
  --ulimit nofile=1024:1024 --ulimit core=0:0 \
  --shm-size 128m \
  --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 \
  --mount "type=bind,src=$work/input,dst=/input,readonly" \
  --mount "type=bind,src=$work/output,dst=/output" \
  "$IMAGE" /bin/bash -euc '
    test "$(id -u)" = "1000"
    # Assert actual kernel security state, not just intended docker flags.
    grep -Eq "^NoNewPrivs:[[:space:]]+1$" /proc/self/status
    grep -Eq "^Seccomp:[[:space:]]+2$" /proc/self/status
    grep -Eq "^CapEff:[[:space:]]+0+$" /proc/self/status
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
    # Synthetic-only diagnostic: record binary identity and kernel namespace
    # settings without exporting arbitrary stderr from institutional documents.
    {
      printf "BROWSER_EXECUTABLE=%s\n" "$(basename "$chrome")"
      "$chrome" --version 2>/dev/null | head -n 1 || true
      printf "KERNEL_UNPRIVILEGED_USERNS_CLONE="
      if [ -r /proc/sys/kernel/unprivileged_userns_clone ]; then cat /proc/sys/kernel/unprivileged_userns_clone; else echo unavailable; fi
      printf "USER_MAX_USER_NAMESPACES="
      if [ -r /proc/sys/user/max_user_namespaces ]; then cat /proc/sys/user/max_user_namespaces; else echo unavailable; fi
    } > /output/native-sandbox-environment.txt
    # Read-only namespace diagnostics. These are observational evidence;
    # sysctl availability does not prove unprivileged namespace creation.
    {
      printf "UID_MAP="
      head -n 1 /proc/self/uid_map
      printf "GID_MAP="
      head -n 1 /proc/self/gid_map
      printf "CURRENT_SECURITY_PROFILE="
      if [ -r /proc/self/attr/current ]; then head -n 1 /proc/self/attr/current; else echo unavailable; fi
      printf "APPARMOR_USERNS_POLICY="
      if [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]; then
        cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns
      else
        echo unavailable
      fi
    } > /output/native-sandbox-namespace-context.txt
    # Controlled capability probe; records denial without changing host settings.
    if command -v unshare >/dev/null 2>&1; then
      set +e
      timeout 5s unshare --user --map-root-user /bin/true >/tmp/userns-stdout 2>/tmp/userns-stderr
      namespace_exit=$?
      set -e
      if [ "$namespace_exit" -eq 0 ]; then
        printf "USER_NAMESPACE_ALLOWED\n" > /output/userns-capability.txt
      else
        printf "USER_NAMESPACE_DENIED exit=%s\n" "$namespace_exit" > /output/userns-capability.txt
      fi
    else
      printf "USER_NAMESPACE_UNAVAILABLE\n" > /output/userns-capability.txt
    fi
    export HOME=/tmp
    # One independent probe WITHOUT --no-sandbox. Save the outcome explicitly:
    # a failed probe must not be mistaken for a passed sandbox review.
    set +e
    timeout 25s "$chrome" --headless --disable-gpu --disable-dev-shm-usage \
      --disable-background-networking --disable-extensions --no-first-run \
      --no-pdf-header-footer --user-data-dir=/tmp/sandbox-test-profile \
      --print-to-pdf=/output/sandbox-test.pdf file:///input/details.html \
      >/tmp/sandbox-stdout 2>/tmp/sandbox-stderr
    sandbox_status=$?
    set -e
    # Only synthetic fixture paths appear in this diagnostic experiment.
    # Select Chromium sandbox errors and truncate to avoid unbounded log capture.
    grep -Ei "sandbox|namespace|operation not permitted|permission denied|seccomp|zygote|crashpad|fatal|error" /tmp/sandbox-stderr |
      head -n 15 | cut -c 1-240 > /output/native-sandbox-diagnostics.txt || true
    if [ "$sandbox_status" -eq 0 ] && [ -s /output/sandbox-test.pdf ]; then
      printf "NATIVE_SANDBOX_PROBE_PASS\n" > /output/native-sandbox-status.txt
    else
      printf "NATIVE_SANDBOX_PROBE_FAIL exit=%s\n" "$sandbox_status" > /output/native-sandbox-status.txt
    fi
    # S2 non-invasive comparison: attempt the full chrome executable, if
    # present, with the very same container restrictions and native sandbox.
    alternate=$(find /ms-playwright -type f -name chrome -print -quit)
    if [ -n "$alternate" ] && [ -x "$alternate" ] && [ "$alternate" != "$chrome" ]; then
      set +e
      timeout 25s "$alternate" --headless --disable-gpu --disable-dev-shm-usage \
        --disable-background-networking --disable-extensions --no-first-run \
        --no-pdf-header-footer --user-data-dir=/tmp/native-alternate-profile \
        --print-to-pdf=/output/alternate-sandbox.pdf file:///input/details.html \
        >/tmp/alternate-stdout 2>/tmp/alternate-stderr
      alternate_status=$?
      set -e
      if [ "$alternate_status" -eq 0 ] && [ -s /output/alternate-sandbox.pdf ]; then
        printf "ALTERNATE_BROWSER_SANDBOX_PASS\n" > /output/alternate-native-sandbox-status.txt
      else
        printf "ALTERNATE_BROWSER_SANDBOX_FAIL exit=%s\n" "$alternate_status" > /output/alternate-native-sandbox-status.txt
      fi
      grep -Ei "sandbox|namespace|operation not permitted|permission denied|seccomp|zygote|fatal|error" /tmp/alternate-stderr |
        head -n 12 | cut -c 1-240 > /output/alternate-native-sandbox-diagnostics.txt || true
    else
      printf "ALTERNATE_BROWSER_SANDBOX_UNAVAILABLE\n" > /output/alternate-native-sandbox-status.txt
      : > /output/alternate-native-sandbox-diagnostics.txt
    fi
    # Preserve only the test outcome; never publish process logs from a future
    # real-data environment, as browser stderr may include sensitive paths.
    for kind in details ack; do
      timeout 75s "$chrome" --headless --no-sandbox --disable-gpu \
        --disable-dev-shm-usage --disable-background-networking \
        --disable-extensions --no-first-run --no-pdf-header-footer \
        --user-data-dir="/tmp/chrome-$kind" \
        --print-to-pdf="/output/$kind.pdf" "file:///input/$kind.html"
      test -s "/output/$kind.pdf"
    done
    { printf "CONTAINER_CHROMIUM_OK\n"; grep -E "^(NoNewPrivs|Seccomp|CapEff|Uid):" /proc/self/status; } >/output/proof.txt
  '
grep -Fxq "CONTAINER_CHROMIUM_OK" "$work/output/proof.txt"
cp "$work/output/proof.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-kernel-security-proof.txt"
cp "$work/output/native-sandbox-status.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-probe.txt"
cp "$work/output/native-sandbox-environment.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-environment.txt"
cp "$work/output/native-sandbox-diagnostics.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-diagnostics.txt"
cp "$work/output/native-sandbox-namespace-context.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-namespace-context.txt"
cp "$work/output/userns-capability.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-userns-capability.txt"
cp "$work/output/alternate-native-sandbox-status.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-alternate-native-sandbox-status.txt"
cp "$work/output/alternate-native-sandbox-diagnostics.txt" "$ALSQAYA_PREVIEW_DIR/p1k-container-alternate-native-sandbox-diagnostics.txt"
grep -Eq "^ALTERNATE_BROWSER_SANDBOX_(PASS|UNAVAILABLE|FAIL( exit=[0-9]+)?)$" "$ALSQAYA_PREVIEW_DIR/p1k-container-alternate-native-sandbox-status.txt"
# The probe may fail without aborting the synthetic print baseline, but the
# result must always be explicitly classified in its archived evidence.
grep -Eq "^NATIVE_SANDBOX_PROBE_(PASS|FAIL)( exit=[0-9]+)?$" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-probe.txt"
cat "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-probe.txt"
if grep -q "^NATIVE_SANDBOX_PROBE_FAIL" "$ALSQAYA_PREVIEW_DIR/p1k-container-native-sandbox-probe.txt"; then
  echo "::warning title=Phase 23 P1k native browser sandbox not approved::Chromium native sandbox probe failed. Synthetic PDF baseline passed but production PDF printing remains blocked."
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' 'P1k: native Chromium sandbox probe FAILED. Production printing is NOT APPROVED; check PHASE_23_P1K_CHROMIUM_SECURITY_REVIEW.md.' >> "$GITHUB_STEP_SUMMARY"
  fi
fi
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
