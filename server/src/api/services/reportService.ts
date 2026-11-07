/**
 * خدمة تقارير المرحلة 23 — Reports + Statistics + Export.
 *
 * المرجع: `ALSQAYA_PLAN.md` §39.
 *
 * طبقة الخدمة تستدعي مستودع التقارير وتُعيد DTOs النقل. لا تحقق ولا صلاحيات
 * هنا (تفرضها middleware على المسار)، ولا منطق أعمال مخترع.
 *
 * القراءة فقط — لا تُنشئ ولا تُعدّل أي سجل أصلي أثناء توليد التقارير.
 */

import type { BookReportStatistics, ReportFilter, ReportResponse, ReportSummary } from '../dto/report';
import type { ReportRepository, ReportAccessContext } from '../../repositories/contracts';
import { assertReportAccess } from '../../authorization/reportAccess';
import { buildReportExportModel, renderReportExport } from './reportExport';
import { runInternalPdfWorker, type InternalPdfWorkerConfig } from './reportPdfWorker';
import { runManagedDockerPdfWorker, type TrustedDockerPdfConfig } from './reportDockerPdfWorker';
import type { ExportResult } from '../dto/report';

/** خدمة تقارير القراءة فقط. */
export class ReportApiService {
  constructor(private readonly reportRepository: ReportRepository) {}

  /**
   * يستخرج بيانات تقرير حسب النوع والفلتر ونطاق الوصول.
   * `access` comes from the trusted session and contains distinct source scopes.
   */
  async run(
    filter: ReportFilter,
    access: ReportAccessContext,
  ): Promise<ReportResponse> {
    const reportType = filter.reportType;
    // Fail before any repository/SQL read for missing or unverified scopes.
    assertReportAccess(access, reportType);
    if (reportType === 'circularsAndAcknowledgements') {
      const result = await this.reportRepository.readCircularAcknowledgements(filter, access);
      return {
        rows: result.circulars,
        summary: {
          totalCount: result.statistics.circularCount,
          period: this.buildPeriod(filter),
          appliedFilters: this.buildAppliedFilters(filter),
          generatedAt: new Date().toISOString(),
        },
        circularAcknowledgements: {
          acknowledgements: result.acknowledgements,
          statistics: result.statistics,
        },
      };
    }
    const rows = await this.reportRepository.list(reportType, filter, access);

    const summary: ReportSummary = {
      totalCount: rows.length,
      ...(reportType === 'monthly' || reportType === 'situation'
        ? { bookStatistics: this.summarizeBooks(rows) }
        : {}),
      period: this.buildPeriod(filter),
      appliedFilters: this.buildAppliedFilters(filter),
      generatedAt: new Date().toISOString(),
    };

    return { rows, summary };
  }

  /** Internal-only: exact same authorized payload feeds both screen and file.
   * HTTP report/export endpoints remain blocked independently by 503.
   */
  async export(
    filter: ReportFilter,
    access: ReportAccessContext,
    format: 'excel' | 'pdf',
    options: { arabicPdfFont?: Buffer } = {},
  ): Promise<ExportResult> {
    const report = await this.run(filter, access);
    return renderReportExport(format, filter.reportType, report, options);
  }

  /**
   * Internal-only C2 handoff: trusted session-derived access → authorized
   * report rows → checked display model → DATA-ONLY worker stdin → PDF bytes.
   *
   * The worker's executable and arguments MUST be fixed deployer-owned
   * configuration; they must never be derived from a user request. This method
   * is NOT wired to HTTP and does not approve the target container host.
   * The global REPORTS_UNAVAILABLE HTTP 503 guard remains independent.
   * Legacy PDFKit and XLSX paths are deliberately unchanged.
   */
  async exportIsolatedPdf(
    filter: ReportFilter,
    access: ReportAccessContext,
    workerConfig: InternalPdfWorkerConfig,
    signal?: AbortSignal,
  ): Promise<ExportResult> {
    const report = await this.run(filter, access);
    const model = buildReportExportModel(filter.reportType, report);
    const content = await runInternalPdfWorker(model, workerConfig, signal);
    return {
      format: 'pdf',
      fileName: 'alsqaya-' + filter.reportType + '.pdf',
      content,
      mimeType: 'application/pdf',
    };
  }

  /**
   * Internal-only C2/C4 candidate using a fixed Docker runtime supervisor.
   * Same trusted access and SQL-scoped report model as exportIsolatedPdf, but
   * the Docker daemon container is force-removed and its absence verified on
   * all return paths. No official HTTP route calls this method.
   * A target-host watchdog and final image/font approval remain mandatory.
   */
  async exportManagedDockerPdf(
    filter: ReportFilter,
    access: ReportAccessContext,
    dockerConfig: TrustedDockerPdfConfig,
    signal?: AbortSignal,
  ): Promise<ExportResult> {
    const report = await this.run(filter, access);
    const model = buildReportExportModel(filter.reportType, report);
    const content = await runManagedDockerPdfWorker(model, dockerConfig, signal);
    return {
      format: 'pdf',
      fileName: 'alsqaya-' + filter.reportType + '.pdf',
      content,
      mimeType: 'application/pdf',
    };
  }

  /** Counts are derived from the very same SQL-scoped rows as details:
   * no second unscoped or independently filtered aggregate query. */
  private summarizeBooks(
    rows: readonly { type?: string; status?: string }[],
  ): BookReportStatistics {
    const stats: BookReportStatistics = {
      totalBooks: rows.length,
      incoming: 0, outgoing: 0, internal: 0,
      statuses: { 'قيد المراجعة': 0, 'مكتمل': 0 },
    };
    for (const row of rows) {
      switch (row.type) {
        case 'وارد': stats.incoming++; break;
        case 'صادر': stats.outgoing++; break;
        case 'داخلي': stats.internal++; break;
        default: throw new Error('Unexpected book direction in report result');
      }
      switch (row.status) {
        case 'قيد المراجعة': stats.statuses['قيد المراجعة']++; break;
        case 'مكتمل': stats.statuses['مكتمل']++; break;
        default: throw new Error('Unexpected book status in report result');
      }
    }
    return stats;
  }

  private buildPeriod(filter: ReportFilter): string | undefined {
    if (filter.dateFrom && filter.dateTo) {
      return `${filter.dateFrom} إلى ${filter.dateTo}`;
    }
    if (filter.dateFrom) {
      return `من ${filter.dateFrom}`;
    }
    if (filter.dateTo) {
      return `إلى ${filter.dateTo}`;
    }
    return undefined;
  }

  private buildAppliedFilters(filter: ReportFilter): Record<string, string> {
    const filters: Record<string, string> = {};
    if (filter.reportType) filters['نوع التقرير'] = filter.reportType;
    if (filter.dateFrom) filters['التاريخ من'] = filter.dateFrom;
    if (filter.dateTo) filters['التاريخ إلى'] = filter.dateTo;
    if (filter.documentDateFrom) filters['تاريخ الكتاب من'] = filter.documentDateFrom;
    if (filter.documentDateTo) filters['تاريخ الكتاب إلى'] = filter.documentDateTo;
    if (filter.section) filters['القسم'] = filter.section;
    if (filter.type) filters['النوع'] = filter.type;
    if (filter.employee) filters['المنتسب'] = filter.employee;
    if (filter.status) filters['الحالة'] = filter.status;
    if (filter.source) filters['المصدر'] = filter.source;
    return filters;
  }
}

/** نوع التقرير المستخدم في اختيار نوع التصدير. */
export type ExportFormat = 'excel' | 'pdf';
