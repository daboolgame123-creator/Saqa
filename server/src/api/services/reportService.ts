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
