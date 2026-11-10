# ALSQAYA Phase 23 — C4 PDF Container Supply Chain and Target-Host Acceptance

**Date:** 2026-11-06
**Status:** PLAN / PREPARATORY_ONLY / OPEN; NO HOST OR IMAGE APPROVAL.
**Classification:** HYBRID for documentation/static inspection; EXTERNAL for actual image provenance, host control evaluation and PDF print approval.
**Safety boundary:** Existing HTTP `503 REPORTS_UNAVAILABLE` stays. Do not activate the renderer or report routes from this document.
**Dependency:** C2 production PDF worker launcher is not yet integrated; C4 host checks must be repeated against the *exact* final image, immutable digest and command that the launcher will use.

## 1. Verified baseline and remaining gaps

The synthetic ALT-09 test-only run demonstrated structured JSON → escaped fixed template → WeasyPrint inside a constrained Docker experiment. Its recorded controls included nonroot UID, network none, read-only root/input, no Linux capabilities, no-new-privileges, default seccomp, PID/CPU/memory/output/time limits. The historical CI result does **not** verify those restrictions on the intended institutional server, an immutable final image, approved font packages or future application launcher.

The phase 23 secure closure checklist records the mutable CI image base as **NOT APPROVED**. No verified production image digest, font file SHA-256 or license decision is available in the audited evidence; do not invent any of these values.

## 2. Blocking evidence: supply chain

1. Identify the **actual final production Dockerfile/build context** and runtime image chosen for C2. Record source repository, source commit, signed build provenance if supported, target OS/architecture and compatible runtime versions.
2. Resolve the base image to an **immutable repository digest** (`name@sha256:<64-hex>`) through a trusted registry at the time of approval. The digest must be checked in the actual Dockerfile/reference or deploy manifest; a mutable tag alone does not pass.
3. Record exact package list / lock state for WeasyPrint, Python and native libraries (Pango, Cairo, HarfBuzz/font stack where applicable), supported update policy and vulnerability review. Python requirements should use reviewed version pinning and immutable hashes where supported. No blanket package upgrade as a shortcut.
4. Record approved font **name, supplier, license, source, file SHA-256** and prove the build uses exactly that font version. Do not distribute font files in repository artifacts or reports if licensing prohibits it.
5. Record image digest and font/hash values in a signed-off deploy manifest/checklist, not a guessed placeholder. Document rebuild procedure for future security patches and how old digests are invalidated.
6. Security findings and vulnerabilities must be assessed according to exploitability in this actual isolated workload; do not claim a scan passed without an exact scanner report and image digest.

## 3. Blocking evidence: target-host isolation

Run the exact intended image under a **test-only synthetic payload**, not institutional data, on the destination server (or a clearly labeled staging host with identical kernel/security policy) and record:

- `docker version`, `docker info`, server OS/kernel and effective enforcement of namespaces, default seccomp, AppArmor/SELinux/LSM as applicable; container security options must not disable these controls.
- Runtime: `User` resolves to a non-root UID; `HostConfig.Privileged=false`; `ReadonlyRootfs=true`; `NetworkMode=none`; all capabilities dropped; `no-new-privileges`; restrictive PID/CPU/memory quotas; no host-network/PID/IPC namespaces.
- No writable bind mounts or sensitive host paths; any JSON input mount read-only and limited to isolated synthetic data. All output must be bounded and stored in a temporary, explicitly restricted location; no mounted institutional archive, DB socket, SSH key, Docker socket or host root.
- Proper tmpfs size/mode, per-process output limit and outer timeout/kill with cleanup. Check process and filesystem state **after** forced timeout and worker crash; reject partial PDFs and stray files.
- Demonstrate blocked network access and denied local file exfiltration without using or disclosing real secrets: test with unique synthetic sentinels, and assert the worker actually attempts and denies resource fetches.
- Confirm image architecture and font availability match final host, and isolation controls are applied to the **real child process launched by C2**, not merely a separate CLI experiment.

**Safe observation commands** (adapt to deployment tooling and record sanitized evidence; do not paste actual personnel documents or secrets):

```sh
docker version
docker info --format '{{json .SecurityOptions}}'
docker image inspect 'APPROVED_IMAGE_REFERENCE' --format '{{json .RepoDigests}}'
docker inspect 'SYNTHETIC_TEST_CONTAINER' --format '{{json .HostConfig}}'
docker inspect 'SYNTHETIC_TEST_CONTAINER' --format '{{json .Config.User}}'
```

The values `APPROVED_IMAGE_REFERENCE` and `SYNTHETIC_TEST_CONTAINER` are placeholders, not actual image or container names. Never run arbitrary commands received from report fields. Docker inspect output can contain environment values/mount paths; **redact secrets and paths before sharing logs or artifacts**.

## 4. Blocking evidence: Arabic PDF and report continuity

- Generate from the authorized service and real C2 handoff (once integrated), using a synthetic report with long RTL fields, mixed Arabic/ISO dates, beginning/middle/last pages, and acknowledgement details.
- Validate all expected synthetic record IDs/markers are present exactly once and in order, with no truncation or misleading timestamps. Inspect actual rasterized pages for legibility and correct Arabic shaping. No perfection requirement for cosmetic whitespace; **missing/ambiguous data are blockers**.
- Validate exported PDF structure, MIME, max bytes, no external URLs, and no callback or renderer exception that returns success-shaped partial bytes.
- Exercise the exact rollback/fail-closed behavior: if Docker is unavailable, image mismatches the pinned digest, fonts are absent or host enforcement is inadequate, the PDF operation remains unavailable and HTTP report gate stays closed.

## 5. Go/no-go checklist

| Required gate | Status at planning | Acceptable evidence |
|---|---|---|
| Final image and immutable digest | NOT VERIFIED | registry digest + deployed manifest + image inspect |
| Reviewed dependency versions/hashes | NOT VERIFIED | locked build and provenance/security assessment |
| Approved Arabic font/license/hash | NOT VERIFIED | recorded supplier/license/hash and image verification |
| Nonroot, no network/caps, readonly | HISTORIC CI ONLY | final-host inspect + adversarial synthetic execution |
| Seccomp/LSM and resource limits | HISTORIC CI ONLY | host configuration and verified runtime limits |
| No writable host mounts, temp cleanup | HISTORIC CI ONLY | host inspect + crash/timeout negative tests |
| Arabic PDF continuity/visual review | PARTIAL SYNTHETIC CI | final host sample output + reviewer notes |
| C2 application worker integration | NOT IMPLEMENTED | app-to-worker acceptance with failure paths |
| Independent operational sign-off | NOT DONE | named review decision, exact SHA and image digest |

**Final decision remains NO-GO until every blocker is satisfied.** Record conditions unsupported on the destination server as `BLOCKED`, not as passed; if the server is not yet available, park these host-only checks in the execution backlog and continue unrelated tasks permitted by the project policy.

## 6. Minimal handoff template

```yaml
task_id: "23-C4"
status: "WAITING_EXTERNAL"
branch_sha: "record actual SHA"
container_image_digest: "UNVERIFIED"
font_sha256: "UNVERIFIED"
font_license: "UNVERIFIED"
host_environment: "UNVERIFIED"
security_controls: "UNVERIFIED"
synthetic_pdf_qa: "NOT RUN"
timeout_crash_cleanup: "NOT RUN"
independent_review: "PENDING"
http_gate: "503 REPORTS_UNAVAILABLE -- must stay"
```

Document facts and exact run IDs/artifacts, not assumptions. This is a focused security acceptance task, not a mandate for endless cosmetic fine tuning.

## 7. C4-S1 — independent offline Docker inspect policy checker (2026-11-06)

**Classification: HYBRID, checkpoint VERIFIED only for synthetic static validation.** Branch `development/phase-23-c4-inspect-acceptance-20261106` was created from the Phase 23 branch, separately from the C2 draft PR and OpenCode's work.

Added `server/tests/c4ValidateContainerInspect.py`: a *read-only, offline* CLI that accepts JSON arrays from `docker inspect` and `docker image inspect` plus an immutable expected `registry/repository@sha256:<64 hex>` reference. It returns exit 0 and `INSPECT_FIELDS_PASS` only for the precise image digest and matching container image ID, numeric nonroot UID:GID, no privilege/network/host namespace/bind mounts, readonly root, dropped capabilities, no-new-privileges, bounded CPU/memory/PIDs, capped private tmpfs and an open stdin channel. It returns exit 1 on malformed/unacceptable evidence; it does not contact Docker.

Added `server/tests/test_c4_container_inspect.py` with **five synthetic allow/deny test groups** covering digest mismatch, privilege, network, mounts, quotas, image identity and invalid evidence. Dedicated GitHub Actions workflow `.github/workflows/phase23-c4-inspect.yml` ran at SHA `6eb76bea2c8c07e9656d51e2059a90eccc9dacc8`; run [42299537214](https://github.com/daboolgame123-creator/Saqa/actions/runs/42299537214), job `128173414948`: **Python AST syntax succeeded, five tests passed, zero failed**. These tests use fictitious image names and fixture inspect JSON. They do not pull or start a container.

**Host handoff (EXTERNAL, not executed):** On the approved test host, the operator first chooses/reviews the exact immutable image and starts **only a controlled synthetic test container** with the approved command. Store raw `docker inspect` output in an access-controlled, temporary local location (inspect may include sensitive environment values and filesystem paths); never upload raw inspect results to public CI, GitHub or chat. Run the offline verifier locally:

```sh
python3 server/tests/c4ValidateContainerInspect.py \
  --container /private/test-container-inspect.json \
  --image /private/test-image-inspect.json \
  --expected-image 'APPROVED_REGISTRY/alsqaya-pdf@sha256:REPLACE_WITH_REAL_DIGEST'
```

The command intentionally rejects the placeholder digest. Only after an operator has independently reviewed/redacted any evidence may sanitized PASS/FAIL results be attached to the acceptance record. Actual Docker/container cleanup after timeout, seccomp/LSM effective enforcement, font provenance and PDF Arabic correctness must all be demonstrated separately. `INSPECT_FIELDS_PASS` is **not** a host security certification.

**C4-S1 status:** `STATIC_CHECKER_TESTS_VERIFIED`; `TARGET_HOST_WAITING_EXTERNAL`; `PRODUCTION_IMAGE_DIGEST_UNVERIFIED`; `NO_GO`. The main development branch and HTTP `503 REPORTS_UNAVAILABLE` remain unchanged.
