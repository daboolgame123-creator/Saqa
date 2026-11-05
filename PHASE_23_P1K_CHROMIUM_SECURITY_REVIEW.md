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
