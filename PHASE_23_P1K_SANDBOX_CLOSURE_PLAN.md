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
| P1k-S1 | Diagnose namespace/sandbox permissions without changing host policy | Reproducible synthetic CI logs distinguish the Chromium error and effective runtime/userns capability; record kernel and container restrictions; no sensitive data | **IN PROGRESS** |
| P1k-S2 | Compare candidate sandbox configurations in a dedicated test environment | Native Chromium sandbox runs without `--no-sandbox` **and** preserves non-root, default-deny network, approved mounts, read-only root and adequate seccomp/AppArmor constraints. No globally weakened host controls | NOT STARTED |
| P1k-S3 | Pin browser image and evaluate updates | Reviewed immutable image digest and browser version documented; vulnerability/dependency assessment, font provenance and routine patch/retest plan approved | NOT STARTED |
| P1k-S4 | Design isolated renderer executor | Export service can only request a bounded render job; trusted server-side authorization; no caller-controlled browser path or flags; one-job quotas, deterministic cleanup, checked output; no application host filesystem exposure | NOT STARTED |
| P1k-S5 | Stress and failure-injection tests | Resource pressure tests (memory, CPU, PIDs, disk), browser crash/timeout, broken output, concurrent requests, input manipulation, and denial of filesystem/network attempts; recovery leaves no residual process/file | NOT STARTED |
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
