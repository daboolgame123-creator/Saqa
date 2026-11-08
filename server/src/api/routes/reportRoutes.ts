/**
 * Phase 23 / C14 — official reports are prepared behind a code-level release
 * gate; NOT a runtime environment-variable or URL switch.
 *
 * All requests pass /api session, changed-secret, RBAC and scope middleware
 * before reaching this router (see ./index.ts). The gate defaults to denied.
 * PDF remains separately unavailable without an approved immutable Docker
 * worker and target-host acceptance.
 */
import { Router } from 'express';
import { OFFICIAL_REPORTS_RELEASE_APPROVED } from '../../../../src/core/reportReleaseGate';
import { createReportCandidateRouter } from './reportCandidateRoutes';

export function createReportRouter(): Router {
  const router = Router();

  // C14 fail-closed gate: preserve the exact original 503 HTTP contract.
  // A separate OWNER-APPROVED and reviewed code change is needed to open it.
  router.use((_req, res, next) => {
    if (!OFFICIAL_REPORTS_RELEASE_APPROVED) {
      res.status(503).json({
        error: { code: 'REPORTS_UNAVAILABLE', message: 'التقارير غير متاحة حالياً.' },
      });
      return;
    }
    next();
  });

  // The already-tested candidate is the ONLY implementation behind the gate.
  // No legacy unscoped report controller may be reachable on release.
  // An unapproved PDF worker still fails 503 REPORT_PDF_NOT_APPROVED.
  router.use(createReportCandidateRouter());
  return router;
}
