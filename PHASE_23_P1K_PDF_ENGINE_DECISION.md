# ALSQAYA Phase 23 / P1k — PDF engine decision study (2026-11-06)

Status: **PLAN / EXPERIMENTAL; NO PRODUCTION CHANGE**.

## Objective
Choose the simplest defensible Arabic PDF renderer, without enabling the report HTTP endpoints or weakening host security. The existing Chromium test is a reference baseline; its native sandbox fails on current CI (exit 133). Existing PDFKit export also remains a baseline.

## Primary-source research
- Playwright Docker: https://playwright.dev/docs/docker — separate non-root user and a reviewed seccomp profile that permits namespace creation; its published image is primarily a development/test image, not production approval.
- Chromium Ubuntu AppArmor userns: https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
- Ubuntu 24.04 release notes: https://documentation.ubuntu.com/release-notes/24.04/ — restricted unprivileged user namespaces; per-binary AppArmor policy is preferable to disabling host-wide restrictions.
- Docker seccomp: https://docs.docker.com/engine/security/seccomp/ — retain a reviewed restrictive policy, never use unconfined or SYS_ADMIN merely to pass a probe.
- WeasyPrint documentation: https://doc.courtbouillon.org/weasyprint/stable/ — HTML/CSS to PDF, font rendering via Pango/HarfBuzz, no Chromium browser process. Does not mean zero parsing/security risk.

## Candidates and tradeoffs

| Engine | Advantages | Risks / required proof |
|---|---|---|
| Chromium in reviewed sandbox | Already proved synthetic Arabic PDF continuity (85/38), familiar HTML/CSS print | Native sandbox blocked on CI; production browser isolation and updates require review |
| WeasyPrint in isolated worker | No full browser runtime; mature paged-print engine, Pango/HarfBuzz font handling | Separate Python runtime; URL fetcher must forbid network/local file access; Arabic BiDi, long tables, page breaks, fonts and extraction need tests |
| Existing PDFKit | Already integrated in Node; no browser process | Current Arabic visual/BiDi correctness must be compared; layout features differ |

## Decision criteria (must be verified, not assumed)
1. Arabic shaping, mixed Arabic/Latin numbers/dates, copy/search text and logical record order.
2. Complete 85 detail and 38 acknowledgement synthetic records, no duplicates or omissions, bounded page count and visual page-break review.
3. No remote fetches or arbitrary local file reads, restricted fonts and input; process isolation, no writable host mount, time/CPU/memory/PID/output quotas and crash cleanup.
4. Maintain trusted server-side access scoping, fixed template, output size limit and unchanged HTTP 503 gate.
5. Font license, runtime update policy, deployment host feasibility and independent security approval.

## Planned experiment — P1k-ALT-01
**Before implementation:** create a CI-only WeasyPrint probe with pinned package version, synthetic existing HTML fixtures, a URL fetcher that rejects external/local resource access, bounded output and an explicit artifact for extraction/visual comparison. This is not a production dependency or report endpoint. Fail closed if dependency installation or rendering is unavailable; never silently pass. Compare results to the existing Chromium proof. If successful, proceed to a separate production-executor design; otherwise keep Chromium sandbox investigation open.

## Release decision
No renderer is production approved. Do not disable host AppArmor restrictions, grant SYS_ADMIN, enable seccomp=unconfined or expose the report routes. Explicit sign-off and real target-host verification remain required.

## ALT-01 execution and measured result — 2026-11-06

The research and plan above were committed **before implementation** as `aa92a0d9`. The synthetic-only WeasyPrint pilot was added in `c5c2b8e6`, wired into CI in `618b0cd4`, and its fixture-ordering issue corrected in `bb8e7b08`. The first workflow `42134295022` **failed** because the synthetic HTML files were generated later in the pipeline; this was a test setup error, not a PDF rendering defect. The corrected workflow [42134455934](https://github.com/daboolgame123-creator/Saqa/actions/runs/42134455934) **completed SUCCESS**.

**Observed proof from the passing CI job logs:**
- `P1K_WEASYPRINT_CONTINUITY_PASS kind=details records=85 bytes=43814`
- `P1K_WEASYPRINT_CONTINUITY_PASS kind=ack records=38 bytes=22821`

Both PDFs were generated from the same existing synthetic Arabic HTML fixtures as Chromium, and `pdftotext` recovered all numbered records in order with ISO timestamps. WeasyPrint was installed in CI as version `66.0` (not added as a production application dependency). Its URL fetcher rejects all external resources, and PDFs are bounded to 12,000,000 bytes. The existing Chromium and report security workflow tests remained green.

**Decision:** WeasyPrint is a **viable candidate** and warrants a second-stage comparison of visual Arabic shaping, line wraps, pagination, font licenses, dependency supply chain, and isolation under adversarial inputs. This proof does **not** establish comprehensive absence of filesystem access, a complete sandbox, or safe production deployment. Do not replace Chromium or PDFKit yet. Prefer a dedicated isolated WeasyPrint worker if later security and quality checks pass. Keep the Chromium-native sandbox issue recorded as unresolved rather than weakening the host. Reports remain HTTP 503.

**Next plan-first checkpoint:** visual side-by-side PDF review and strict offline/denied-resource test cases for WeasyPrint, then a threat-modelled executor and bounded subprocess with no sensitive mounts. No institutional documents in tests.
