/** Phase 23 C7a — detached candidate report transport, NOT a live endpoint.
 *
 * The production createReportRouter installs an unconditional HTTP 503 before
 * this router. Do not mount this router elsewhere or remove the 503 without
 * independent authorization, target-host approval and an explicit release.
 *
 * Authentication, view permission and access scopes are mounted by the main
 * /api router. These controllers use ONLY validated query fields and identity
 * derived from the trusted server session; format never becomes a SQL filter.
 */
import { Router } from 'express';
import type { Validator } from '../../validation/validationTypes';
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import { reportAccessOf } from '../../authorization/reportAccess';
import type { ReportFilter } from '../dto/report';
import type { TrustedDockerPdfConfig } from '../services/reportDockerPdfWorker';
import { ReportExportUnavailableError } from '../services/reportExport';
import { servicesOf } from '../serviceContext';
import { asyncHandler, validatedQuery } from '../controllers/shared';
import { reportController } from '../controllers/reportController';
import { reportQuery } from '../validation/reportValidators';
import { validateApiRequest } from '../validation/validateApiRequest';

export type ReportExportFormat = 'excel' | 'pdf';
export type ReportExportQuery = ReportFilter & { format: ReportExportFormat };

/** Preserve the existing reportQuery normalization and unknown-field rejection. */
export const reportExportQuery: Validator<unknown, ReportExportQuery> = input => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalidOutcome([issue('format', 'صيغة التصدير مطلوبة.')]);
  }
  const fields = input as Record<string, unknown>;
  const format = fields.format;
  if (format !== 'excel' && format !== 'pdf') {
    return invalidOutcome([issue('format', 'صيغة التصدير غير معتمدة.')]);
  }
  const reportFields = { ...fields };
  delete reportFields.format;
  const checked = reportQuery(reportFields);
  if (checked.kind === 'invalid') return checked;
  return validOutcome({ ...checked.value, format });
};

const MAX_EXPORTED_BINARY_BYTES = 16_000_000;

/** NEVER directly mounted at /api/reports while Phase 23 is closed. */
export function createReportCandidateRouter(pdfConfig?: TrustedDockerPdfConfig): Router {
  const router = Router();
  // No authenticated report preview or export response may enter browser or
  // intermediary HTTP caches. This is defense-in-depth beyond the 503 gate.
  router.use((_req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.setHeader('X-Content-Type-Options','nosniff');
    next();
  });
  router.get(
    '/',
    validateApiRequest({ query: { validator: reportQuery } }),
    reportController,
  );
  router.get(
    '/export',
    validateApiRequest({ query: { validator: reportExportQuery } }),
    asyncHandler(async (req, res) => {
      const { format, ...filter } = validatedQuery<ReportExportQuery>(req);
      // Do not query SQL, construct a PDF or spawn Docker if the host
      // independently approved no immutable worker configuration.
      if (format === 'pdf' && pdfConfig === undefined) {
        res.status(503).json({
          error: { code: 'REPORT_PDF_NOT_APPROVED', message: 'تصدير PDF غير معتمد على هذا الخادم.' },
        });
        return;
      }
      const access = reportAccessOf(req);
      const report = servicesOf(req).report;
      const result = format === 'excel'
        ? await report.export(filter, access, 'excel')
        : await report.exportManagedDockerPdf(filter, access, pdfConfig!);

      // Never trust an exported file name or MIME derived from request data.
      const extension = format === 'excel' ? 'xlsx' : 'pdf';
      const mime = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';
      if (result.format !== format || result.mimeType !== mime ||
          !Buffer.isBuffer(result.content) || result.content.length < 64 ||
          result.content.length > MAX_EXPORTED_BINARY_BYTES ||
          (format === 'excel' && result.content.subarray(0, 2).toString('ascii') !== 'PK') ||
          (format === 'pdf' && result.content.subarray(0, 5).toString('ascii') !== '%PDF-')) {
        throw new ReportExportUnavailableError('Invalid report export bytes');
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="alsqaya-' + filter.reportType + '.' + extension + '"',
      );
      res.status(200).send(result.content);
    }),
  );
  return router;
}
