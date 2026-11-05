# ALSQAYA — Phase 23/P1k Browser Sandbox Closure Plan

Date: 2026-11-06  
Status: **ACTIVE / NOT PRODUCTION-APPROVED**  
Branch: `development/phase-23-wip-20261105`  
Owner of approval: institutional system administrator + independent security reviewer. This plan is a living document, updated after each verified checkpoint.

## Objective and constraints

Produce accessible, accurate Arabic PDF reports with a browser-based renderer in a demonstrably isolated execution environment. **This objective does not authorize deployment or HTTP exposure.** Keep all report HTTP routes returning `503 REPORTS_UNAVAILABLE`, retain the current permissions/scoping and fail-closed behavior, and do not change `main`.

Current evidence: Chromium inside a restricted CI container prints 85 detail records and 38 acknowledgements correctly by record-number continuity, using the test-only `--no-sandbox` exception. Native sandbox initialization without that exception fails (`No usable sandbox!`, exit 133). The precise contributing Linux namespace / Docker seccomp / host AppArmor restriction is not yet established.

## Checkpoints and acceptance evidence

| Step | Task | Acceptance criteria | Progress |
|---|---|---|---|
| P1k-S1 | Diagnose namespace/sandbox permissions without changing host policy | Reproducible synthetic CI logs distinguish the Chromium error and effective runtime/userns capability; record kernel and container restrictions; no sensitive data | **CI COMPLETE; target-host review pending** |
| P1k-S2 | Compare candidate sandbox configurations in a dedicated test environment | Native Chromium sandbox runs without `--no-sandbox` **and** preserves non-root, default-deny network, approved mounts, read-only root and adequate seccomp/AppArmor constraints. No globally weakened host controls | NOT STARTED |
| P1k-S3 | Pin browser image and evaluate updates | Reviewed immutable image digest and browser version documented; vulnerability/dependency assessment, font provenance and routine patch/retest plan approved | NOT STARTED |
| P1k-S4 | Design isolated renderer executor | Export service can only request a bounded render job; trusted server-side authorization; no caller-controlled browser path or flags; one-job quotas, deterministic cleanup, checked output; no application host filesystem exposure | NOT STARTED |
| P1k-S5 | Stress and failure-injection tests | Resource pressure tests (memory, CPU, PIDs, disk), browser crash/timeout, broken output, concurrent requests, input manipulation, and denial of filesystem/network attempts; recovery leaves no residual process/file | **PARTIAL — PDF output corruption/symlink checks passed; generation-time quotas pending** |
| P1k-S6 | Arabic correctness and visual approval | All pages reviewed with licensed fonts; long mixed-direction fields, Arabic numerals, dates, page breaks, summaries and ViewLog fields; no missing or duplicate records at max permitted size | PARTIAL |
| P1k-S7 | Independent review and deployment approval | Independent security findings closed or explicitly accepted by accountable administrator; real target-host deployment evidence, signed review, rollback instructions | NOT STARTED |
| P1k-S8 | Controlled Phase 23 release decision | Separately audited access checks and 503 release procedure; only after S1-S7 passed, with explicit user approval and rollback plan | BLOCKED |

## Immediate next implementation (S1)

1. Run only **synthetic** introspection inside the existing restricted CI container. Capture bounded, curated evidence of whether a non-root process can create a user namespace; preserve the result as a `PASS`, `FAIL`, or `UNAVAILABLE` diagnostic, never silently skip it.
2. Keep Docker flags, root mounts, network mode and current successful PDF baseline unchanged. Do **not** use `--privileged`, `--security-opt seccomp=unconfined`, `--cap-add`, globally disable AppArmor, or introduce a host policy change to turn a probe green.
3. If namespace creation is refused, document the refusal and request a narrowly scoped reviewed configuration proposal from the host administrator. Do not infer the particular policy from a single error.
4. Add the proof to CI artifacts, update `PHASE_23_P1K_CHROMIUM_SECURITY_REVIEW.md` with the exact outcome, and commit at a new checkpoint only after the required CI steps pass.

## Security decisions required from the institution

- Confirm deployment server OS, container runtime, kernel and network controls; institutional server hardware and actual environment are not yet verified.
- Decide whether a browser runtime is acceptable. If full isolation cannot be delivered without unacceptable operational complexity, evaluate a non-browser PDF alternative rather than lowering required protections.
- Select supported Arabic fonts with documented license and update procedure.
- Require explicit approval before enabling HTTP reports or using real personnel data in browser tests.

## Separate deferred Phase 22 OCR

OCR reads scans/images/PDF pages **into searchable text**; Chromium P1k prints approved data **to PDF**. OCR is deferred, must have separate design/security tests, and may reuse Arabic-text normalization, confidentiality policy and synthetic QA fixtures. Do not claim OCR is implemented by this phase.

## Evidence

- [Native-sandbox diagnosis](PHASE_23_P1K_CHROMIUM_SECURITY_REVIEW.md).
- [Visual PDF review](PHASE_23_P1K_PDF_VISUAL_REVIEW.md).
- [CI 42108364875](https://github.com/daboolgame123-creator/Saqa/actions/runs/42108364875) — synthetic baseline checks passed, native Chromium sandbox was still unavailable.

## S1 evidence checkpoint — 2026-11-05

**Commit:** `159992a2` added read-only namespace and AppArmor diagnostics to the existing synthetic Chromium Docker test. [CI run 42109484656](https://github.com/daboolgame123-creator/Saqa/actions/runs/42109484656) completed **SUCCESS**, with no failed steps.

Retrieved and inspected [artifact 13453149320](https://github.com/daboolgame123-creator/Saqa/actions/runs/42109484656/artifacts/13453149320). The `p1k-container-native-sandbox-namespace-context.txt` proof reads:

```text
UID_MAP=         0          0 4294967295
GID_MAP=         0          0 4294967295
CURRENT_SECURITY_PROFILE=docker-default (enforce)
APPARMOR_USERNS_POLICY=1
```

The same artifact still records `NATIVE_SANDBOX_PROBE_FAIL exit=133`. This **narrows** the investigation to effective host/container policy, but **does not establish** whether AppArmor, Docker seccomp, or their interaction is responsible. The displayed UID/GID mappings are contextual; they do not prove an unprivileged process can create a new user namespace. S1 is **PARTIALLY COMPLETE**, not closed.

**Next action:** obtain a host-administrator-approved, synthetic-only capability test for actual user namespace creation under the same effective security policy. Record a clear permitted/denied outcome, then evaluate a specifically reviewed browser sandbox profile in a dedicated test host. Never disable global protections or enable HTTP reports to force a green result.

## S3 reproducible test-image checkpoint — 2026-11-06

- Commit `847b9f06` changed only the **synthetic CI fixture** for `server/tests/p1kContainerChromiumPrint.sh` to pull the previously recorded immutable container image reference `mcr.microsoft.com/playwright@sha256:f1e7e01021efd65dd1a2c56064be399f3e4de00fd021ac561325f2bfbb2b837a`. The test fails closed if Docker resolves a different RepoDigest. The label `v1.56.1-noble` is kept only as explanatory history.
- [GitHub Actions run 42112468637](https://github.com/daboolgame123-creator/Saqa/actions/runs/42112468637) **completed SUCCESS**, with all workflow steps successful: baseline synthetic Arabic PDF generation, container security check, file continuity, PostgreSQL and HTTP 503 security regressions.
- This resolves **test-image reproducibility only**. It does **not** certify the image against known vulnerabilities, approve a deployment image, establish update policy or fix Chromium's native `No usable sandbox!` failure. S3 remains **PARTIAL**, S1 remains **OPEN** pending approved evidence of actual namespace creation.
- The deployment decision remains blocked; no change to live routes, role access, or `main`.

## S1 effective capability result — 2026-11-05

- Commit `b0d31ccd` added a synthetic, bounded `unshare --user --map-root-user /bin/true` check under the existing non-root, no-network, restricted Docker configuration. The result is explicitly classified as allowed/denied/unavailable and archived with the synthetic PDF output.
- [CI 42114234574](https://github.com/daboolgame123-creator/Saqa/actions/runs/42114234574) completed **SUCCESS**; the existing tests, PDF continuity, database checks, and HTTP 503 protections remained green.
- Downloaded and directly read [artifact 13454284292](https://github.com/daboolgame123-creator/Saqa/actions/runs/42114234574/artifacts/13454284292). The relevant proof states `USER_NAMESPACE_DENIED exit=1`. The native Chromium probe still states `NATIVE_SANDBOX_PROBE_FAIL exit=133` with `No usable sandbox!`. Kernel evidence remains `docker-default (enforce)` and `APPARMOR_USERNS_POLICY=1`.
- **Interpretation:** effective unprivileged user-namespace creation is denied in the **GitHub CI test container**, even though the earlier sysctl reports suggested namespace support. The result still does not attribute the denial specifically to AppArmor, seccomp, or their interaction. **S1 CI diagnosis is COMPLETE; target-host S1 validation remains pending** because the institution server has not been examined.

### S2 reviewed-environment decision gate

Do not run arbitrary policy-relaxation experiments on the institution server. The administrator/security reviewer must select a dedicated synthetic-only test host, document kernel, effective AppArmor profile, container seccomp policy, and approve the smallest browser-compatible policy alteration (if justified). The next acceptance requires **both** `USER_NAMESPACE_ALLOWED` and successful Chromium PDF printing without `--no-sandbox`, while preserving non-root, zero effective capabilities, no network, read-only root/input, bounded resources and no sensitive mounts. Any weakening that violates those constraints is a rejection, not a workaround.

**Release state:** P1k open; no production image approval, service integration or changes to report HTTP 503 behavior.

## S2 no-policy-change alternate-binary experiment — 2026-11-05

- Commit `684209a7` added a bounded CI-only test of the alternative Chromium `chrome` executable, in addition to the existing `headless_shell` probe. Both were invoked without `--no-sandbox` **under the same** non-root, default-deny network, zero-capabilities, read-only-root/input and bounded-resource container. No Docker security options or host policy were relaxed.
- [GitHub Actions 42115262987](https://github.com/daboolgame123-creator/Saqa/actions/runs/42115262987) completed **SUCCESS** for the ordinary synthetic print and security regression suite; the native sandbox experiments were correctly recorded as separate diagnostic failures.
- Inspected the exact [artifact 13456460572](https://github.com/daboolgame123-creator/Saqa/actions/runs/42115262987/artifacts/13456460572): `ALTERNATE_BROWSER_SANDBOX_FAIL exit=134` and `NATIVE_SANDBOX_PROBE_FAIL exit=133`. The alternate browser emitted `FATAL ... No usable sandbox!`; `USER_NAMESPACE_DENIED exit=1` remains unchanged.
- **Conclusion:** switching executable binaries is insufficient. The CI runtime still denies the browser's native sandbox prerequisites. The specific policy layer (seccomp, AppArmor or their interaction) is not isolated by this experiment. **S2 remains BLOCKED** until an administrator-approved, separate host/container policy test is available. A green CI workflow in this case means baseline security and synthetic PDF tests pass, **not** that the native sandbox is approved.
- Do not change Docker/host protections simply to obtain a pass; a production decision also requires a digest-vetted image, permission/scoping proof, operational quotas and approved print design. HTTP report routes stay at 503 and `main` is untouched.

## S5 internal PDF output integrity checkpoint — 2026-11-06

**Implementation:** `f585f6f6` changed only the internal experimental PDF renderer. It opens printed output with Linux `O_NOFOLLOW`, rejects non-regular output files, checks on-disk size before allocation, loops until the complete expected byte count is read, rejects size changes during the read and refuses files missing an apparent PDF EOF trailer. These checks reduce risk from truncated outputs, symlink substitution and partial-read behavior; they do **not** constitute complete PDF parsing or operating-system isolation.

**Regression:** `0d32703e` added negative tests for a symlink pointing to a separate synthetic PDF-like file and for a header-valid but EOF-missing output. Initial [run 42116815957](https://github.com/daboolgame123-creator/Saqa/actions/runs/42116815957) failed due to a legacy test still expecting the raw `ENOENT` error, not because these new negative tests failed. `c4289636` updated the legacy assertion to the deliberate fail-closed error. The subsequent [run 42117133717](https://github.com/daboolgame123-creator/Saqa/actions/runs/42117133717) **completed SUCCESS** with no failed steps, including runtime Chromium, CI container printing, record continuity, PostgreSQL and report `HTTP 503` verification.

**Remaining S5 gates:** disk consumption during rendering, maximum output mount usage, full PDF structural validation, adverse parallel loads and OS-level process/CPU/memory limits on the chosen host. **S5 remains PARTIAL**, while S2 native browser sandbox and all production release gates remain blocked.

## S5 container per-file generation ceiling verified — 2026-11-05

- `server/tests/p1kContainerChromiumPrint.sh` now passes Linux `RLIMIT_FSIZE` using `docker run --ulimit fsize=12582912:12582912`. The test asserts the effective limit and performs a **synthetic 13 MiB write attempt** in the same non-root, offline, restricted container, requiring a failed write, no file larger than 12 MiB, and deletion of the probe file before Chromium runs.
- The first [run 42119289205](https://github.com/daboolgame123-creator/Saqa/actions/runs/42119289205) failed on the initial limit assertion. Diagnostic and nested-shell quoting corrections were made through commit `35980c40`. [CI run 42119685246](https://github.com/daboolgame123-creator/Saqa/actions/runs/42119685246), source `35980c40`, completed **SUCCESS** with no failed steps, including the actual container-rendered Arabic PDFs, existing output-integrity regression tests, database tests and final HTTP 503 guard.
- Downloaded and read [artifact 13458425259](https://github.com/daboolgame123-creator/Saqa/actions/runs/42119685246/artifacts/13458425259). The proof states `P1K_FILE_LIMIT_PASS max_bytes=12582912 attempt_bytes=13631488 exit=153`. This demonstrates kernel file-size enforcement **during a write**. The artifact also confirms `USER_NAMESPACE_DENIED exit=1`; the native Chromium sandbox is **still not approved**.
- **Important limitation:** `RLIMIT_FSIZE` caps **each individual file**, not the total bytes across multiple files or the total writable host-mounted directory. This does NOT close S5 disk-exhaustion safety. Required next: strict per-job output filesystem quota and aggregate-size accounting, process cleanup on failure, controlled host mounting and S2 sandbox approval before production. The existing test uses synthetic data only, and no security isolation flags were relaxed.

**Release unchanged:** P1k OPEN, S5 PARTIAL. All HTTP report routes remain 503; `main`, access scopes and user permissions unchanged.

## S5 isolated total-writable-output quota proof — 2026-11-06

- New `server/tests/p1kContainerTotalQuotaProbe.sh` (`d5fea060`) demonstrates an **aggregate** 32 MiB `tmpfs` output ceiling inside an unprivileged, offline, read-only-root, no-extra-capabilities Docker container with a separate 16 MiB temporary mount. The test retains the verified CI image reference by digest and the 12 MiB **per-file** `RLIMIT_FSIZE`.
- The probe writes three **separate** 10 MiB synthetic files, attempts a fourth 10 MiB file, and asserts that the fourth write **fails** even though each individual file is below the per-file limit. It then removes its test files, verifies an empty output directory, creates a recovery file and verifies its deletion. No real documents are involved.
- `.github/workflows/phase23-p1c.yml` (`3a39820f`) executes the probe before the existing containerized Chromium print and preserves its plain-text result in the regular synthetic artifact.
- [Actions run 42121549899](https://github.com/daboolgame123-creator/Saqa/actions/runs/42121549899) **completed SUCCESS** with the quota probe, Chromium synthetic printing, Arabic continuity, database suites, and report HTTP 503 verification. Downloaded and read [artifact 13459760566](https://github.com/daboolgame123-creator/Saqa/actions/runs/42121549899/artifacts/13459760566), which contains the precise verdict:

```text
P1K_TOTAL_QUOTA_PASS total_bytes=33554432 attempted_bytes=41943040 rejected=1 recovery=ok
```

**Interpretation:** this confirms a viable **separate, in-container bounded output filesystem** with aggregate capacity and post-failure recovery. It does **not** show that the existing Chromium print step writes into that filesystem: the baseline printer still uses a writable host bind mount to collect CI artifacts. It also does not validate total data written in Chromium's 256 MiB `/tmp` mount or the future institution host. **S5 remains PARTIAL** until the PDF rendering executor itself uses approved bounded per-job mounts and proves failure cleanup, aggregate disk pressure and process termination end-to-end.

**Next implementation:** migrate real *synthetic test* Chromium output capture to an aggregate-capped per-job store without unsafe host-tar extraction or broad privileges. Verify record continuity and cleanup again. Keep native Chromium sandbox approval and production HTTP routes blocked.
