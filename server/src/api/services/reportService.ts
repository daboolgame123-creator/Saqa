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

import type { ReportFilter, ReportResponse, ReportSummary } from '../dto/report';
import type { ReportRepository, TransactionScopeFilter } from '../../repositories/contracts';

/** خدمة تقارير القراءة فقط. */
export class ReportApiService {
  constructor(private readonly reportRepository: ReportRepository) {}

  /**
   * يستخرج بيانات تقرير حسب النوع والفلتر ونطاق الوصول.
   * `scope` نطاق الوصول للمعاملات (من `transactionScopeOf` في controller).
   */
  async run(
    filter: ReportFilter,
    scope?: TransactionScopeFilter | null,
  ): Promise<ReportResponse> {
    const reportType = filter.reportType;
    const transactionScope = scope ?? null;

    const rows = await this.reportRepository.list(reportType, filter, transactionScope);

    const summary: ReportSummary = {
      totalCount: rows.length,
      period: this.buildPeriod(filter),
      appliedFilters: this.buildAppliedFilters(filter),
      generatedAt: new Date().toISOString(),
    };

    return { rows, summary };
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
