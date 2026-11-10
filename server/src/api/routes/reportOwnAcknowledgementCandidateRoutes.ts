/** Phase 24-C: detached test-only transport. NOT imported by production routes
 * or the UI. No environment switch may publish it. Keeps own history separate
 * from privileged circular statistics and the general report service.
 */
import { Router } from 'express';
import type { ErrorRequestHandler } from 'express';
import type { Db } from '../../repositories/shared';
import type { ReportFilter } from '../../repositories/contracts';
import type { Validator } from '../../validation/validationTypes';
import { invalidOutcome, issue } from '../../validation/validationTypes';
import { requireSession, requireChangedSecret } from '../../auth/sessionMiddleware';
import { requirePermission, requireRole } from '../../authorization/requirePermission';
import { reportAccessOf, ReportScopeNotReadyError } from '../../authorization/reportAccess';
import { ReportDateZoneRequiredError } from '../../repositories/reportRepository';
import {
  runOwnAcknowledgementReport, exportOwnAcknowledgementsExcel,
  OwnAcknowledgementExportError,
} from '../services/reportOwnAcknowledgements';
import { asyncHandler, validatedQuery } from '../controllers/shared';
import { reportQuery } from '../validation/reportValidators';
import { validateApiRequest } from '../validation/validateApiRequest';

/** Fix the source server-side; never normalize away forbidden empty fields. */
export const ownAcknowledgementQuery: Validator<unknown, ReportFilter> = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalidOutcome([issue('query', 'فلاتر غير صالحة.')]);
  }
  const fields = input as Record<string, unknown>;
  for (const key of Object.keys(fields)) {
    if (!['dateFrom', 'dateTo', 'status'].includes(key) || typeof fields[key] !== 'string') {
      return invalidOutcome([issue('query', 'فلتر غير مسموح أو مكرر.')]);
    }
  }
  return reportQuery({ ...fields, reportType: 'circularsAndAcknowledgements' });
};

/** Caller supplies trusted server dependencies and useAuthService context.
 * Authentication is inside this factory, not a caller-supplied req.auth stub.
 */
export function createOwnAcknowledgementCandidateRouter(
  db: Db, dateTimeZone: string | null,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.use(requireSession(), requireChangedSecret(), requirePermission('view'), requireRole('employee'));
  router.get('/', validateApiRequest({ query: { validator: ownAcknowledgementQuery } }),
    asyncHandler(async (req, res) => {
      const access = reportAccessOf(req);
      res.json(await runOwnAcknowledgementReport(db, validatedQuery<ReportFilter>(req), access, dateTimeZone));
    }));
  router.get('/export', validateApiRequest({ query: { validator: ownAcknowledgementQuery } }),
    asyncHandler(async (req, res) => {
      const access = reportAccessOf(req);
      const content = await exportOwnAcknowledgementsExcel(
        db, validatedQuery<ReportFilter>(req), access, dateTimeZone,
      );
      if (!Buffer.isBuffer(content) || content.length < 64 || content.length > 16_000_000 ||
          content.subarray(0, 2).toString('ascii') !== 'PK') {
        throw new OwnAcknowledgementExportError('Invalid export bytes');
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="alsqaya-own-acknowledgements.xlsx"');
      res.status(200).send(content);
    }));
  const expectedFailure: ErrorRequestHandler = (error, _req, res, next) => {
    if (error instanceof OwnAcknowledgementExportError || error instanceof ReportDateZoneRequiredError) {
      res.status(503).json({ error: { code: 'OWN_ACKNOWLEDGEMENTS_UNAVAILABLE', message: 'إقراراتي غير متاحة حالياً.' } });
      return;
    }
    if (error instanceof ReportScopeNotReadyError) {
      res.status(403).json({ error: { code: 'OWN_ACKNOWLEDGEMENTS_DENIED', message: 'غير مسموح.' } });
      return;
    }
    next(error);
  };
  router.use(expectedFailure);
  return router;
}
