# Phase 23 / P1k — Chromium Container Security Review (engineering assessment)

Date: 2026-11-05  
Branch: `development/phase-23-wip-20261105`  
Status: **NOT APPROVED for production**. This is a code/configuration security assessment and regression plan, not a commissioned independent penetration test.

## Reviewed scope

- `server/tests/p1kContainerChromiumPrint.sh`: synthetic fixture generation in container
- `server/tests/p1kContainerBoundaryProbe.sh`: separate test-only container isolation exercise
- `server/src/api/services/reportChromiumInternal.ts`: prototype in-process renderer and browser launch
- `.github/workflows/phase23-p1c.yml`: isolated verification

No access to real institution data, network endpoints or the institution server was attempted.

## Findings

| ID | Priority | Finding | Evidence and disposition |
|---|---|---|---|
| SEC-01 | High / release blocker | Chromium CI invocation uses `--no-sandbox` inside Docker. Container isolation is not equivalent to an independently assessed browser sandbox. | Current synthetic script. **Open for production**; do not copy this runtime verbatim. |
| SEC-02 | High / release blocker | Browser image is selected by a mutable tag `mcr.microsoft.com/playwright:v1.56.1-noble`; no reviewed immutable production digest or vulnerability/update policy. | Current script. New CI attestation records the exact pulled image ID, **not** a production pin. **Open**. |
| SEC-03 | High / release blocker | Internal `renderInternalChromiumPreview` launches a local browser directly; it is **not** wired to the restrictive Docker runner. | Service code. **Open**; never expose or connect to HTTP until an approved isolated executor exists. |
| SEC-04 | Medium | The PDF/output is written into a writable mount; a 12 MiB application read cap does not bound Chromium disk writes during rendering. | Prototype and test scripts. **Open**: enforce per-job output quota/size limits and total host resource policy. |
| SEC-05 | Medium | Existing tests checked intended Docker flags but did not assert effective runtime security state. | Added kernel checks for `NoNewPrivs=1`, seccomp filter mode `Seccomp=2`, zero effective capabilities and captured the image ID. **Pending run validation at document creation**. |
| SEC-06 | Medium | Negative network probes cover a small set of IPs and a TCP port; full outbound blocking, loopback, all protocols and host namespace behavior require deployment testing. | `--network none` and representative probes only. **Open**, do not claim comprehensive penetration coverage. |
| SEC-07 | Medium | Chromium and its dependencies have not been tested and approved on the actual institution deployment host, and font licensing remains undecided. | CI-only Ubuntu runner. **Open**. |
| SEC-08 | Medium | CI-only no-sandbox option in `reportChromiumInternal.ts` relies on CI environment, not hardened runtime authorization. | Code inspection. **Open**. |
| SEC-09 | Low / design review | PDF visual and numbering checks cover synthetic fixtures; 250-row edge cases and all-page visual inspection remain incomplete. | CI PDF comparison. **Open**. |

## Security properties actually tested

- Docker no-network mode and representative denied network connections.
- An unprivileged container user, read-only root/input, denied sensitive host-file path, and explicit output mount.
- Bounded CPU/memory/PIDs/tmpfs in the *test invocation*; load/shedding under stress has not been validated.
- Parent/descendant termination when a launcher times out in the prototype.
- Both synthetic Arabic PDFs generated, their row identifiers verified with text extraction; 85 detail and 38 acknowledgement IDs exactly once.

## Required closure before an actual rollout

1. Select the deployment host/OS; design and independently assess a hardened Chromium sandbox/container with no need for `--no-sandbox` if practical, or explicitly document and accept the defense-in-depth trade-off. Require non-root runtime, reviewed seccomp/AppArmor policy, default-deny egress and no host-sensitive mounts.
2. Pin the reviewed browser/image digest and define a vulnerability scanning and controlled update plan; capture runtime image identity and verifiable deployment evidence.
3. Make the production export service call **only** the isolated executor, ensuring trusted service-side authorization, timeouts, job cleanup, quotas and no untrusted browser flags.
4. Test disk, CPU, memory and process limits under adverse synthetic workloads; verify that failures do not leave residual files or processes.
5. Test realistic Arabic edge cases and page continuity, choose licensed font, obtain institutional visual approval.
6. Preserve the `HTTP 503 REPORTS_UNAVAILABLE` guard, `ReportScopeNotReadyError`, authorization/scoping, and archivist restriction until Phase 23 security sign-off.

**Disposition:** P1k continues; no production approval, no change to `main`, no changes to live report routes.

## Verified kernel-level CI attestation

[GitHub Actions run 42104292057](https://github.com/daboolgame123-creator/Saqa/actions/runs/42104292057) at source commit `69c3c81d` completed **SUCCESS**, including all existing report and HTTP protection tests and the new container checks.

Downloaded [artifact 13449794755](https://github.com/daboolgame123-creator/Saqa/actions/runs/42104292057/artifacts/13449794755) and examined the generated proof files directly. `p1k-container-kernel-security-proof.txt` contains:

```text
CONTAINER_CHROMIUM_OK
Uid: 1000 1000 1000 1000
CapEff: 0000000000000000
NoNewPrivs: 1
Seccomp: 2
```

`p1k-container-browser-image-id.txt` identifies the CI-resolved Docker image as `sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a`. This is an **observed local image identity**, not an approved, reviewed, digest-pinned production deployment and not a substitute for a security advisory check. The separate tag file says `mcr.microsoft.com/playwright:v1.56.1-noble`.

**Resolved for CI evidence:** effective `NoNewPrivs`, seccomp filter state, zero effective capabilities and the browser image identity are now asserted/recorded. **Still open:** browser sandbox exception, immutable release pin/upgrade policy, direct renderer isolation, production host security acceptance and all other SEC findings above. HTTP reports remain disabled.

## Native Chromium sandbox experiment — 2026-11-05

**Code:** `server/tests/p1kContainerChromiumPrint.sh` commit `b2f1acf5` added a separate synthetic print attempt **without `--no-sandbox`**, while retaining the previously verified baseline print path. It also records the pulled image's `RepoDigest` in the archived artifact, rather than relying solely on its mutable tag or local image ID.

**Execution evidence:** [GitHub Actions run 42104990917](https://github.com/daboolgame123-creator/Saqa/actions/runs/42104990917) completed **SUCCESS** with existing tests and baseline containerized PDF printing still green. The new sandbox experiment is an explicitly **observational, non-gating probe**: its failure must not be described as success merely because the overall workflow passes.

The downloaded [artifact 13452540395](https://github.com/daboolgame123-creator/Saqa/actions/runs/42104990917/artifacts/13452540395) records the exact probe result `NATIVE_SANDBOX_PROBE_FAIL exit=133`. The pulled container image reports `mcr.microsoft.com/playwright@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a` as its `RepoDigest` in this CI environment. This is a recorded source identity **for the test run**, not a reviewed or approved production image pin. The browser failure's precise OS/kernel/root cause has **not** yet been diagnosed; do not assert a specific cause from exit code 133 alone.

**Disposition:** SEC-01 remains a **release blocker**. The current test image/configuration cannot yet demonstrate a functional native Chromium sandbox. Do not remove Docker isolation, turn off security features to force a pass, or connect an unreviewed executable to HTTP. Decide on a reviewed runtime that permits a safe Chromium sandbox and repeat the actual browser print and security checks under that configuration. SEC-02 remains open for vulnerability review and production image approval despite captured RepoDigest.

**Additional control:** commit `39ce3fbb` makes future CI require an explicitly classified `PASS` or `FAIL` probe result before the output is archived; that specific follow-up commit requires independent CI verification.

**Protection status:** All reporting HTTP endpoints remain behind 503; no changes were made to user permissions, `main`, or the production PDF renderer.

## Diagnosis update — browser native sandbox, 2026-11-05

**Verified run:** [GitHub Actions 42107766045](https://github.com/daboolgame123-creator/Saqa/actions/runs/42107766045) was successful after correcting a diagnostic shell quoting regression (`566cfb9e`). The prior diagnostic workflow [42107435915](https://github.com/daboolgame123-creator/Saqa/actions/runs/42107435915) failed because its diagnostic grep pattern was improperly quoted within a single-quoted nested shell, **not** because the ordinary PDF path was permanently broken. The shell fault was corrected and independently re-run.

Downloaded artifact `13451948649` and directly read `p1k-container-native-sandbox-diagnostics.txt`. It contains the browser's actual message:

```text
FATAL:content/browser/zygote_host/zygote_host_impl_linux.cc:128
No usable sandbox!
```

The browser test executable was `headless_shell`, Chromium version `141.0.7390.37`. The user namespace sysctls visible inside the container were `unprivileged_userns_clone=1` and `user/max_user_namespaces=58121`, but these values alone **do not prove** that the container process can actually create the required namespace.

**Evidence-based conclusion:** Chromium is unable to initialize a usable browser sandbox under the **current** Docker/host policy; this is the direct reason it aborts with 133. The evidence does **not** distinguish Docker seccomp restrictions from Ubuntu AppArmor unprivileged-user-namespace restrictions or other host policy. Microsoft Playwright's official Docker guidance recommends an unprivileged user with a reviewed seccomp profile permitting the user-namespace operations needed for Chromium sandboxing (https://playwright.dev/docs/docker). Chromium's upstream documentation describes AppArmor restrictions on Ubuntu 23.10+ (https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). These references inform a future **controlled host-policy assessment**; do not weaken or globally disable host security settings just to turn this CI probe green.

**Required next checks:** review effective host AppArmor restrictions and the Docker seccomp policy with the server administrator; explicitly test whether namespace creation is permitted for the browser's unprivileged user in the intended hardened runtime; select and review a minimal browser-compatible seccomp/AppArmor policy; then re-run Chromium without `--no-sandbox` in a dedicated isolated test environment. Maintain default-deny egress, read-only input/root, non-root identity and existing resource ceilings. No production approval until that test succeeds and the full operational security review is complete.

## Confirmed P1k CI diagnosis (2026-11-05)

A synthetic diagnostics regression initially failed due to a script quoting error in run 42107435915. Fix commit `566cfb9e` and [Actions 42107766045](https://github.com/daboolgame123-creator/Saqa/actions/runs/42107766045) succeeded.

The downloaded artifact `13451948649` confirmed `FATAL: No usable sandbox!` from Chromium `headless_shell` version `141.0.7390.37`. Its native sandbox probe still fails with exit 133. Kernel namespace configuration values alone are insufficient proof of process permission.

Commit `0afc5eb8` adds an explicit GitHub warning when the native sandbox remains unavailable. [Actions 42108364875](https://github.com/daboolgame123-creator/Saqa/actions/runs/42108364875) completed SUCCESS, including the synthetic renderer and existing protections. The green CI result **does not approve the native browser sandbox or production PDF exporting**.

**Disposition:** P1k remains OPEN. Review the actual deployment host policy with its administrator before changing runtime isolation. No HTTP reports, role permissions, or main-branch changes were made.

## Confirmed user-namespace denial in CI (2026-11-05)

[GitHub Actions run 42114234574](https://github.com/daboolgame123-creator/Saqa/actions/runs/42114234574), source `b0d31ccd`, completed successfully. This represents normal synthetic verification passing, **not** a passed native Chromium sandbox.

From the downloaded [artifact 13454284292](https://github.com/daboolgame123-creator/Saqa/actions/runs/42114234574/artifacts/13454284292):

```text
USER_NAMESPACE_DENIED exit=1
NATIVE_SANDBOX_PROBE_FAIL exit=133
```

The Chromium stderr includes `No usable sandbox!`, and the kernel context reports `docker-default (enforce)` and `APPARMOR_USERNS_POLICY=1`. These observations demonstrate that the CI container's unprivileged user cannot create the tested user namespace. They **do not isolate** which component of the effective policy is the specific blocker, and are **not evidence for the future deployment host**.

SEC-01 stays a critical release blocker. No security policy was relaxed. Only a controlled host-administrator-reviewed candidate profile, tested with an actual sandboxed browser inside the same restrictive network/filesystem boundary, may qualify for S2 acceptance. Export endpoints remain HTTP 503.

## S2 alternate Chromium binary under unchanged containment — 2026-11-05

The experimental CI container was kept non-root and network-disconnected with unchanged seccomp/AppArmor settings, zero effective capabilities and read-only inputs. Commit `684209a7` added a time-limited alternate `chrome` executable probe without the `--no-sandbox` override; baseline `headless_shell` behavior remained unchanged.

[Actions run 42115262987](https://github.com/daboolgame123-creator/Saqa/actions/runs/42115262987) completed successfully, but this confirms **baseline CI** only. Its [artifact 13456460572](https://github.com/daboolgame123-creator/Saqa/actions/runs/42115262987/artifacts/13456460572), inspected directly, shows: `ALTERNATE_BROWSER_SANDBOX_FAIL exit=134`, `NATIVE_SANDBOX_PROBE_FAIL exit=133`, `USER_NAMESPACE_DENIED exit=1`. The alternate browser also reported `FATAL: No usable sandbox!`.

**Security judgment:** this candidate is rejected for production. No evidence yet supports any production-safe Chromium native-sandbox configuration on the intended host. The next test must be conducted under a narrowly scoped and independently reviewed container/host policy on a dedicated test environment; the policy must retain strict no-network, non-root, capabilities, filesystem and resource constraints. Do not enable reports or copy the CI-only `--no-sandbox` configuration into production.

## S5 write-time file-size boundary (verified CI checkpoint)

The synthetic Chromium Docker proof now applies and verifies `RLIMIT_FSIZE=12582912` bytes using Docker's `--ulimit fsize`. [Actions run 42119685246](https://github.com/daboolgame123-creator/Saqa/actions/runs/42119685246) (source `35980c40`) succeeded. [Artifact 13458425259](https://github.com/daboolgame123-creator/Saqa/actions/runs/42119685246/artifacts/13458425259), inspected directly, records an attempted 13 MiB write being stopped at 12 MiB (exit 153), while existing PDF continuity and HTTP 503 tests also passed.

This is an effective **per-file** limit, not a quota on all output files, Chrome's cumulative temporary data or bind-mounted host disk usage. A malicious or defective process could still create many individually permitted files. S5 remains incomplete until a reviewed **per-job total writable storage quota** and failure cleanup are proven. SEC-04 remains an open release blocker. Chromium native sandbox still fails; no production activation is authorized.

## S5 aggregate output-quota test (CI-only candidate)

[GitHub Actions 42121549899](https://github.com/daboolgame123-creator/Saqa/actions/runs/42121549899) passed the independent synthetic quota probe `server/tests/p1kContainerTotalQuotaProbe.sh`, with the container's `/output` mounted as a bounded 32 MiB `tmpfs`. [Artifact 13459760566](https://github.com/daboolgame123-creator/Saqa/actions/runs/42121549899/artifacts/13459760566) contains `P1K_TOTAL_QUOTA_PASS total_bytes=33554432 attempted_bytes=41943040 rejected=1 recovery=ok`. The test shows **four 10 MiB files cannot all fit** while three can; it then cleans the quota mount and successfully writes again.

This test is **not** proof of production PDF disk isolation: the actual Chromium printing fixture still exports through a host bind mount. SEC-04 remains **partially mitigated in the synthetic test only**, pending adoption of aggregate-capped mounts in the reviewed rendering executor and complete cleanup/stress testing. The Chromium native sandbox blocker SEC-01 also remains open. Do not enable report HTTP routes.

## Actual synthetic Chromium print on aggregate-capped tmpfs (2026-11-06)

Commit `adc1d896` moves the actual synthetic Chromium PDF output directory to a verified 32 MiB `tmpfs` and continues enforcing the 12 MiB per-file limit. A separate CI evidence bind receives only a named allowlist after printing. [Actions 42126472915](https://github.com/daboolgame123-creator/Saqa/actions/runs/42126472915) completed SUCCESS; inspected [artifact 13461502151](https://github.com/daboolgame123-creator/Saqa/actions/runs/42126472915/artifacts/13461502151) confirms `P1K_CHROMIUM_AGGREGATE_OUTPUT_PASS bytes=33554432 mount=tmpfs exported=11`, 85 synthetic detail records, and 38 synthetic acknowledgements.

**Residual security issue:** `/evidence` is a writable host bind mount visible inside the same container during rendering, so the filename allowlist at export time is **not a security boundary against a compromised browser process**. Production requires a separate broker-controlled artifact handoff, no browser-visible writable host evidence mount, and quotas on all writable mounts. Native Chromium sandbox remains `NATIVE_SANDBOX_PROBE_FAIL exit=133`; this test is **not production authorization**. Continue to keep report HTTP routes at 503.

## S5 synthetic host bind removal and guarded evidence transfer — 2026-11-06

A follow-up to the previously identified writable host bind risk has been implemented **only in the CI fixture**. Commit `020b6e27` removes the `/evidence` bind from the browser container. Synthetic Chromium output remains under a 32 MiB aggregate `tmpfs`; after successful printing it is transferred as a bounded tar stream, with no browser-visible writable host output path. The host-side Python broker checks an exact 12-member allowlist, duplicates, type, per-file/total size, PDF markers and exclusive no-follow creation.

[GitHub Actions 42131207563](https://github.com/daboolgame123-creator/Saqa/actions/runs/42131207563) completed SUCCESS and included 5 negative/positive evidence-broker tests (unexpected entry/path, symlink, duplicate member, symlink destination, valid archive). Inspected [artifact 13464205423](https://github.com/daboolgame123-creator/Saqa/actions/runs/42131207563/artifacts/13464205423), confirming the bounded output proof and continued native Chromium sandbox failure `exit=133`.

**Disposition:** the **specific browser-visible writable host evidence bind finding is mitigated for the synthetic CI fixture**. This does not establish a complete security boundary for production. Remaining work includes actual approved browser sandbox, tested production handoff design, aggregate `/tmp` limits, fail-closed crash/cleanup, full PDF validation, host review and authorized endpoint release. Report routes must remain HTTP 503.
