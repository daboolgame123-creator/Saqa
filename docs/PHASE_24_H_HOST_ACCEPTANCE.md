# ALSQAYA — Phase 24-H institutional host acceptance (operational checklist)

**State:** `PREPARATORY_ONLY / HYBRID_WAITING_EXTERNAL / INSTITUTIONAL_RELEASE_NO_GO`  
**Reviewed technical baseline:** `phase-10-api-data-layer` at merge commit `07ed019fe022ea0f5d45c066adf0b6ba431f1aaf`; integration [PR #58](https://github.com/daboolgame123-creator/Saqa/pull/58).  
**Evidence:** five synthetic CI workflows PASS on the previously reviewed PR head `aba7414327fb2103444389c4df731ca34e441e0f`. No post-merge production-host run is claimed.

This checklist is **not an instruction to deploy**, and is not a certification of any institutional device. Use only with explicit administrator approval and a documented maintenance/test window. Do not enter secrets, personnel information, real attachment bytes or exact network maps in the Git repository.

## 1 — Identify the institutional acceptance session

| Field | Institution supplies; blank is NOT pass |
|---|---|
| Change ticket / written authorization | TBD |
| Assessment date and approved window | TBD |
| Server inventory ID / physical owner | TBD |
| Server OS / package version / patch status | TBD |
| CPU / memory / storage media / remaining usable capacity | TBD — do not assume reported future server size is real |
| LAN segmentation / firewall owner | TBD |
| Server administrator and backup custodian (two responsible roles) | TBD |
| Independent security assessor / business acceptance owner | TBD |
| Data classification and approved synthetic-only UAT dataset | TBD |
| Backup RPO/RTO targets, recovery priority, retention, off-site location | TBD — requires management decision |
| Evidence storage location and access classification | TBD |

**Rules:** Record each check as `PASS / FAIL / NOT_TESTED / NOT_APPLICABLE` with an evidence reference, date, machine build and approving role. `NOT_TESTED` is never a PASS. A PASS must describe the **observed institution-host behavior**, not cite Linux GitHub Actions alone. If the device is unavailable, leave the matrix NOT_TESTED and keep release NO_GO.

## 2 — Minimum institutional gates

| ID | Required verification on approved test host | Evidence / exact PASS criterion | Current |
|---|---|---|---|
| H01 | Asset, OS, storage capacity and patch inventory | Signed inventory; capacity for DB, attachment growth, backups and headroom; restore-time assumptions captured | NOT_TESTED |
| H02 | Segregation of test services from production and Internet | Approved network diagram, firewall rules and authorized inside-LAN connectivity checks; unapproved access denied | NOT_TESTED |
| H03 | OS and service account isolation | Named operator roles, non-admin runtime account, restricted file permissions, no shared institutional superuser credentials | NOT_TESTED |
| H04 | PostgreSQL instance and backup store isolation | Explicit instance ID, approved bind addresses, least-privilege DB accounts, verified test database distinct from institution | NOT_TESTED |
| H05 | Authenticated transport and secrets | Institution-approved TLS/internal-transport policy; secrets outside repo/logs; rotation and recovery custodian assigned | NOT_TESTED |
| H06 | Clock, audit and observability | Time synchronization/timezone documented; audit/ViewLog preservation and log access restricted; health and alerts testable | NOT_TESTED |
| B01 | Approved offline backup window | API/workers/attachments imports/direct DB writers all stopped by supervising operator; verification recorded for full snapshot period | NOT_TESTED |
| B02 | Full DB + attachment capture | Archive manifest, pg_dump/migration IDs, attachment stable keys, SHA-256 reconciliation, bytes and object counts; no partial or symlink entries | NOT_TESTED |
| B03 | Encryption, integrity and custody | Encrypted at rest and in transit; separately protected keys, immutable/off-site copy, retention and restoration credentials assigned | NOT_TESTED |
| B04 | Rehearsal on *isolated synthetic disposable* server | Empty test DB and file root; restore + application login/read/attachment hash; each original ViewLog and AuditLog count checked independently | NOT_TESTED |
| B05 | Documented recovery objectives | Management-approved RPO and RTO, exercise start/end and observed recovery completion recorded; exceeds target ⇒ FAIL | NOT_TESTED |
| P01 | Exact PDF renderer and font provenance | Approved immutable image digest **from target registry**, installed font checksum, license review; no reliance on mutable tags/local CI image ID | NOT_TESTED |
| P02 | Container confinement and crash cleanup | Effective target-host restrictions (nonroot, read-only, no network, restricted resources/caps), cancel/timeout/SIGKILL cleanup observed | NOT_TESTED |
| P03 | Human Arabic PDF sign-off | See `docs/PHASE_24_H_ARABIC_PDF_UAT.md`, with actual rendered pages and signed reviewer results; all mandatory cases pass | NOT_TESTED |
| S01 | App/authz/503 at approved host using synthetic data | Role/scope checks; unauthenticated denied; owner isolation; official `/api/reports` remains **503**; detached 24-C router remains unmounted | NOT_TESTED |
| S02 | Rollback and incident response | Written abort/rollback procedure, restore operator, alert and evidence preservation; dry-run with synthetic environment | NOT_TESTED |

## 3 — Backup/recovery rules: important safety differences

- Existing `ops/phase24_backup.py backup` is an **offline** logical backup tool, not an automatic point-in-time/always-online backup system. `--confirm-writers-stopped` is a human assertion, not technical proof that every writer stopped. The operator must document actual quiescence.
- Existing `ops/phase24_backup.py restore-test` is a **test-only** operation with mandatory loopback and disposable DB restrictions. **It must never be used on an institutional database or treated as the institution's production-recovery tool. Do not bypass or remove these guards.**
- A coherent `pg_dump` does **not** by itself give an atomic snapshot of separate filesystem attachments; enforce writer freeze until all corresponding bytes and metadata are captured and verified. A preexisting backup is not a recovery plan until an isolated recovery drill proves access to restored data.
- The backup manifest's SHA-256 detects corruption but not a privileged actor rewriting both manifest and files. Use institutional key control, immutable or signed backups and separately administered off-host copies.
- **Never** run exploratory `psql`, `pg_restore`, test data seeding, migrations or a firewall probe against an institutional host from this checklist. Production recovery is a **separate approved and reviewed** procedure, with authorized personnel and an explicit destination; none is provided here.
- Backups may embed sensitive personnel metadata. Keep manifests/dumps and test evidence in an institution-approved location, with least access and no publication into GitHub artifact storage.

## 4 — Existing verified synthetic evidence (NOT host acceptance)

| Technical slice | Test record | What it demonstrates |
|---|---|---|
| Combined F full suites | [run 42827888837](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888837) | 376 server, 226 migrated PG, 269 authenticated API, browser UAT, Docker/PDF and synthetic recovery, all jobs success |
| G recovered app readback | [run 42827888552](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888552) | Restored synthetic PostgreSQL+file read through real auth/Express API; independent log counts |
| D backup negative/restore | [run 42827888620](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888620) | Synthetic test-only verification; not a live restore |
| E image/font/PDF samples | [run 42827888697](https://github.com/daboolgame123-creator/Saqa/actions/runs/42827888697) | CI-only image/font fingerprints, PDF/XLSX evidence, **no host approval** |

**Time-sensitive evidence:** E's synthetic PDF preview artifact `13768934439` and CI image/font artifact `13769314124` were observed available with expiry **2026-11-17 13:51 UTC**. F's synthetic Docker/PDF evidence artifact `13769059081` was observed available through **2026-11-24 13:49 UTC**. These are not substitutes for target-host samples. Never infer that an expired artifact is still accessible.

## 5 — Approval and go/no-go decision

Institutional acceptance needs at least: host administrator (asset/OS/network controls), security assessor (segmentation/secrets/RBAC), backup/recovery operator (B01–B05), designated Arabic content reviewer (P03), and institution's authorized system owner (final decision). Individuals and signatures **TBD**; these are required *roles*, not invented named approvers.

| Gate group | Current evidence level | Decision |
|---|---|---|
| F+G technical integration in development | PR #58 merged to development; synthetic CI PASS | TECHNICALLY_VERIFIED |
| H01–H06 institution host and access controls | Not examined on institution host | NO_GO |
| B01–B05 operational backup, custody and restore | No authorized institution-host exercise | NO_GO |
| P01–P03 target Docker/font and human Arabic PDF | CI-only provenance; no host/human sign-off | NO_GO |
| S01–S02 approved-host API safety and incident process | No institution-host session | NO_GO |

**Decision algorithm:** any `FAIL` or mandatory `NOT_TESTED` ⇒ `INSTITUTIONAL_RELEASE_NO_GO`. A technical PR merge or CI success must never override this. Even when all rows pass, a separate owner-authorized release change, security review of any mounting/activation, and production deployment approval are required. No automatic HTTP 503 activation.

## 6 — Evidence worksheet for the actual authorized session

For every row above, record: `Gate ID | observed actual result | PASS/FAIL/NOT_TESTED | timestamp (with timezone) | host inventory ID | approved test fixture ID | evidence reference (protected storage) | executor role | reviewer role | signed decision | corrective action if FAIL`.

**No session results have been entered here. Status remains `HYBRID / WAITING_EXTERNAL / NO_GO`.**
